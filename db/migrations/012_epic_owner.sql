-- ============================================================================
-- 012_epic_owner.sql  -  Uitvoering feedback (docs/design.md section 25, D80-D83; acceptance N)
-- ----------------------------------------------------------------------------
-- * epics.owner_name: "Eigenaar" (project manager / product owner, free text). The column exists since 001;
--   the statement below is a no-op there and makes this file complete on its own. Shown as an optional column
--   on Prioriteren and editable in the epic panel. Policy epics_write (own team) covers it; no new policy.
-- Additive and re-runnable. Run after 001-011.
-- ============================================================================

alter table epics add column if not exists owner_name text not null default '';

-- Check: select ref_code, owner_name from epics order by ref_code;
