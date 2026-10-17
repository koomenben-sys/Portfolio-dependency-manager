-- ============================================================================
-- 002_rls.sql  -  Row-level security (default deny) via membership helpers
-- ----------------------------------------------------------------------------
-- Needs PostgreSQL 15+ (column-list ON DELETE SET NULL in 001) - Supabase default.
-- Roles: admin (all), planner (writes only own team's rows), viewer (read).
-- can_rank gates themes and strategic rank. Rationale: docs/design.md D5, D16.
-- Helpers are SECURITY DEFINER and used as (select fn(...)) in policies so the
-- planner evaluates them once per statement.
-- ============================================================================

create or replace function is_member(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m where m.org_id = _org and m.user_id = auth.uid());
$$;

create or replace function is_admin(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.org_id = _org and m.user_id = auth.uid() and m.role = 'admin');
$$;

-- May write rows that belong to _team: admin, or planner bound to that team.
create or replace function can_write_team(_org uuid, _team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.org_id = _org and m.user_id = auth.uid()
                   and (m.role = 'admin' or (m.role = 'planner' and m.team_id = _team)));
$$;

create or replace function can_rank(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.org_id = _org and m.user_id = auth.uid()
                   and (m.role = 'admin' or m.can_rank));
$$;

-- Any planner/admin (for rows with no team owner, e.g. discussion items).
create or replace function is_planner(_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships m
                 where m.org_id = _org and m.user_id = auth.uid() and m.role in ('admin','planner'));
$$;

-- Enable RLS everywhere (no policy = no access) ---------------------------------
alter table organisations           enable row level security;
alter table memberships             enable row level security;
alter table teams                   enable row level security;
alter table themes                  enable row level security;
alter table quarters                enable row level security;
alter table team_capacity           enable row level security;
alter table epics                   enable row level security;
alter table epic_plans              enable row level security;
alter table dependencies            enable row level security;
alter table confidence_votes        enable row level security;
alter table discussion_items        enable row level security;
alter table check_ins               enable row level security;
alter table impediments             enable row level security;
alter table plan_events             enable row level security;
alter table ref_counters            enable row level security;
alter table integration_connections enable row level security;
alter table integration_sync_runs   enable row level security;

-- Read: members of the org ------------------------------------------------------
create policy org_read   on organisations for select using ((select is_member(id)));
create policy mem_read   on memberships   for select using (user_id = auth.uid() or (select is_admin(org_id)));
create policy mem_admin  on memberships   for all    using ((select is_admin(org_id))) with check ((select is_admin(org_id)));

do $$
declare t text;
begin
  foreach t in array array['teams','themes','quarters','team_capacity','epics','epic_plans',
      'dependencies','confidence_votes','discussion_items','check_ins','impediments','plan_events']
  loop
    execute format('create policy %I on %I for select using ((select is_member(org_id)))', t||'_read', t);
  end loop;
end $$;

-- Admin-only config ------------------------------------------------------------
create policy teams_admin    on teams    for all using ((select is_admin(org_id))) with check ((select is_admin(org_id)));
create policy quarters_admin on quarters for all using ((select is_admin(org_id))) with check ((select is_admin(org_id)));
create policy capacity_write on team_capacity for all
  using ((select can_write_team(org_id, team_id))) with check ((select can_write_team(org_id, team_id)));
create policy themes_rank    on themes   for all using ((select can_rank(org_id))) with check ((select can_rank(org_id)));

-- Epics and plans: own team only --------------------------------------------------
create policy epics_write on epics for all
  using ((select can_write_team(org_id, team_id))) with check ((select can_write_team(org_id, team_id)));

-- Plan rows: team members edit effort/commitment; strategic_rank changes are guarded by trigger in 003.
create policy epic_plans_write on epic_plans for all
  using (exists (select 1 from epics e where e.org_id = epic_plans.org_id and e.id = epic_plans.epic_id
                 and (select can_write_team(e.org_id, e.team_id)))
         or (select can_rank(org_id)))
  with check (exists (select 1 from epics e where e.org_id = epic_plans.org_id and e.id = epic_plans.epic_id
                 and (select can_write_team(e.org_id, e.team_id)))
         or (select can_rank(org_id)));

-- Dependencies: requester team creates/edits the ask; provider team answers.
create policy deps_write on dependencies for all
  using ((select can_write_team(org_id, requester_team_id)) or (select can_write_team(org_id, provider_team_id)))
  with check ((select can_write_team(org_id, requester_team_id)) or (select can_write_team(org_id, provider_team_id)));

create policy votes_write on confidence_votes for all
  using ((select can_write_team(org_id, team_id))) with check ((select can_write_team(org_id, team_id)));

create policy discussion_write on discussion_items for all
  using ((select is_planner(org_id))) with check ((select is_planner(org_id)));
create policy checkins_write on check_ins for insert with check (
  exists (select 1 from epics e where e.org_id = check_ins.org_id and e.id = check_ins.epic_id
          and (select can_write_team(e.org_id, e.team_id))));
create policy impediments_write on impediments for all
  using ((select is_planner(org_id))) with check ((select is_planner(org_id)));

-- plan_events: insert-only (UPDATE/DELETE revoked in 003) ------------------------
create policy events_insert on plan_events for insert with check ((select is_planner(org_id)));

-- Integration config: admin only; never contains secrets ---------------------------
create policy conn_admin on integration_connections for all
  using ((select is_admin(org_id))) with check ((select is_admin(org_id)));
create policy sync_admin on integration_sync_runs for select using ((select is_admin(org_id)));

-- ref_counters: no direct policy; only next_ref() (SECURITY DEFINER) touches it.
