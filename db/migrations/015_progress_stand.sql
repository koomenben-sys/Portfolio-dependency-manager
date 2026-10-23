-- ============================================================================
-- 015_progress_stand.sql  -  Voortgang V3: stand per toezegging (docs/design.md section 28, D100-D105; acceptance Q)
-- ----------------------------------------------------------------------------
-- * dependencies.progress not_started | started | done (+ started_at, started_week, done_at): set by the provider
--   team (or an admin) on committed asks only. The expectation signal columns from 010 (signal, signal_note,
--   signal_at, confirmed_at) stay but the app no longer writes signal / signal_note / signal_at; confirmed_at is the
--   "Bevestigen" timestamp of the bijwerkmoment (D104).
-- * epic_plans.progress_override: the epic team sets Gestart / Klaar on an epic itself (null = derived from its asks).
--   A rank-only user cannot change it (log_epic_plan).
-- * impediments.dependency_id (column since 001; the FK becomes on delete set null so a removed ask leaves the
--   impediment on its epic), escalated_at, escalated_to ("Escaleren", free text such as "Directie"). Escalating follows
--   the status rule of impediment_guard() (013): reporter, action holder, epic team planner or admin.
-- * dependency_guard() is replaced (after 012): the progress columns are provider-only, committed asks only, allowed in
--   a locked quarter like the signals. log_epic_plan() is replaced (after 010) to cover progress_override.
-- plan_events rows (progress_set, progress_confirmed, impediment_raised, impediment_escalated) are written by the app.
-- The bijwerkmoment (days, time, frequency, mode) lives in org_settings.profile.cadence (jsonb), no column.
-- Additive and re-runnable. Run after 001-014.
-- ============================================================================

alter table dependencies add column if not exists progress     text not null default 'not_started';
alter table dependencies add column if not exists started_at   timestamptz;
alter table dependencies add column if not exists started_week int;
alter table dependencies add column if not exists done_at      timestamptz;
alter table dependencies drop constraint if exists dependencies_progress_chk;
alter table dependencies add constraint dependencies_progress_chk check (progress in ('not_started','started','done'));

alter table epic_plans add column if not exists progress_override text;
alter table epic_plans drop constraint if exists epic_plans_progress_override_chk;
alter table epic_plans add constraint epic_plans_progress_override_chk check (progress_override is null or progress_override in ('not_started','started','done'));

alter table impediments add column if not exists dependency_id uuid;
alter table impediments add column if not exists escalated_at  timestamptz;
alter table impediments add column if not exists escalated_to  text not null default '';
alter table impediments drop constraint if exists impediments_org_id_dependency_id_fkey;
alter table impediments add constraint impediments_org_id_dependency_id_fkey
  foreign key (org_id, dependency_id) references dependencies(org_id, id) on delete set null (dependency_id);   -- only the link, never org_id

-- Asks (replaces 012): progress is provider-only on committed asks; everything else unchanged ----------------
create or replace function dependency_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _req uuid; _phase text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;      -- SQL editor / service role
  if tg_op = 'DELETE' then
    select team_id into _req from epics where org_id = old.org_id and id = old.epic_id;
    if _req is null then return old; end if;                          -- cascade from a deleted epic
    select phase into _phase from quarters where org_id = old.org_id and id = old.quarter_id;
    if _phase in ('locked', 'active', 'closed') then raise exception 'Asks are fixed once the plan is locked'; end if;
    if not can_write_team(old.org_id, _req) then raise exception 'Only the requesting team can remove the ask'; end if;
    return old;
  end if;
  select team_id into _req from epics where org_id = new.org_id and id = new.epic_id;
  select phase into _phase from quarters where org_id = new.org_id and id = new.quarter_id;
  if tg_op = 'INSERT' then
    if _phase in ('locked', 'active', 'closed') then raise exception 'Asks are fixed once the plan is locked'; end if;
    if not can_write_team(new.org_id, _req) then raise exception 'Only the requesting team can add an ask'; end if;
    return new;
  end if;
  if (new.ask, new.if_declined, new.effort_low, new.effort_high, new.needed_by, new.quarter_id, new.epic_id, new.provider_team_id, new.size, new.certainty)
     is distinct from (old.ask, old.if_declined, old.effort_low, old.effort_high, old.needed_by, old.quarter_id, old.epic_id, old.provider_team_id, old.size, old.certainty) then
    if _phase in ('locked', 'active', 'closed') then raise exception 'Asks are fixed once the plan is locked'; end if;
    if not can_write_team(new.org_id, _req) then raise exception 'Only the requesting team can edit the ask'; end if;
  end if;
  if (new.response, new.response_reason, new.granted_low, new.granted_high, new.deferred_to_quarter_id)
     is distinct from (old.response, old.response_reason, old.granted_low, old.granted_high, old.deferred_to_quarter_id) then
    if _phase in ('locked', 'active', 'closed') then raise exception 'Answers are fixed once the plan is locked'; end if;
    if new.response <> 'proposed' and not can_write_team(new.org_id, new.provider_team_id) then raise exception 'Only the provider team can answer'; end if;
  end if;
  if (new.signal, new.signal_note, new.signal_at, new.confirmed_at)
     is distinct from (old.signal, old.signal_note, old.signal_at, old.confirmed_at) then
    if not can_write_team(new.org_id, new.provider_team_id) then raise exception 'Only the provider team can set a signal'; end if;
    if new.response not in ('accepted', 'partial') then raise exception 'Signals apply to committed asks only'; end if;
  end if;
  if (new.progress, new.started_at, new.started_week, new.done_at)
     is distinct from (old.progress, old.started_at, old.started_week, old.done_at) then
    if not can_write_team(new.org_id, new.provider_team_id) then raise exception 'Only the provider team can set progress'; end if;
    if new.response not in ('accepted', 'partial') then raise exception 'Progress applies to committed asks only'; end if;
  end if;
  return new;
end $$;
drop trigger if exists dependencies_guard on dependencies;
create trigger dependencies_guard before insert or update or delete on dependencies
  for each row execute function dependency_guard();

-- Plans (replaces 010): progress_override is a team field like size and delivered ------------------------------
create or replace function log_epic_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare reason text := coalesce(current_setting('app.reason', true), '');
        team uuid;
begin
  select team_id into team from epics where org_id = new.org_id and id = new.epic_id;
  if not can_write_team(new.org_id, team) then
    if new.commitment is distinct from old.commitment or new.effort_low is distinct from old.effort_low
       or new.effort_high is distinct from old.effort_high or new.confidence is distinct from old.confidence
       or new.size is distinct from old.size or new.delivered is distinct from old.delivered
       or new.progress_override is distinct from old.progress_override then
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

-- Impediments (replaces 013): escalating follows the status rule --------------------------------------------
create or replace function impediment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _team uuid; _me uuid := auth.uid();
begin
  if _me is null then return new; end if;                              -- SQL editor / service role
  if tg_op = 'INSERT' then
    if new.reporter_id is null then new.reporter_id := _me; end if;
    if new.owner_name = '' then
      select coalesce(m.display_name, '') into new.owner_name from memberships m where m.org_id = new.org_id and m.user_id = _me;
    end if;
    return new;
  end if;
  if (new.owner_name, new.reporter_id) is distinct from (old.owner_name, old.reporter_id) and not is_admin(new.org_id) then
    raise exception 'Only an admin can change the reporter';
  end if;
  if (new.status, new.action_owner_id, new.action_owner_name, new.escalated_at, new.escalated_to)
     is distinct from (old.status, old.action_owner_id, old.action_owner_name, old.escalated_at, old.escalated_to) then
    select e.team_id into _team from epics e where e.org_id = new.org_id and e.id = new.epic_id;
    -- `is not distinct from`: a null reporter / holder must read as "no", not as unknown
    if not (is_admin(new.org_id)
            or old.reporter_id is not distinct from _me
            or old.action_owner_id is not distinct from _me
            or (old.action_owner_name <> '' and exists (select 1 from memberships m where m.org_id = new.org_id and m.user_id = _me and m.display_name = old.action_owner_name))
            or (_team is not null and can_write_team(new.org_id, _team))) then
      raise exception 'Only the reporter, the action holder, the epic team or an admin can change the status';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists impediments_guard on impediments;
create trigger impediments_guard before insert or update on impediments
  for each row execute function impediment_guard();

-- Check: select ref_code, progress, started_week, done_at from dependencies order by ref_code;
-- Check: update progress as the requesting team -> "Only the provider team can set progress".
-- Check: update escalated_at as a planner who is neither reporter, holder nor epic team -> "Only the reporter, ...".
