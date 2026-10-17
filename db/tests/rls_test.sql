-- ============================================================================
-- db/tests/rls_test.sql  -  row-level security and tenant-isolation test (BACKLOG P1, docs/design.md section 18)
-- ----------------------------------------------------------------------------
-- HOW TO RUN: paste the whole file into the Supabase SQL editor and click Run (after migrations 001-008).
-- The result grid shows one row per check with PASS / FAIL; the first row is the total.
-- Plain SQL, no extension needed (no pgTAP). Re-runnable.
--
-- What it does:
--   1. creates throw-away users directly in auth.users (e-mails rls-*@example.invalid, no password; they can
--      never sign in) and two throw-away organisations ("RLS test A" and "RLS test B") with teams, a quarter,
--      epics, plans, an ask and an invitation;
--   2. runs every check as one of those users: role `authenticated` + request.jwt.claims {"sub": <uuid>},
--      the same way PostgREST does, inside a sub-transaction that is always rolled back (checks never write);
--   3. deletes the test organisations and users again, then shows the summary.
-- Everything runs in one transaction: if setup fails, nothing is left behind.
-- Your real organisation is never read or touched (all statements filter on the fixed test ids below).
-- ============================================================================

begin;

-- results (temp table: lives only in this SQL-editor session)
create temp table if not exists rls_results (n serial, area text, test text, expected text, got text, result text);
truncate rls_results restart identity;

-- ── fixed test ids ──────────────────────────────────────────────────────────
-- users            orgs / rows
-- a001 admin A     00a0 org A      00a1 team A1 (planner)   00a2 team A2 (provider)   00aa quarter A, 2nd
-- a002 planner A1  00b0 org B      00b1 team B1
-- a003 planner A2                  00a3 quarter A           00b3 quarter B
-- a004 viewer A                    00a4 epic A1  00a5 epic A2  00b4 epic B1
-- a005 viewer A + can_rank         00a6 plan A1  00a7 plan A2  00b6 plan B1
-- a006 invitee (no membership)     00a8 ask: epic A1 -> team A2
-- b001 admin B                     00a9 invitation for a006

create or replace function pg_temp.rls_cleanup() returns void language plpgsql as $$
declare _orgs uuid[] := array['00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000b0']::uuid[];
begin
  -- plans and asks first: their delete trigger (005) writes plan_events, which needs the organisation to exist
  delete from epic_plans   where org_id = any(_orgs);
  delete from dependencies where org_id = any(_orgs);
  delete from organisations where id = any(_orgs);          -- cascades to every org-scoped table
  delete from auth.users where email like 'rls-%@example.invalid';
end $$;

-- One check: run _sql as user _uid and compare the count it returns with _expect.
-- _expect: a number ('0', '1', ...), 'error' (any error), or 'error:<text>' (error message containing <text>).
-- Writes are wrapped as "with x as (update ... returning 1) select count(*) from x", so a write that RLS
-- filters away returns 0 (PostgREST behaviour), and a write that RLS or a trigger refuses returns an error.
create or replace function pg_temp.rls_check(_area text, _test text, _uid uuid, _sql text, _expect text, _reason text default null)
returns void language plpgsql as $$
declare _n bigint; _got text; _email text;
begin
  select email into _email from auth.users where id = _uid;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', _uid, 'role', 'authenticated', 'email', _email)::text, true);
    perform set_config('request.jwt.claim.sub', _uid::text, true);      -- older auth.uid() definitions
    perform set_config('app.reason', coalesce(_reason, ''), true);
    perform set_config('role', 'authenticated', true);
    execute _sql into _n;
    _got := coalesce(_n::text, 'null');
    raise exception 'rls_check_rollback';                              -- undo whatever the check wrote
  exception when others then
    if sqlerrm <> 'rls_check_rollback' then _got := 'error: ' || sqlerrm; end if;
  end;
  insert into rls_results (area, test, expected, got, result) values (_area, _test, _expect, _got,
    case when _expect = 'error' and _got like 'error:%' then 'PASS'
         when _expect like 'error:%' and _got like 'error:%' and position(lower(substr(_expect, 7)) in lower(_got)) > 0 then 'PASS'
         when _expect = _got then 'PASS'
         else 'FAIL' end);
end $$;

select pg_temp.rls_cleanup();   -- leftovers of an earlier, interrupted run

-- ── setup (as the SQL-editor user, who owns the tables) ──────────────────────
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email, '', now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
from (values ('00000000-0000-4000-8000-00000000a001', 'rls-admin@example.invalid'),
             ('00000000-0000-4000-8000-00000000a002', 'rls-planner@example.invalid'),
             ('00000000-0000-4000-8000-00000000a003', 'rls-provider@example.invalid'),
             ('00000000-0000-4000-8000-00000000a004', 'rls-viewer@example.invalid'),
             ('00000000-0000-4000-8000-00000000a005', 'rls-ranker@example.invalid'),
             ('00000000-0000-4000-8000-00000000a006', 'rls-invitee@example.invalid'),
             ('00000000-0000-4000-8000-00000000b001', 'rls-other@example.invalid')) as u(id, email);

insert into organisations (id, name) values
  ('00000000-0000-4000-8000-0000000000a0', 'RLS test A'),
  ('00000000-0000-4000-8000-0000000000b0', 'RLS test B');
insert into teams (org_id, id, name) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a1', 'RLS A1'),
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a2', 'RLS A2'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000b1', 'RLS B1');
insert into memberships (user_id, org_id, role, team_id, can_rank) values
  ('00000000-0000-4000-8000-00000000a001', '00000000-0000-4000-8000-0000000000a0', 'admin',   null, true),
  ('00000000-0000-4000-8000-00000000a002', '00000000-0000-4000-8000-0000000000a0', 'planner', '00000000-0000-4000-8000-0000000000a1', false),
  ('00000000-0000-4000-8000-00000000a003', '00000000-0000-4000-8000-0000000000a0', 'planner', '00000000-0000-4000-8000-0000000000a2', false),
  ('00000000-0000-4000-8000-00000000a004', '00000000-0000-4000-8000-0000000000a0', 'viewer',  null, false),
  ('00000000-0000-4000-8000-00000000a005', '00000000-0000-4000-8000-0000000000a0', 'viewer',  null, true),
  ('00000000-0000-4000-8000-00000000b001', '00000000-0000-4000-8000-0000000000b0', 'admin',   null, true);
insert into quarters (org_id, id, year, q, phase) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a3', 2099, 1, 'negotiate'),
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000aa', 2099, 2, 'prep'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000b3', 2099, 1, 'negotiate');
insert into epics (org_id, id, ref_code, team_id, title) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a4', 'RLS-EP-1', '00000000-0000-4000-8000-0000000000a1', 'A1 epic'),
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a5', 'RLS-EP-2', '00000000-0000-4000-8000-0000000000a2', 'A2 epic'),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000b4', 'RLS-EP-1', '00000000-0000-4000-8000-0000000000b1', 'B1 epic');
insert into epic_plans (org_id, id, epic_id, quarter_id, strategic_rank, effort_low, effort_high) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a6', '00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-0000000000a3', 1, 2, 4),
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a7', '00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-0000000000a3', 2, 2, 4),
  ('00000000-0000-4000-8000-0000000000b0', '00000000-0000-4000-8000-0000000000b6', '00000000-0000-4000-8000-0000000000b4', '00000000-0000-4000-8000-0000000000b3', 1, 2, 4);
insert into dependencies (org_id, id, ref_code, epic_id, requester_team_id, provider_team_id, quarter_id, ask, effort_low, effort_high) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a8', 'RLS-DEP-1', '00000000-0000-4000-8000-0000000000a4',
   '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3', 'RLS ask', 1, 2);
insert into invitations (org_id, id, email, role) values
  ('00000000-0000-4000-8000-0000000000a0', '00000000-0000-4000-8000-0000000000a9', 'rls-invitee@example.invalid', 'viewer');

-- ── checks ────────────────────────────────────────────────────────────────────
-- Short names in the SQL below: A = org A, B = org B (literal ids, so every check is self-contained).
do $$
declare
  A text := '''00000000-0000-4000-8000-0000000000a0''';  B text := '''00000000-0000-4000-8000-0000000000b0''';
  TA1 text := '''00000000-0000-4000-8000-0000000000a1'''; TA2 text := '''00000000-0000-4000-8000-0000000000a2'''; TB1 text := '''00000000-0000-4000-8000-0000000000b1''';
  EA1 text := '''00000000-0000-4000-8000-0000000000a4'''; EA2 text := '''00000000-0000-4000-8000-0000000000a5'''; EB1 text := '''00000000-0000-4000-8000-0000000000b4''';
  PA1 text := '''00000000-0000-4000-8000-0000000000a6'''; PA2 text := '''00000000-0000-4000-8000-0000000000a7'''; PB1 text := '''00000000-0000-4000-8000-0000000000b6''';
  QA text := '''00000000-0000-4000-8000-0000000000a3'''; QA2 text := '''00000000-0000-4000-8000-0000000000aa'''; DA text := '''00000000-0000-4000-8000-0000000000a8''';
  u_admin   uuid := '00000000-0000-4000-8000-00000000a001';
  u_planner uuid := '00000000-0000-4000-8000-00000000a002';
  u_prov    uuid := '00000000-0000-4000-8000-00000000a003';
  u_viewer  uuid := '00000000-0000-4000-8000-00000000a004';
  u_ranker  uuid := '00000000-0000-4000-8000-00000000a005';
  u_invitee uuid := '00000000-0000-4000-8000-00000000a006';
  u_other   uuid := '00000000-0000-4000-8000-00000000b001';
  w text;   -- "with x as (<write> returning 1) select count(*) from x"
  every_table text;
begin
  -- 1. planner: own team only (epics_write, epic_plans_write)
  perform pg_temp.rls_check('team scope', 'planner updates own team''s epic', u_planner,
    format('with x as (update epics set title = %s where id = %s returning 1) select count(*) from x', '''changed''', EA1), '1');
  perform pg_temp.rls_check('team scope', 'planner cannot update another team''s epic (0 rows)', u_planner,
    format('with x as (update epics set title = %s where id = %s returning 1) select count(*) from x', '''changed''', EA2), '0');
  perform pg_temp.rls_check('team scope', 'planner cannot create an epic for another team', u_planner,
    format('with x as (insert into epics (org_id, ref_code, team_id, title) values (%s, %s, %s, %s) returning 1) select count(*) from x', A, '''RLS-X''', TA2, '''x'''), 'error:row-level security');
  perform pg_temp.rls_check('team scope', 'planner changes effort of own team''s plan', u_planner,
    format('with x as (update epic_plans set effort_high = 5 where id = %s returning 1) select count(*) from x', PA1), '1');
  perform pg_temp.rls_check('team scope', 'planner cannot change effort of another team''s plan (0 rows)', u_planner,
    format('with x as (update epic_plans set effort_high = 5 where id = %s returning 1) select count(*) from x', PA2), '0');
  perform pg_temp.rls_check('team scope', 'planner adds own team''s epic to a quarter', u_planner,
    format('with x as (insert into epic_plans (org_id, epic_id, quarter_id) values (%s, %s, %s) returning 1) select count(*) from x', A, EA1, QA2), '1');
  perform pg_temp.rls_check('team scope', 'planner cannot add another team''s epic to a quarter', u_planner,
    format('with x as (insert into epic_plans (org_id, epic_id, quarter_id) values (%s, %s, %s) returning 1) select count(*) from x', A, EA2, QA2), 'error');
  perform pg_temp.rls_check('team scope', 'planner cannot remove another team''s plan (0 rows)', u_planner,
    format('with x as (delete from epic_plans where id = %s returning 1) select count(*) from x', PA2), '0');
  perform pg_temp.rls_check('team scope', 'planner cannot change capacity of another team', u_planner,
    format('with x as (insert into team_capacity (org_id, team_id, quarter_id, headcount) values (%s, %s, %s, 5) returning 1) select count(*) from x', A, TA2, QA), 'error:row-level security');

  -- 2. strategic rank needs can_rank (003/005 trigger log_epic_plan)
  perform pg_temp.rls_check('rank', 'planner without can_rank cannot change rank of own plan', u_planner,
    format('with x as (update epic_plans set strategic_rank = 9 where id = %s returning 1) select count(*) from x', PA1), 'error:strategic_rank requires can_rank', 'rls test');
  perform pg_temp.rls_check('rank', 'planner cannot change rank of another team''s plan (0 rows)', u_planner,
    format('with x as (update epic_plans set strategic_rank = 9 where id = %s returning 1) select count(*) from x', PA2), '0', 'rls test');
  perform pg_temp.rls_check('rank', 'planner cannot edit themes', u_planner,
    format('with x as (insert into themes (org_id, name) values (%s, %s) returning 1) select count(*) from x', A, '''RLS theme'''), 'error:row-level security');

  -- 3. viewer: read only
  perform pg_temp.rls_check('viewer', 'viewer reads the plan of own organisation', u_viewer,
    format('select count(*) from epics where org_id = %s', A), '2');
  perform pg_temp.rls_check('viewer', 'viewer cannot update epics (0 rows)', u_viewer,
    format('with x as (update epics set title = %s where org_id = %s returning 1) select count(*) from x', '''v''', A), '0');
  perform pg_temp.rls_check('viewer', 'viewer cannot update plans (0 rows)', u_viewer,
    format('with x as (update epic_plans set effort_high = 9 where org_id = %s returning 1) select count(*) from x', A), '0');
  perform pg_temp.rls_check('viewer', 'viewer cannot answer an ask (0 rows)', u_viewer,
    format('with x as (update dependencies set response = %s where id = %s returning 1) select count(*) from x', '''accepted''', DA), '0');
  perform pg_temp.rls_check('viewer', 'viewer cannot add a team', u_viewer,
    format('with x as (insert into teams (org_id, name) values (%s, %s) returning 1) select count(*) from x', A, '''v'''), 'error:row-level security');
  perform pg_temp.rls_check('viewer', 'viewer cannot vote', u_viewer,
    format('with x as (insert into confidence_votes (org_id, team_id, quarter_id, vote) values (%s, %s, %s, 5) returning 1) select count(*) from x', A, TA1, QA), 'error:row-level security');
  perform pg_temp.rls_check('viewer', 'viewer cannot raise a discussion item', u_viewer,
    format('with x as (insert into discussion_items (org_id, quarter_id, epic_id, reason) values (%s, %s, %s, %s) returning 1) select count(*) from x', A, QA, EA1, '''v'''), 'error:row-level security');
  perform pg_temp.rls_check('viewer', 'viewer cannot write plan_events', u_viewer,
    format('with x as (insert into plan_events (org_id, action, entity) values (%s, %s, %s) returning 1) select count(*) from x', A, '''x''', '''x'''), 'error:row-level security');
  perform pg_temp.rls_check('viewer', 'viewer cannot delete epics (0 rows)', u_viewer,
    format('with x as (delete from epics where org_id = %s returning 1) select count(*) from x', A), '0');

  -- 4. viewer with can_rank: strategic rank only
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer changes rank with a reason', u_ranker,
    format('with x as (update epic_plans set strategic_rank = 7 where id = %s returning 1) select count(*) from x', PA2), '1', 'rls test');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer changes rank via update_with_reason (app path)', u_ranker,
    format('select count(*) from (select update_with_reason(%s, %s, %s, %s)) x', '''epic_plans''', PA2, '''{"strategic_rank": 8}''', '''rls test'''), '1');
  perform pg_temp.rls_check('can_rank viewer', 'rank change without a reason is refused', u_ranker,
    format('with x as (update epic_plans set strategic_rank = 7 where id = %s returning 1) select count(*) from x', PA2), 'error:a reason is required');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer cannot change commitment', u_ranker,
    format('with x as (update epic_plans set commitment = %s where id = %s returning 1) select count(*) from x', '''committed''', PA2), 'error:strategic rank only', 'rls test');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer cannot change effort', u_ranker,
    format('with x as (update epic_plans set effort_high = 9 where id = %s returning 1) select count(*) from x', PA2), 'error:strategic rank only', 'rls test');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer cannot update epics (0 rows)', u_ranker,
    format('with x as (update epics set title = %s where org_id = %s returning 1) select count(*) from x', '''r''', A), '0');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer cannot add a plan', u_ranker,
    format('with x as (insert into epic_plans (org_id, epic_id, quarter_id) values (%s, %s, %s) returning 1) select count(*) from x', A, EA1, QA2), 'error:own team');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer cannot remove a plan', u_ranker,
    format('with x as (delete from epic_plans where id = %s returning 1) select count(*) from x', PA2), 'error:own team');
  perform pg_temp.rls_check('can_rank viewer', 'can_rank viewer cannot answer an ask (0 rows)', u_ranker,
    format('with x as (update dependencies set response = %s where id = %s returning 1) select count(*) from x', '''accepted''', DA), '0');

  -- 5. tenant isolation: nothing of another organisation is readable or writable
  every_table := 'select (select count(*) from organisations where id = %1$s) + (select count(*) from memberships where org_id = %1$s)'
    || ' + (select count(*) from teams where org_id = %1$s) + (select count(*) from themes where org_id = %1$s)'
    || ' + (select count(*) from quarters where org_id = %1$s) + (select count(*) from team_capacity where org_id = %1$s)'
    || ' + (select count(*) from epics where org_id = %1$s) + (select count(*) from epic_plans where org_id = %1$s)'
    || ' + (select count(*) from dependencies where org_id = %1$s) + (select count(*) from confidence_votes where org_id = %1$s)'
    || ' + (select count(*) from discussion_items where org_id = %1$s) + (select count(*) from check_ins where org_id = %1$s)'
    || ' + (select count(*) from impediments where org_id = %1$s) + (select count(*) from plan_events where org_id = %1$s)'
    || ' + (select count(*) from org_settings where org_id = %1$s) + (select count(*) from member_directory where org_id = %1$s)'
    || ' + (select count(*) from invitations where org_id = %1$s) + (select count(*) from team_load where org_id = %1$s)'
    || ' + (select count(*) from integration_connections where org_id = %1$s) + (select count(*) from ref_counters where org_id = %1$s)';
  perform pg_temp.rls_check('tenant', 'admin of B reads nothing of A (all tables and views)', u_other, format(every_table, A), '0');
  perform pg_temp.rls_check('tenant', 'planner of A reads nothing of B (all tables and views)', u_planner, format(every_table, B), '0');
  perform pg_temp.rls_check('tenant', 'admin of A reads nothing of B (all tables and views)', u_admin, format(every_table, B), '0');
  perform pg_temp.rls_check('tenant', 'planner of A sees only own organisation', u_planner,
    format('select count(*) from organisations where id in (%s, %s)', A, B), '1');
  perform pg_temp.rls_check('tenant', 'admin of B cannot update A''s epic (0 rows)', u_other,
    format('with x as (update epics set title = %s where id = %s returning 1) select count(*) from x', '''b''', EA1), '0');
  perform pg_temp.rls_check('tenant', 'admin of A cannot update B''s epic (0 rows)', u_admin,
    format('with x as (update epics set title = %s where id = %s returning 1) select count(*) from x', '''a''', EB1), '0');
  perform pg_temp.rls_check('tenant', 'admin of B cannot add a team to A', u_other,
    format('with x as (insert into teams (org_id, name) values (%s, %s) returning 1) select count(*) from x', A, '''b'''), 'error:row-level security');
  perform pg_temp.rls_check('tenant', 'admin of A cannot add an epic to B', u_admin,
    format('with x as (insert into epics (org_id, ref_code, team_id, title) values (%s, %s, %s, %s) returning 1) select count(*) from x', B, '''RLS-Y''', TB1, '''a'''), 'error:row-level security');
  perform pg_temp.rls_check('tenant', 'admin of B cannot make themselves member of A', u_other,
    format('with x as (insert into memberships (user_id, org_id, role) values (auth.uid(), %s, %s) returning 1) select count(*) from x', A, '''admin'''), 'error:row-level security');
  perform pg_temp.rls_check('tenant', 'admin of B cannot delete A''s epics (0 rows)', u_other,
    format('with x as (delete from epics where org_id = %s returning 1) select count(*) from x', A), '0');
  perform pg_temp.rls_check('tenant', 'admin of B cannot take a ref code of A', u_other,
    format('select count(*) from (select next_ref(%s, %s)) x', A, '''epic'''), 'error:not allowed');

  -- 6. plan_events is insert-only
  perform pg_temp.rls_check('plan_events', 'planner can append an event', u_planner,
    format('with x as (insert into plan_events (org_id, actor_id, action, entity) values (%s, auth.uid(), %s, %s) returning 1) select count(*) from x', A, '''rls_test''', '''epics'''), '1');
  perform pg_temp.rls_check('plan_events', 'planner cannot update events', u_planner,
    format('with x as (update plan_events set reason = %s where org_id = %s returning 1) select count(*) from x', '''x''', A), 'error:permission denied');
  perform pg_temp.rls_check('plan_events', 'planner cannot delete events', u_planner,
    format('with x as (delete from plan_events where org_id = %s returning 1) select count(*) from x', A), 'error:permission denied');
  perform pg_temp.rls_check('plan_events', 'admin cannot update events', u_admin,
    format('with x as (update plan_events set reason = %s where org_id = %s returning 1) select count(*) from x', '''x''', A), 'error:permission denied');
  perform pg_temp.rls_check('plan_events', 'admin cannot delete events', u_admin,
    format('with x as (delete from plan_events where org_id = %s returning 1) select count(*) from x', A), 'error:permission denied');

  -- 7. asks: the provider team answers, the requester team edits the ask (002 deps_write + 007 guard)
  perform pg_temp.rls_check('asks', 'provider team accepts the ask', u_prov,
    format('with x as (update dependencies set response = %s where id = %s returning 1) select count(*) from x', '''accepted''', DA), '1');
  perform pg_temp.rls_check('asks', 'provider decline without a reason is refused', u_prov,
    format('with x as (update dependencies set response = %s where id = %s returning 1) select count(*) from x', '''declined''', DA), 'error:a reason is required');
  perform pg_temp.rls_check('asks', 'requester team cannot answer its own ask', u_planner,
    format('with x as (update dependencies set response = %s where id = %s returning 1) select count(*) from x', '''accepted''', DA), 'error:Only the provider team can answer');
  perform pg_temp.rls_check('asks', 'requester team edits the ask text', u_planner,
    format('with x as (update dependencies set ask = %s where id = %s returning 1) select count(*) from x', '''RLS ask, edited''', DA), '1');
  perform pg_temp.rls_check('asks', 'requester team cannot create an ask from another team''s epic', u_planner,
    format('with x as (insert into dependencies (org_id, ref_code, epic_id, requester_team_id, provider_team_id, quarter_id, effort_low, effort_high) values (%s, %s, %s, %s, %s, %s, 1, 2) returning 1) select count(*) from x', A, '''RLS-DEP-X''', EA2, TA1, TA1, QA), 'error');
  perform pg_temp.rls_check('asks', 'provider team cannot edit the ask text', u_prov,
    format('with x as (update dependencies set ask = %s where id = %s returning 1) select count(*) from x', '''changed by provider''', DA), 'error:Only the requesting team can edit');
  perform pg_temp.rls_check('asks', 'provider team cannot remove the ask', u_prov,
    format('with x as (delete from dependencies where id = %s returning 1) select count(*) from x', DA), 'error:Only the requesting team can remove');
  perform pg_temp.rls_check('asks', 'provider team cannot create an ask in the requester''s name', u_prov,
    format('with x as (insert into dependencies (org_id, ref_code, epic_id, requester_team_id, provider_team_id, quarter_id, effort_low, effort_high) values (%s, %s, %s, %s, %s, %s, 1, 2) returning 1) select count(*) from x', A, '''RLS-DEP-Y''', EA1, TA1, TA2, QA), 'error:Only the requesting team can add');
  perform pg_temp.rls_check('asks', 'admin answers for any team', u_admin,
    format('with x as (update dependencies set response = %s where id = %s returning 1) select count(*) from x', '''accepted''', DA), '1');

  -- 8. invitations: admins of the organisation only (007)
  perform pg_temp.rls_check('invitations', 'admin of A sees A''s invitations', u_admin,
    format('select count(*) from invitations where org_id = %s', A), '1');
  perform pg_temp.rls_check('invitations', 'planner of A sees no invitations', u_planner,
    format('select count(*) from invitations where org_id = %s', A), '0');
  perform pg_temp.rls_check('invitations', 'viewer of A sees no invitations', u_viewer,
    format('select count(*) from invitations where org_id = %s', A), '0');
  perform pg_temp.rls_check('invitations', 'invitee cannot read their own invitation row', u_invitee,
    'select count(*) from invitations', '0');
  perform pg_temp.rls_check('invitations', 'admin of A invites someone', u_admin,
    format('with x as (insert into invitations (org_id, email, role) values (%s, %s, %s) returning 1) select count(*) from x', A, '''rls-new@example.invalid''', '''viewer'''), '1');
  perform pg_temp.rls_check('invitations', 'planner cannot invite', u_planner,
    format('with x as (insert into invitations (org_id, email, role) values (%s, %s, %s) returning 1) select count(*) from x', A, '''rls-new@example.invalid''', '''admin'''), 'error:row-level security');
  perform pg_temp.rls_check('invitations', 'admin of B cannot invite into A', u_other,
    format('with x as (insert into invitations (org_id, email, role) values (%s, %s, %s) returning 1) select count(*) from x', A, '''rls-new@example.invalid''', '''admin'''), 'error:row-level security');
  perform pg_temp.rls_check('invitations', 'e-mail must be lower case', u_admin,
    format('with x as (insert into invitations (org_id, email, role) values (%s, %s, %s) returning 1) select count(*) from x', A, '''RLS-Upper@example.invalid''', '''viewer'''), 'error:check constraint');
  perform pg_temp.rls_check('invitations', 'invitee accepts: one membership created', u_invitee,
    'select accept_invitations()', '1');
  perform pg_temp.rls_check('invitations', 'member without invitation accepts nothing', u_planner,
    'select accept_invitations()', '0');

  -- 9. memberships: admins manage, guards from 007
  perform pg_temp.rls_check('members', 'planner cannot promote themselves (0 rows)', u_planner,
    'with x as (update memberships set role = ''admin'', can_rank = true where user_id = auth.uid() returning 1) select count(*) from x', '0');
  perform pg_temp.rls_check('members', 'planner cannot remove another member (0 rows)', u_planner,
    format('with x as (delete from memberships where org_id = %s and user_id = %L returning 1) select count(*) from x', A, u_viewer), '0');
  perform pg_temp.rls_check('members', 'admin changes a planner into a viewer', u_admin,
    format('with x as (update memberships set role = ''viewer'', team_id = null where org_id = %s and user_id = %L returning 1) select count(*) from x', A, u_planner), '1');
  perform pg_temp.rls_check('members', 'admin removes a member', u_admin,
    format('with x as (delete from memberships where org_id = %s and user_id = %L returning 1) select count(*) from x', A, u_viewer), '1');
  perform pg_temp.rls_check('members', 'admin cannot remove themselves', u_admin,
    format('with x as (delete from memberships where org_id = %s and user_id = auth.uid() returning 1) select count(*) from x', A), 'error:You cannot remove yourself');
  perform pg_temp.rls_check('members', 'admin cannot change their own role', u_admin,
    format('with x as (update memberships set role = ''viewer'' where org_id = %s and user_id = auth.uid() returning 1) select count(*) from x', A), 'error:You cannot change your own role');
  perform pg_temp.rls_check('members', 'every member sees the member directory of own organisation', u_viewer,
    format('select count(*) from member_directory where org_id = %s', A), '5');
  perform pg_temp.rls_check('members', 'admin of A cannot change members of B (0 rows)', u_admin,
    format('with x as (update memberships set can_rank = false where org_id = %s returning 1) select count(*) from x', B), '0');
end $$;

-- ── cleanup ─────────────────────────────────────────────────────────────────
select pg_temp.rls_cleanup();
commit;

-- ── summary (the SQL editor shows this grid) ─────────────────────────────────
select 0 as n, 'TOTAL' as area,
       format('%s checks: %s passed, %s failed', count(*), count(*) filter (where result = 'PASS'), count(*) filter (where result <> 'PASS')) as test,
       '' as expected, '' as got,
       case when bool_and(result = 'PASS') then 'PASS' else 'FAIL' end as result
from rls_results
union all
select n, area, test, expected, got, result from rls_results
order by n;
