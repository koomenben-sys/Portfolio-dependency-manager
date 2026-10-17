-- ============================================================================
-- 005_review_round2.sql  -  changes from the MVP validation round (docs/design.md section 16)
-- ----------------------------------------------------------------------------
-- * dependencies: needed_by, requester_name, granted effort for partial answers
-- * epics: regulation name, external_state (from the source system)
-- * quarters: votes_revealed (simultaneous reveal of the confidence vote)
-- * org_settings: per-organisation settings (check-in cadence, vote blocks lock)
-- * update_plan_with_reason(): lets the client pass the reason the triggers read
-- Additive and re-runnable.
-- ============================================================================

alter table dependencies add column if not exists needed_by      date;
alter table dependencies add column if not exists requester_name text not null default '';
alter table dependencies add column if not exists granted_low    numeric(5,1);
alter table dependencies add column if not exists granted_high   numeric(5,1);
alter table dependencies add column if not exists acknowledged_at timestamptz;
alter table dependencies add column if not exists resent_at       timestamptz;
alter table discussion_items add column if not exists team_id uuid;
alter table discussion_items drop constraint if exists discussion_items_team_fk;
alter table discussion_items add constraint discussion_items_team_fk foreign key (org_id, team_id) references teams(org_id, id) on delete set null (team_id);
-- Allow cross-cutting discussion items (no epic, no dependency): drop the auto-named check that requires one.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'discussion_items'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%epic_id IS NOT NULL%'
  loop execute format('alter table discussion_items drop constraint %I', c.conname); end loop;
end $$;
alter table dependencies drop constraint if exists dependencies_granted_chk;
alter table dependencies add constraint dependencies_granted_chk
  check (response <> 'partial' or (granted_high is not null and granted_high >= coalesce(granted_low, 0) and granted_high <= effort_high));

alter table epics add column if not exists regulation     text not null default '';
alter table epics add column if not exists external_state text;

alter table quarters add column if not exists votes_revealed boolean not null default false;

create table if not exists org_settings (
  org_id           uuid primary key references organisations(id) on delete cascade,
  stale_days       int  not null default 14 check (stale_days between 1 and 90),
  vote_blocks_lock boolean not null default false
);
alter table org_settings enable row level security;
drop policy if exists org_settings_read on org_settings;
drop policy if exists org_settings_admin on org_settings;
create policy org_settings_read  on org_settings for select using ((select is_member(org_id)));
create policy org_settings_admin on org_settings for all    using ((select is_admin(org_id))) with check ((select is_admin(org_id)));
insert into org_settings (org_id) select id from organisations on conflict do nothing;

-- Generic "write with reason": sets app.reason for this transaction, then applies the update.
-- _table is whitelisted; _patch is a jsonb object of column -> value.
create or replace function update_with_reason(_table text, _id uuid, _patch jsonb, _reason text)
returns void language plpgsql security invoker as $$
declare cols text;
begin
  if _table not in ('epic_plans','quarters','dependencies') then raise exception 'table not allowed'; end if;
  perform set_config('app.reason', coalesce(_reason, ''), true);
  select string_agg(format('%I = (%L)::%s', key, value #>> '{}',
           (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = _table::regclass and a.attname = key and a.attnum > 0)), ', ')
    into cols from jsonb_each(_patch)
   where exists (select 1 from pg_attribute a where a.attrelid = _table::regclass and a.attname = key and a.attnum > 0);
  if cols is null then raise exception 'nothing to update'; end if;
  execute format('update %I set %s where id = %L', _table, cols, _id);
end $$;

-- Deleting a plan or dependency after lock should also carry a reason: log via app.reason-aware trigger.
create or replace function log_delete() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
  values (old.org_id, auth.uid(), tg_table_name || '_removed', tg_table_name, old.id, old.quarter_id,
          coalesce(current_setting('app.reason', true), ''), to_jsonb(old), null);
  return old;
end $$;
drop trigger if exists epic_plans_delete_log on epic_plans;
create trigger epic_plans_delete_log before delete on epic_plans for each row execute function log_delete();
drop trigger if exists dependencies_delete_log on dependencies;
create trigger dependencies_delete_log before delete on dependencies for each row execute function log_delete();

create or replace function delete_with_reason(_table text, _id uuid, _reason text)
returns void language plpgsql security invoker as $$
begin
  if _table not in ('epic_plans','dependencies') then raise exception 'table not allowed'; end if;
  perform set_config('app.reason', coalesce(_reason, ''), true);
  execute format('delete from %I where id = %L', _table, _id);
end $$;

-- Capacity formula aligned with the app (focus factor applies to absence as well):
-- available = (headcount * weeks - absence) * focus * (1 - reserve%)
create or replace view team_load with (security_invoker = true) as
select c.org_id, c.team_id, c.quarter_id,
       greatest(0, c.headcount * c.weeks - c.absence_weeks) * c.focus_factor * (1 - c.reserve_pct / 100.0) as available,
       coalesce((select sum(p.effort_low)  from epic_plans p join epics e on e.org_id = p.org_id and e.id = p.epic_id
                  where e.org_id = c.org_id and e.team_id = c.team_id and p.quarter_id = c.quarter_id and p.commitment <> 'not_committed'), 0) as own_low,
       coalesce((select sum(p.effort_high) from epic_plans p join epics e on e.org_id = p.org_id and e.id = p.epic_id
                  where e.org_id = c.org_id and e.team_id = c.team_id and p.quarter_id = c.quarter_id and p.commitment <> 'not_committed'), 0) as own_high,
       coalesce((select sum(case when d.response = 'partial' then coalesce(d.granted_low, d.effort_low) else d.effort_low end) from dependencies d
                  where d.org_id = c.org_id and d.provider_team_id = c.team_id and d.quarter_id = c.quarter_id and d.response in ('accepted','partial')), 0) as incoming_low,
       coalesce((select sum(case when d.response = 'partial' then coalesce(d.granted_high, d.effort_high) else d.effort_high end) from dependencies d
                  where d.org_id = c.org_id and d.provider_team_id = c.team_id and d.quarter_id = c.quarter_id and d.response in ('accepted','partial')), 0) as incoming_high
from team_capacity c;

-- Epic team change: re-route its asks and refuse a self-dependency (mirrors the mock adapter).
create or replace function epic_team_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.team_id is distinct from old.team_id then
    if exists (select 1 from dependencies d where d.org_id = new.org_id and d.epic_id = new.id and d.provider_team_id = new.team_id) then
      raise exception 'This epic asks the new team for something; remove that ask first';
    end if;
    update dependencies set requester_team_id = new.team_id where org_id = new.org_id and epic_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists epics_team_changed on epics;
create trigger epics_team_changed after update of team_id on epics for each row execute function epic_team_changed();

-- Plan writes: rank permission alone may only change strategic_rank; updated_at only bumps on real changes.
create or replace function log_epic_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare reason text := coalesce(current_setting('app.reason', true), '');
        team uuid;
begin
  select team_id into team from epics where org_id = new.org_id and id = new.epic_id;
  if not can_write_team(new.org_id, team) then
    if new.commitment is distinct from old.commitment or new.effort_low is distinct from old.effort_low
       or new.effort_high is distinct from old.effort_high or new.confidence is distinct from old.confidence then
      raise exception 'Rank permission lets you change the strategic rank only';
    end if;
  end if;
  if new.strategic_rank is distinct from old.strategic_rank then
    if not can_rank(new.org_id) then raise exception 'strategic_rank requires can_rank'; end if;
    if length(trim(reason)) = 0 then raise exception 'a reason is required to change strategic_rank'; end if;
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'rank_changed', 'epic_plans', new.id, new.quarter_id, reason,
            jsonb_build_object('strategic_rank', old.strategic_rank), jsonb_build_object('strategic_rank', new.strategic_rank));
  end if;
  if new.commitment is distinct from old.commitment then
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'commitment_changed', 'epic_plans', new.id, new.quarter_id, reason,
            jsonb_build_object('commitment', old.commitment), jsonb_build_object('commitment', new.commitment));
  end if;
  if new.effort_low is distinct from old.effort_low or new.effort_high is distinct from old.effort_high then
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'effort_changed', 'epic_plans', new.id, new.quarter_id, reason,
            jsonb_build_object('effortLow', old.effort_low, 'effortHigh', old.effort_high),
            jsonb_build_object('effortLow', new.effort_low, 'effortHigh', new.effort_high));
  end if;
  if row(new.*) is distinct from row(old.*) then new.updated_at := now(); end if;
  return new;
end $$;
