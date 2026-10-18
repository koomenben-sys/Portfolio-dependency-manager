-- ============================================================================
-- 009_value_strategy.sql  -  Release A "Waarde & strategie" (docs/design.md section 21, D40-D45)
-- ----------------------------------------------------------------------------
-- * themes: goals and programmes (type), "Moet" with a month deadline, archive flag. UI name "Doel".
-- * epics: value inputs (jsonb, model-specific: {level} | {bv,tc,rr,jobSize} | {reach,impact,confidence,effort}),
--   a one-line value note, the light OnePager ({problem, outcome, outOfScope}) and a link to the
--   organisation's own document. The value model itself lives in org_settings.profile.valueModel (no SQL).
-- Policies are unchanged: themes_rank (admin or can_rank) and epics_write (own team) cover the new columns;
-- both tables are already in the realtime publication (008).
-- Additive and re-runnable. Run after 001-008.
-- ============================================================================

alter table themes add column if not exists type          text    not null default 'goal';
alter table themes add column if not exists must          boolean not null default false;
alter table themes add column if not exists must_deadline date;
alter table themes add column if not exists archived      boolean not null default false;
alter table themes drop constraint if exists themes_type_chk;
alter table themes add constraint themes_type_chk check (type in ('goal', 'program'));
alter table themes drop constraint if exists themes_must_deadline_chk;
alter table themes add constraint themes_must_deadline_chk check (must_deadline is null or must);

alter table epics add column if not exists value         jsonb not null default '{}'::jsonb;
alter table epics add column if not exists value_note    text  not null default '';
alter table epics add column if not exists one_pager     jsonb not null default '{}'::jsonb;
alter table epics add column if not exists one_pager_url text;
alter table epics drop constraint if exists epics_value_obj_chk;
alter table epics add constraint epics_value_obj_chk check (jsonb_typeof(value) = 'object' and jsonb_typeof(one_pager) = 'object');
alter table epics drop constraint if exists epics_one_pager_url_chk;
alter table epics add constraint epics_one_pager_url_chk check (one_pager_url is null or one_pager_url ~* '^https?://');
