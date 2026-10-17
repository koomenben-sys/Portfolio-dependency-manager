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
alter table discussion_items drop constraint if exists discussion_items_check;  -- allow cross-cutting items (no epic, no dependency)
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
  if _table not in ('epic_plans','quarters','team_capacity','dependencies') then raise exception 'table not allowed'; end if;
  perform set_config('app.reason', coalesce(_reason, ''), true);
  select string_agg(format('%I = (%L)::%s', key, value #>> '{}',
           (select format_type(a.atttypid, a.atttypmod) from pg_attribute a where a.attrelid = _table::regclass and a.attname = key)), ', ')
    into cols from jsonb_each(_patch);
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
