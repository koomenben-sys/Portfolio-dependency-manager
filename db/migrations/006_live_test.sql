-- ============================================================================
-- 006_live_test.sql  -  changes from testing the Supabase adapter against a live project
--                       (docs/design.md section 16, "Supabase mode")
-- ----------------------------------------------------------------------------
-- * memberships.display_name: a name to show in history, check-ins and the members list
--   (plan_events / check_ins store only the user id; GDPR note in 001 still holds: the id can be pseudonymised).
-- * member_directory: every member can see the names and roles of the members of their own organisation
--   (002 lets non-admins read only their own membership row).
-- * org_settings.profile: the organisation profile (name, planning-unit label, capacity unit, fiscal year
--   start, no-response days, capacity defaults) as one jsonb document; stale_days / vote_blocks_lock stay columns.
-- * organisations: admins may rename their organisation (the profile form writes the name).
-- Additive and re-runnable. Run after 001-005.
-- ============================================================================

alter table memberships add column if not exists display_name text not null default '';

-- Default the display name to the local part of the sign-in e-mail (the client cannot read auth.users).
create or replace function membership_default_name() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(trim(new.display_name), '') = '' then
    select split_part(email, '@', 1) into new.display_name from auth.users where id = new.user_id;
    new.display_name := coalesce(new.display_name, '');
  end if;
  return new;
end $$;
drop trigger if exists memberships_default_name on memberships;
create trigger memberships_default_name before insert or update on memberships
  for each row execute function membership_default_name();

update memberships m set display_name = split_part(u.email, '@', 1)
  from auth.users u where u.id = m.user_id and coalesce(trim(m.display_name), '') = '';

-- Directory: names and roles of the members of the caller's organisation(s). The view runs with the
-- owner's rights (bypasses the memberships policies); is_member() limits it to the caller's organisations.
create or replace view member_directory as
  select m.org_id, m.user_id, m.role, m.team_id, m.can_rank, m.display_name
  from memberships m
  where is_member(m.org_id);
grant select on member_directory to authenticated;

alter table org_settings add column if not exists profile jsonb not null default '{}'::jsonb;

drop policy if exists org_admin_update on organisations;
create policy org_admin_update on organisations for update
  using ((select is_admin(id))) with check ((select is_admin(id)));
