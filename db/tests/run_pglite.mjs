// Local check of the migrations and db/tests/rls_test.sql without a database: `npm run test:rls`.
// Runs PGlite (Postgres compiled to WASM, in memory) with a minimal Supabase prelude: roles anon /
// authenticated / service_role, default grants, auth.users and auth.uid() / auth.jwt(), and a non-superuser
// owner like Supabase's `postgres`. Then migrations 001-003 and 005-009 (twice, to prove they are re-runnable;
// 004 needs a real e-mail) and the RLS test script twice. Exit code 1 on any failure.
// This is an approximation of Supabase (auth.users is simplified); the real check is running
// rls_test.sql in the Supabase SQL editor (docs/design.md section 18).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create role app_owner login; grant anon, authenticated, service_role to app_owner;
  do $$ begin execute format('grant all on database %I to public', current_database()); end $$;
  grant all on schema public to app_owner;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges for role app_owner in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges for role app_owner in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges for role app_owner in schema public grant all on sequences to anon, authenticated, service_role;
  create schema auth; grant usage on schema auth to anon, authenticated, service_role, app_owner;
  create table auth.users (
    instance_id uuid, id uuid primary key, aud varchar(255), role varchar(255), email varchar(255), encrypted_password varchar(255),
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz,
    confirmation_token varchar(255), recovery_token varchar(255), email_change_token_new varchar(255), email_change varchar(255));
  grant all on auth.users to app_owner;
  create function auth.uid() returns uuid language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
  grant execute on all functions in schema auth to anon, authenticated, app_owner;
  create publication supabase_realtime; alter publication supabase_realtime owner to app_owner;
  set role app_owner;
`);

const migrations = ['001_core', '002_rls', '003_functions_and_triggers', '005_review_round2', '006_live_test', '007_invitations', '008_realtime', '009_value_strategy'];
for (const f of [...migrations, ...migrations.slice(3)]) {
  try { await db.exec(readFileSync(`${ROOT}db/migrations/${f}.sql`, 'utf8')); }
  catch (e) { console.error(`migration ${f} failed: ${e.message}`); process.exit(1); }
}
console.log('migrations ok (005-009 applied twice)');

let failed = 0;
for (let run = 1; run <= 2; run++) {
  let res;
  try { res = await db.exec(readFileSync(`${ROOT}db/tests/rls_test.sql`, 'utf8')); }
  catch (e) { console.error(`rls_test.sql failed: ${e.message}`); process.exit(1); }
  const rows = res[res.length - 1].rows;
  console.log(`run ${run}: ${rows[0].test} -> ${rows[0].result}`);
  for (const r of rows.slice(1)) if (r.result !== 'PASS') { failed += 1; console.log(`  FAIL [${r.area}] ${r.test}: expected ${r.expected}, got ${r.got}`); }
}
const left = (await db.query('select (select count(*) from organisations)::int as orgs, (select count(*) from auth.users)::int as users')).rows[0];
if (left.orgs || left.users) { failed += 1; console.log('test data left behind:', left); }
process.exit(failed ? 1 : 0);
