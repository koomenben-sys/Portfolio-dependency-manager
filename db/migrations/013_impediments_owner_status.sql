-- ============================================================================
-- 013_impediments_owner_status.sql  -  Voortgang feedback (docs/design.md section 27, D92/D93; acceptance P)
-- ----------------------------------------------------------------------------
-- * impediments.owner_name is the Melder (reporter's display name, as before); reporter_id stores who raised it
--   (auth.uid() on insert when the app does not send it). Only an admin may change either afterwards.
-- * action_owner_id / action_owner_name: the Actiehouder, free text or a member of the organisation.
-- * status gains 'in_progress' (Open · In behandeling · Opgelost).
-- * impediment_guard(): who may change the status or the action holder: the reporter, the action holder (by id, or
--   by display name for a free-text holder), a planner of the epic's team, or an admin. Insert and other fields
--   keep the impediments_write policy (002: planners and admins). The SQL editor / service role (auth.uid() null)
--   is not restricted.
-- * The escalation threshold ("Escalatie na n dagen", default 7) lives in org_settings.profile (jsonb), no column.
-- Additive and re-runnable. Run after 001-012.
-- ============================================================================

alter table impediments add column if not exists reporter_id uuid;
alter table impediments add column if not exists action_owner_id uuid;
alter table impediments add column if not exists action_owner_name text not null default '';

alter table impediments drop constraint if exists impediments_status_check;
alter table impediments add constraint impediments_status_check check (status in ('open', 'in_progress', 'resolved'));

create or replace function impediment_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare _team uuid; _me uuid := auth.uid();
begin
  if _me is null then return new; end if;                              -- SQL editor / service role
  if tg_op = 'INSERT' then
    if new.reporter_id is null then new.reporter_id := _me; end if;
    if new.owner_name = '' then
      select coalesce(m.display_name, '') into new.owner_name from memberships m where m.org_id = new.org_id and m.user_id = _me;
    end if;
    return new;
  end if;
  if (new.owner_name, new.reporter_id) is distinct from (old.owner_name, old.reporter_id) and not is_admin(new.org_id) then
    raise exception 'Only an admin can change the reporter';
  end if;
  if (new.status, new.action_owner_id, new.action_owner_name) is distinct from (old.status, old.action_owner_id, old.action_owner_name) then
    select e.team_id into _team from epics e where e.org_id = new.org_id and e.id = new.epic_id;
    -- `is not distinct from`: a null reporter / holder must read as "no", not as unknown
    if not (is_admin(new.org_id)
            or old.reporter_id is not distinct from _me
            or old.action_owner_id is not distinct from _me
            or (old.action_owner_name <> '' and exists (select 1 from memberships m where m.org_id = new.org_id and m.user_id = _me and m.display_name = old.action_owner_name))
            or (_team is not null and can_write_team(new.org_id, _team))) then
      raise exception 'Only the reporter, the action holder, the epic team or an admin can change the status';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists impediments_guard on impediments;
create trigger impediments_guard before insert or update on impediments
  for each row execute function impediment_guard();

-- Check: select ref_code, owner_name, action_owner_name, status from impediments order by ref_code;
-- Check: update the status as a planner of another team who is neither reporter nor holder -> "Only the reporter, ...".
