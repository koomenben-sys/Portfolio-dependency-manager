-- ============================================================================
-- 008_realtime.sql  -  Supabase Realtime for the plan tables (BACKLOG P1, docs/design.md section 18)
-- ----------------------------------------------------------------------------
-- Adds the tables the app reads to the `supabase_realtime` publication so the client receives
-- postgres_changes events (filtered on org_id; RLS decides which rows each subscriber may see).
-- The app falls back to polling every 30 s when the subscription fails, so this file is optional.
-- Idempotent: tables already in the publication are skipped. Run after 001-007.
-- ============================================================================

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;   -- normally created by Supabase itself
  end if;
  foreach t in array array['teams','themes','quarters','team_capacity','epics','epic_plans','dependencies',
      'confidence_votes','discussion_items','check_ins','impediments','plan_events','memberships',
      'org_settings','invitations']
  loop
    if to_regclass('public.' || t) is not null
       and not exists (select 1 from pg_publication_tables
                       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Check: select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
