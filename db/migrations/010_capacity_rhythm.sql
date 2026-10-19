-- ============================================================================
-- 010_capacity_rhythm.sql  -  Release B "Capaciteit & ritme" (docs/design.md section 22, D50-D56)
-- ----------------------------------------------------------------------------
-- * team_capacity.fte_vacant: vacancies, shown as "+Y pw als gevuld", never added to the available capacity.
--   headcount = FTE ingevuld, absence_weeks = verlofweken (team total), reserve_pct = run %. weeks / focus_factor
--   stay for older rows but are no longer read by the core screens (working days come from the calendar).
-- * epic_plans.size (S | M | L | XL; the app writes the mapped range into effort_low / effort_high),
--   epic_plans.delivered ("Geleverd" on Afsluiten).
-- * dependencies.size, dependencies.certainty (requester only), dependencies.signal / signal_note / signal_at /
--   confirmed_at (provider only, committed asks only).
-- * dependency_guard() is replaced: size / certainty join the requester-only columns, the signal columns are
--   provider-only; log_epic_plan() is replaced so a rank-only user cannot change size or delivered either.
-- The size -> pw mapping and the steering cadence live in org_settings.profile (sizeMap, cadence; no SQL).
-- Policies are unchanged: capacity_write (own team), epic_plans_write, deps_write cover the new columns.
-- Additive and re-runnable. Run after 001-009.
-- ============================================================================

alter table team_capacity add column if not exists fte_vacant numeric(4,1) not null default 0;
alter table team_capacity drop constraint if exists team_capacity_fte_vacant_chk;
alter table team_capacity add constraint team_capacity_fte_vacant_chk check (fte_vacant >= 0);

alter table epic_plans add column if not exists size      text;
alter table epic_plans add column if not exists delivered boolean not null default false;
alter table epic_plans drop constraint if exists epic_plans_size_chk;
alter table epic_plans add constraint epic_plans_size_chk check (size is null or size in ('S','M','L','XL'));

alter table dependencies add column if not exists size         text;
alter table dependencies add column if not exists certainty    text not null default 'medium';
alter table dependencies add column if not exists signal       text not null default 'on_track';
alter table dependencies add column if not exists signal_note  text not null default '';
alter table dependencies add column if not exists signal_at    timestamptz;
alter table dependencies add column if not exists confirmed_at timestamptz;
alter table dependencies drop constraint if exists dependencies_size_chk;
alter table dependencies add constraint dependencies_size_chk check (size is null or size in ('S','M','L','XL'));
alter table dependencies drop constraint if exists dependencies_certainty_chk;
alter table dependencies add constraint dependencies_certainty_chk check (certainty in ('low','medium','high'));
alter table dependencies drop constraint if exists dependencies_signal_chk;
alter table dependencies add constraint dependencies_signal_chk check (signal in ('on_track','at_risk','wont_make'));

-- Asks (replaces 007): requester edits the ask incl. size / certainty, provider answers and signals ----------
create or replace function dependency_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _req uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;      -- SQL editor / service role
  if tg_op = 'DELETE' then
    select team_id into _req from epics where org_id = old.org_id and id = old.epic_id;
    if _req is not null and not can_write_team(old.org_id, _req) then   -- null: cascade from a deleted epic
      raise exception 'Only the requesting team can remove the ask';
    end if;
    return old;
  end if;
  select team_id into _req from epics where org_id = new.org_id and id = new.epic_id;
  if tg_op = 'INSERT' then
    if not can_write_team(new.org_id, _req) then raise exception 'Only the requesting team can add an ask'; end if;
    return new;
  end if;
  if (new.ask, new.if_declined, new.effort_low, new.effort_high, new.needed_by, new.quarter_id, new.epic_id, new.provider_team_id, new.size, new.certainty)
     is distinct from (old.ask, old.if_declined, old.effort_low, old.effort_high, old.needed_by, old.quarter_id, old.epic_id, old.provider_team_id, old.size, old.certainty)
     and not can_write_team(new.org_id, _req) then
    raise exception 'Only the requesting team can edit the ask';
  end if;
  if new.response <> 'proposed'
     and (new.response, new.response_reason, new.granted_low, new.granted_high, new.deferred_to_quarter_id)
         is distinct from (old.response, old.response_reason, old.granted_low, old.granted_high, old.deferred_to_quarter_id)
     and not can_write_team(new.org_id, new.provider_team_id) then
    raise exception 'Only the provider team can answer';
  end if;
  if (new.signal, new.signal_note, new.signal_at, new.confirmed_at)
     is distinct from (old.signal, old.signal_note, old.signal_at, old.confirmed_at) then
    if not can_write_team(new.org_id, new.provider_team_id) then raise exception 'Only the provider team can set a signal'; end if;
    if new.response not in ('accepted', 'partial') then raise exception 'Signals apply to committed asks only'; end if;
  end if;
  return new;
end $$;
drop trigger if exists dependencies_guard on dependencies;
create trigger dependencies_guard before insert or update or delete on dependencies
  for each row execute function dependency_guard();

-- Plans (replaces 005): rank permission alone may only change strategic_rank; size and delivered are team fields --
create or replace function log_epic_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare reason text := coalesce(current_setting('app.reason', true), '');
        team uuid;
begin
  select team_id into team from epics where org_id = new.org_id and id = new.epic_id;
  if not can_write_team(new.org_id, team) then
    if new.commitment is distinct from old.commitment or new.effort_low is distinct from old.effort_low
       or new.effort_high is distinct from old.effort_high or new.confidence is distinct from old.confidence
       or new.size is distinct from old.size or new.delivered is distinct from old.delivered then
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
  if new.effort_low is distinct from old.effort_low or new.effort_high is distinct from old.effort_high or new.size is distinct from old.size then
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'effort_changed', 'epic_plans', new.id, new.quarter_id, reason,
            jsonb_build_object('effortLow', old.effort_low, 'effortHigh', old.effort_high, 'size', old.size),
            jsonb_build_object('effortLow', new.effort_low, 'effortHigh', new.effort_high, 'size', new.size));
  end if;
  if row(new.*) is distinct from row(old.*) then new.updated_at := now(); end if;
  return new;
end $$;
