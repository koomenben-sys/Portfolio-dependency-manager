-- ============================================================================
-- 004_bootstrap.sql  -  Create the single MVP organisation and make YOU admin
-- ----------------------------------------------------------------------------
-- 1. Sign up / sign in once in the app (or create a user in Auth > Users).
-- 2. Replace the e-mail below with yours, then run this file.
-- Re-runnable: it reuses an existing organisation named 'Demo Organisation'.
-- The app itself runs without any of this in mock mode (VITE_DATA_SOURCE=mock).
-- ============================================================================

do $$
declare
  _email text := 'koomen.ben@gmail.com';   -- change if needed
  _org   uuid;
  _user  uuid;
begin
  select id into _org from organisations where name = 'Demo Organisation';
  if _org is null then
    insert into organisations (name) values ('Demo Organisation') returning id into _org;
    insert into ref_counters (org_id, kind) values (_org,'epic'), (_org,'dependency'), (_org,'impediment');
  end if;

  select id into _user from auth.users where email = _email;
  if _user is null then
    raise notice 'No auth user with e-mail % yet - sign in once, then re-run.', _email;
  else
    insert into memberships (user_id, org_id, role, can_rank)
    values (_user, _org, 'admin', true)
    on conflict (user_id, org_id) do update set role = 'admin', can_rank = true;
  end if;
end $$;
