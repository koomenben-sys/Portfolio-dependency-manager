-- ============================================================================
-- 012_epic_owner.sql  -  Uitvoering feedback (docs/design.md section 25, D80-D83; acceptance N)
-- ----------------------------------------------------------------------------
-- * epics.owner_name: "Eigenaar" (project manager / product owner, free text). The column exists since 001;
--   the statement below is a no-op there and makes this file complete on its own. Shown as an optional column
--   on Prioriteren and editable in the epic panel. Policy epics_write (own team) covers it; no new policy.
-- * dependency_guard() is replaced (after 010): asks and answers are fixed once the plan is locked. In a quarter
--   whose phase is locked, active or closed nobody (admins included) can add, edit, answer or remove an ask;
--   the provider's signal (signal / signal_note / signal_at / confirmed_at) stays allowed, as does a cascade
--   from a deleted epic or quarter. The SQL editor / service role (auth.uid() null) is not restricted.
-- Additive and re-runnable. Run after 001-011.
-- ============================================================================

alter table epics add column if not exists owner_name text not null default '';

-- Asks (replaces 010): phase check on top of the requester / provider rules ------------------------------
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
  return new;
end $$;
drop trigger if exists dependencies_guard on dependencies;
create trigger dependencies_guard before insert or update or delete on dependencies
  for each row execute function dependency_guard();

-- Check: select ref_code, owner_name from epics order by ref_code;
-- Check: update an ask in a locked quarter as a planner -> "Asks are fixed once the plan is locked".
