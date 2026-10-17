-- ============================================================================
-- 007_invitations.sql  -  invite people and manage roles in the app (BACKLOG P1, docs/design.md section 18)
-- ----------------------------------------------------------------------------
-- * invitations: e-mail (lower case, unique per organisation), role, team, can_rank, display name.
--   RLS: admins of the organisation only (an invitee never reads the table; acceptance runs in a function).
-- * accept_invitations(): called by the app once after sign-in; creates the memberships rows for the open
--   invitations of the signed-in user's CONFIRMED e-mail address and marks them accepted.
-- * memberships guards for app users (auth.uid() set): you cannot remove yourself or change your own role,
--   and an organisation keeps at least one admin. The SQL editor (no auth.uid()) is not restricted.
-- * Guards found while writing db/tests/rls_test.sql (002 policies were wider than the app's rules):
--   - dependencies: the requesting team adds / edits / removes an ask, only the provider team (or an admin)
--     answers it (002 deps_write lets both teams write the whole row);
--   - epic_plans: only the epic's team (or an admin) adds or removes a plan (002 also admits can_rank users,
--     who should change the strategic rank only).
-- Additive and re-runnable. Run after 001-006.
-- ============================================================================

alter table memberships add column if not exists display_name text not null default '';   -- also in 006

create table if not exists invitations (
  org_id       uuid not null references organisations(id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  email        text not null check (email = lower(btrim(email)) and email like '_%@_%'),
  role         text not null check (role in ('admin','planner','viewer')),
  team_id      uuid,                                   -- planners only (the app sends null for other roles)
  can_rank     boolean not null default false,
  display_name text not null default '',
  invited_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  primary key (org_id, id),
  unique (org_id, email),
  foreign key (org_id, team_id) references teams(org_id, id) on delete set null (team_id)
);

alter table invitations enable row level security;
drop policy if exists invitations_admin on invitations;
create policy invitations_admin on invitations for all
  using ((select is_admin(org_id))) with check ((select is_admin(org_id)));

-- Acceptance ------------------------------------------------------------------------------
-- SECURITY DEFINER: reads auth.users and writes memberships on behalf of the invitee.
-- Only a confirmed e-mail counts: with "Confirm email" switched off in Supabase Auth, anyone could sign up
-- with an invited address by password and take the invitation (docs/design.md section 18: keep it on).
-- An existing membership in the same organisation is left as it is (role changes go through the members screen).
create or replace function accept_invitations() returns int
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _email text; _n int := 0; r record;
begin
  if _uid is null then return 0; end if;
  select lower(email) into _email from auth.users where id = _uid and email_confirmed_at is not null;
  if _email is null then return 0; end if;
  for r in select * from invitations where email = _email and accepted_at is null for update loop
    insert into memberships (user_id, org_id, role, team_id, can_rank, display_name)
    values (_uid, r.org_id, r.role, case when r.role = 'planner' then r.team_id end, r.can_rank, r.display_name)
    on conflict (user_id, org_id) do nothing;
    update invitations set accepted_at = now() where org_id = r.org_id and id = r.id;
    insert into plan_events (org_id, actor_id, action, entity, entity_id, reason, before, after)
    values (r.org_id, _uid, 'invitation_accepted', 'invitations', r.id, '', null,
            jsonb_build_object('role', r.role, 'teamId', r.team_id, 'canRank', r.can_rank));
    _n := _n + 1;
  end loop;
  return _n;
end $$;
revoke all on function accept_invitations() from public, anon;
grant execute on function accept_invitations() to authenticated;

-- Membership guards (app users only) --------------------------------------------------------
create or replace function membership_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _uid uuid := auth.uid(); _loses_admin boolean;
begin
  if tg_op = 'DELETE' then
    if _uid is null then return old; end if;                       -- SQL editor / service role
    if old.user_id = _uid then raise exception 'You cannot remove yourself'; end if;
    _loses_admin := old.role = 'admin';
  else
    if _uid is null then return new; end if;
    if old.user_id = _uid and new.role is distinct from old.role then
      raise exception 'You cannot change your own role; ask another admin';
    end if;
    _loses_admin := old.role = 'admin' and new.role <> 'admin';
  end if;
  if _loses_admin and not exists (select 1 from memberships m
                                  where m.org_id = old.org_id and m.role = 'admin' and m.user_id <> old.user_id) then
    raise exception 'An organisation needs at least one admin';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists memberships_guard on memberships;
create trigger memberships_guard before update or delete on memberships
  for each row execute function membership_guard();

-- Asks: the requesting team creates, edits and removes the ask; the provider team answers ----------------
-- 002 deps_write lets either team write the row, so the split is enforced here (mirrors the adapters).
-- The requester may put an answered ask back to 'proposed' (scope edit, see updateDependency).
-- Runs before dependencies_requester (alphabetical), so the requesting team is read from the epic.
drop trigger if exists dependencies_answer_guard on dependencies;
drop function if exists dependency_answer_guard();
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
  if (new.ask, new.if_declined, new.effort_low, new.effort_high, new.needed_by, new.quarter_id, new.epic_id, new.provider_team_id)
     is distinct from (old.ask, old.if_declined, old.effort_low, old.effort_high, old.needed_by, old.quarter_id, old.epic_id, old.provider_team_id)
     and not can_write_team(new.org_id, _req) then
    raise exception 'Only the requesting team can edit the ask';
  end if;
  if new.response <> 'proposed'
     and (new.response, new.response_reason, new.granted_low, new.granted_high, new.deferred_to_quarter_id)
         is distinct from (old.response, old.response_reason, old.granted_low, old.granted_high, old.deferred_to_quarter_id)
     and not can_write_team(new.org_id, new.provider_team_id) then
    raise exception 'Only the provider team can answer';
  end if;
  return new;
end $$;
drop trigger if exists dependencies_guard on dependencies;
create trigger dependencies_guard before insert or update or delete on dependencies
  for each row execute function dependency_guard();

-- Plans: only the epic's team (or an admin) adds or removes an epic from a quarter. 002 epic_plans_write also
-- admits can_rank users (they change strategic_rank; 005 log_epic_plan limits their updates to the rank).
create or replace function epic_plan_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _team uuid; _row epic_plans;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  _row := coalesce(new, old);
  select team_id into _team from epics where org_id = _row.org_id and id = _row.epic_id;
  if _team is not null and not can_write_team(_row.org_id, _team) then   -- null: cascade from a deleted epic
    raise exception 'You can only plan epics of your own team';
  end if;
  return _row;
end $$;
drop trigger if exists epic_plans_guard on epic_plans;
create trigger epic_plans_guard before insert or delete on epic_plans
  for each row execute function epic_plan_guard();
