-- ============================================================================
-- 011_follows.sql  -  Volgen (docs/design.md section 23, D67; acceptance M8)
-- ----------------------------------------------------------------------------
-- A member follows epics to filter the core screens ("Gevolgd (n)" on Prioriteren, "Alleen gevolgd" on
-- Afgestemd and Voortgang). Following is personal: a user reads, inserts and deletes only own rows
-- (user_id = auth.uid()) inside an organisation they are a member of. No notifications, no event rows.
-- Additive and re-runnable. Run after 001-010.
-- ============================================================================

create table if not exists epic_follows (
  org_id     uuid not null references organisations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  epic_id    uuid not null,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id, epic_id),
  foreign key (org_id, epic_id) references epics(org_id, id) on delete cascade
);
create index if not exists epic_follows_user_idx on epic_follows (org_id, user_id);

alter table epic_follows enable row level security;

drop policy if exists follows_own_read   on epic_follows;
drop policy if exists follows_own_insert on epic_follows;
drop policy if exists follows_own_delete on epic_follows;
create policy follows_own_read   on epic_follows for select using (user_id = auth.uid() and (select is_member(org_id)));
create policy follows_own_insert on epic_follows for insert with check (user_id = auth.uid() and (select is_member(org_id)));
create policy follows_own_delete on epic_follows for delete using (user_id = auth.uid() and (select is_member(org_id)));
-- No update policy: a follow is added or removed, never edited.

grant select, insert, delete on epic_follows to authenticated;

-- Check: select * from epic_follows where user_id = auth.uid();
