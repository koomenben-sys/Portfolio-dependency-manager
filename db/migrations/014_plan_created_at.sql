-- ============================================================================
-- 014_plan_created_at.sql  -  "Nieuw ongepland werk" (docs/design.md section 27, D97; acceptance P)
-- ----------------------------------------------------------------------------
-- * epic_plans.created_at: when the epic was added to the quarter. Voortgang lists the plans created after the
--   quarter was locked (created_at > quarters.locked_at) as "Nieuw ongepland werk" with rank, title, team, owner and
--   the date added. Existing rows are back-filled from their plan_added event when one exists, else from updated_at
--   (so nothing that existed before the lock shows up as new).
-- Additive and re-runnable. Run after 001-013.
-- ============================================================================

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name = 'epic_plans' and column_name = 'created_at') then
    alter table epic_plans add column created_at timestamptz;
    update epic_plans p set created_at = coalesce(
      (select min(e.at) from plan_events e where e.org_id = p.org_id and e.entity in ('epic_plans', 'plans') and e.entity_id = p.id and e.action = 'plan_added'),
      p.updated_at);
    alter table epic_plans alter column created_at set default now();
    alter table epic_plans alter column created_at set not null;
  end if;
end $$;

-- Check: select ref_code, p.created_at, q.locked_at from epic_plans p join epics e using (org_id) join quarters q on q.id = p.quarter_id where e.id = p.epic_id and q.locked_at is not null and p.created_at > q.locked_at;
