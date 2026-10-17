-- ============================================================================
-- 003_functions_and_triggers.sql
-- ----------------------------------------------------------------------------
-- * next_ref(): concurrency-safe ref codes (D17)
-- * requester_team_id filled from the epic
-- * plan_events made append-only
-- * rank/commitment changes are logged automatically; rank needs can_rank
-- * capacity view (load vs available) so numbers do not drift between clients
-- ============================================================================

create or replace function next_ref(_org uuid, _kind text) returns text
language plpgsql security definer set search_path = public as $$
declare n int; prefix text;
begin
  if not is_planner(_org) then raise exception 'not allowed'; end if;
  insert into ref_counters (org_id, kind, next) values (_org, _kind, 2)
    on conflict (org_id, kind) do update set next = ref_counters.next + 1
    returning next - 1 into n;
  prefix := case _kind when 'epic' then 'EP' when 'dependency' then 'DEP' else 'IMP' end;
  return prefix || '-' || lpad(n::text, 4, '0');
end $$;

-- Dependencies: derive requester team from the epic ------------------------------------
create or replace function dep_set_requester() returns trigger
language plpgsql as $$
begin
  select team_id into new.requester_team_id from epics where org_id = new.org_id and id = new.epic_id;
  if new.response <> 'proposed' and new.response <> 'accepted' and length(trim(new.response_reason)) = 0 then
    raise exception 'a reason is required for response %', new.response;
  end if;
  if tg_op = 'INSERT' or new.response is distinct from old.response then
    new.responded_at := case when new.response = 'proposed' then null else now() end;
  end if;
  return new;
end $$;
create trigger dependencies_requester before insert or update on dependencies
  for each row execute function dep_set_requester();

-- Append-only event log -----------------------------------------------------------------
revoke update, delete, truncate on plan_events from public, anon, authenticated;

-- Automatic events for rank / commitment / dependency answers -----------------------------
-- The app may pass a reason through the session setting `app.reason` (set via set_config in an RPC);
-- the repository sends it with the write. Reason is mandatory for rank changes (D6).
create or replace function log_epic_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare reason text := coalesce(current_setting('app.reason', true), '');
begin
  if tg_op = 'UPDATE' and new.strategic_rank is distinct from old.strategic_rank then
    if not can_rank(new.org_id) then raise exception 'strategic_rank requires can_rank'; end if;
    if length(trim(reason)) = 0 then raise exception 'a reason is required to change strategic_rank'; end if;
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'rank_changed', 'epic_plans', new.id, new.quarter_id, reason,
            jsonb_build_object('strategic_rank', old.strategic_rank),
            jsonb_build_object('strategic_rank', new.strategic_rank));
  end if;
  if tg_op = 'UPDATE' and new.commitment is distinct from old.commitment then
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'commitment_changed', 'epic_plans', new.id, new.quarter_id, reason,
            jsonb_build_object('commitment', old.commitment),
            jsonb_build_object('commitment', new.commitment));
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger epic_plans_log before update on epic_plans
  for each row execute function log_epic_plan();

create or replace function log_dependency() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.response is distinct from old.response then
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'dependency_answered', 'dependencies', new.id, new.quarter_id,
            new.response_reason,
            jsonb_build_object('response', old.response),
            jsonb_build_object('response', new.response));
  end if;
  return new;
end $$;
create trigger dependencies_log after update on dependencies
  for each row execute function log_dependency();

create or replace function log_phase() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.phase is distinct from old.phase then
    insert into plan_events (org_id, actor_id, action, entity, entity_id, quarter_id, reason, before, after)
    values (new.org_id, auth.uid(), 'phase_changed', 'quarters', new.id, new.id,
            coalesce(current_setting('app.reason', true), ''),
            jsonb_build_object('phase', old.phase), jsonb_build_object('phase', new.phase));
  end if;
  return new;
end $$;
create trigger quarters_log after update on quarters
  for each row execute function log_phase();

-- Capacity view: available vs load per team per quarter (person-weeks) -----------------------
-- own load counts committed + planned (not 'not_committed') epics; incoming counts accepted/partial asks.
create or replace view team_load with (security_invoker = true) as
select c.org_id, c.team_id, c.quarter_id,
       greatest(0, c.headcount * c.weeks * c.focus_factor - c.absence_weeks) * (1 - c.reserve_pct / 100.0) as available,
       coalesce((select sum(p.effort_low)  from epic_plans p join epics e on e.org_id = p.org_id and e.id = p.epic_id
                  where e.org_id = c.org_id and e.team_id = c.team_id and p.quarter_id = c.quarter_id
                    and p.commitment <> 'not_committed'), 0) as own_low,
       coalesce((select sum(p.effort_high) from epic_plans p join epics e on e.org_id = p.org_id and e.id = p.epic_id
                  where e.org_id = c.org_id and e.team_id = c.team_id and p.quarter_id = c.quarter_id
                    and p.commitment <> 'not_committed'), 0) as own_high,
       coalesce((select sum(d.effort_low)  from dependencies d
                  where d.org_id = c.org_id and d.provider_team_id = c.team_id and d.quarter_id = c.quarter_id
                    and d.response in ('accepted','partial')), 0) as incoming_low,
       coalesce((select sum(d.effort_high) from dependencies d
                  where d.org_id = c.org_id and d.provider_team_id = c.team_id and d.quarter_id = c.quarter_id
                    and d.response in ('accepted','partial')), 0) as incoming_high
from team_capacity c;
