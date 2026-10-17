-- ============================================================================
-- 001_core.sql  -  Quarterly planning tool: core tables (tenant-ready)
-- ----------------------------------------------------------------------------
-- WARNING - DATA LOSS: this drops the Feb-2026 tables (counters, dependencies,
-- initiatives, portfolios, teams, and the June-2026 programs / quarters tables
-- if present). Repopulate from a JSON export if you need the old data.
-- Run order: 001, 002, 003, 004 in the Supabase SQL editor (EU region advised).
-- Design rationale: docs/design.md section 9 (D15-D18).
-- ============================================================================

drop table if exists program_initiatives cascade;
drop table if exists programs            cascade;
drop table if exists dependencies        cascade;
drop table if exists initiatives         cascade;
drop table if exists portfolios          cascade;
drop table if exists quarters            cascade;
drop table if exists counters            cascade;
drop table if exists teams               cascade;
-- user_roles (Feb auth) is kept untouched; memberships below replace it for the new app.

-- Tenant root -----------------------------------------------------------------
create table organisations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

-- Membership: authoritative for access (NOT JWT claims, which go stale) --------
create table memberships (
  user_id  uuid not null references auth.users(id) on delete cascade,
  org_id   uuid not null references organisations(id) on delete cascade,
  role     text not null check (role in ('admin','planner','viewer')),
  team_id  uuid,                       -- planners write only rows of this team
  can_rank boolean not null default false,   -- may set themes / strategic rank
  primary key (user_id, org_id)
);

create table teams (
  org_id     uuid not null references organisations(id) on delete cascade,
  id         uuid not null default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, name)
);
alter table memberships add constraint memberships_team_fk
  foreign key (org_id, team_id) references teams(org_id, id) on delete set null (team_id);

create table themes (
  org_id     uuid not null references organisations(id) on delete cascade,
  id         uuid not null default gen_random_uuid(),
  name       text not null,
  description text not null default '',
  position   int  not null default 0,
  primary key (org_id, id),
  unique (org_id, name)
);

create table quarters (
  org_id   uuid not null references organisations(id) on delete cascade,
  id       uuid not null default gen_random_uuid(),
  year     int  not null,
  q        smallint not null check (q between 1 and 4),
  phase    text not null default 'prep'
           check (phase in ('prep','draft','negotiate','review','vote','locked','active','closed')),
  baseline jsonb,                      -- snapshot taken at lock
  locked_at timestamptz,
  primary key (org_id, id),
  unique (org_id, year, q)
);

-- Capacity assumptions per team per quarter; net weeks are derived in the app/view.
create table team_capacity (
  org_id         uuid not null,
  team_id        uuid not null,
  quarter_id     uuid not null,
  headcount      numeric(5,1) not null default 0 check (headcount >= 0),
  weeks          numeric(4,1) not null default 13 check (weeks between 0 and 14),
  focus_factor   numeric(3,2) not null default 0.65 check (focus_factor between 0.1 and 1),
  absence_weeks  numeric(5,1) not null default 0 check (absence_weeks >= 0),  -- aggregated, never per person
  reserve_pct    numeric(4,1) not null default 20 check (reserve_pct between 0 and 80), -- run / on-call / support
  primary key (org_id, team_id, quarter_id),
  foreign key (org_id, team_id)    references teams(org_id, id)    on delete cascade,
  foreign key (org_id, quarter_id) references quarters(org_id, id) on delete cascade
);

-- Epic: the unit. Owned by exactly one team. Grouping = free-text label (filter only).
create table epics (
  org_id      uuid not null references organisations(id) on delete cascade,
  id          uuid not null default gen_random_uuid(),
  ref_code    text not null,
  team_id     uuid not null,
  theme_id    uuid,
  title       text not null default '',
  description text not null default '',
  owner_name  text not null default '',
  label       text not null default '',          -- optional program/portfolio label (D3)
  regulatory  boolean not null default false,
  regulatory_deadline date,
  external_source    text check (external_source in ('azure_devops','jira','trello')),
  external_id        text,
  external_url       text,
  external_synced_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, ref_code),
  foreign key (org_id, team_id)  references teams(org_id, id),
  foreign key (org_id, theme_id) references themes(org_id, id) on delete set null (theme_id),
  check (external_id is null or external_source is not null)
);
create unique index epics_external_uq on epics (org_id, external_source, external_id)
  where external_id is not null;
create index epics_team_idx on epics (org_id, team_id);

-- An epic's plan for one quarter.
create table epic_plans (
  org_id          uuid not null,
  id              uuid not null default gen_random_uuid(),
  epic_id         uuid not null,
  quarter_id      uuid not null,
  strategic_rank  int,                                   -- 1..n, set by can_rank users
  effort_low      numeric(5,1) not null default 0 check (effort_low  >= 0),   -- person-weeks
  effort_high     numeric(5,1) not null default 0 check (effort_high >= effort_low),
  confidence      text not null default 'medium' check (confidence in ('low','medium','high')),
  commitment      text not null default 'draft'
                  check (commitment in ('draft','discuss','committed','at_risk','not_committed')),
  updated_at      timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, epic_id, quarter_id),
  foreign key (org_id, epic_id)    references epics(org_id, id)    on delete cascade,
  foreign key (org_id, quarter_id) references quarters(org_id, id) on delete cascade
);
create index epic_plans_quarter_idx on epic_plans (org_id, quarter_id, strategic_rank);

-- Dependency: requesting epic needs something from provider team in a quarter.
create table dependencies (
  org_id            uuid not null,
  id                uuid not null default gen_random_uuid(),
  ref_code          text not null,
  epic_id           uuid not null,                       -- requesting epic
  requester_team_id uuid not null,                       -- denormalised from epic (set by trigger in 003)
  provider_team_id  uuid not null,
  quarter_id        uuid not null,                       -- quarter in which it is needed
  ask               text not null default '',
  if_declined       text not null default '',            -- "what happens if we say no"
  effort_low        numeric(5,1) not null default 0 check (effort_low  >= 0),
  effort_high       numeric(5,1) not null default 0 check (effort_high >= effort_low),
  response          text not null default 'proposed'
                    check (response in ('proposed','accepted','partial','deferred','declined','needs_priority_call')),
  response_reason   text not null default '',
  deferred_to_quarter_id uuid,
  responded_at      timestamptz,
  created_at        timestamptz not null default now(),
  primary key (org_id, id),
  unique (org_id, ref_code),
  foreign key (org_id, epic_id)           references epics(org_id, id)    on delete cascade,
  foreign key (org_id, requester_team_id) references teams(org_id, id),
  foreign key (org_id, provider_team_id)  references teams(org_id, id),
  foreign key (org_id, quarter_id)        references quarters(org_id, id) on delete cascade,
  foreign key (org_id, deferred_to_quarter_id) references quarters(org_id, id) on delete set null (deferred_to_quarter_id),
  check (provider_team_id <> requester_team_id)
);
create index dependencies_provider_idx on dependencies (org_id, provider_team_id, quarter_id);

-- Per-team confidence vote (fist of five).
create table confidence_votes (
  org_id     uuid not null,
  team_id    uuid not null,
  quarter_id uuid not null,
  vote       smallint not null check (vote between 1 and 5),
  reason     text not null default '',
  voted_at   timestamptz not null default now(),
  primary key (org_id, team_id, quarter_id),
  foreign key (org_id, team_id)    references teams(org_id, id)    on delete cascade,
  foreign key (org_id, quarter_id) references quarters(org_id, id) on delete cascade,
  check (vote > 3 or length(reason) > 0)                  -- reason required at <= 3
);

-- Discussion queue: raised on an epic or a dependency.
create table discussion_items (
  org_id        uuid not null,
  id            uuid not null default gen_random_uuid(),
  quarter_id    uuid not null,
  epic_id       uuid,
  dependency_id uuid,
  reason        text not null,
  owner_name    text not null default '',
  timebox_min   int,
  status        text not null default 'open' check (status in ('open','resolved')),
  outcome       text not null default '',
  raised_by     uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz,
  primary key (org_id, id),
  foreign key (org_id, quarter_id)    references quarters(org_id, id)     on delete cascade,
  foreign key (org_id, epic_id)       references epics(org_id, id)        on delete cascade,
  foreign key (org_id, dependency_id) references dependencies(org_id, id) on delete cascade,
  check (epic_id is not null or dependency_id is not null),
  check (status = 'open' or length(outcome) > 0)
);

-- Light in-quarter check-in.
create table check_ins (
  org_id      uuid not null,
  id          uuid not null default gen_random_uuid(),
  epic_id     uuid not null,
  quarter_id  uuid not null,
  confidence  text not null check (confidence in ('low','medium','high')),
  note        text not null default '',
  author_id   uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  primary key (org_id, id),
  foreign key (org_id, epic_id)    references epics(org_id, id)    on delete cascade,
  foreign key (org_id, quarter_id) references quarters(org_id, id) on delete cascade
);
create index check_ins_epic_idx on check_ins (org_id, epic_id, created_at desc);

-- Risks (planning, ROAM) and impediments (in-quarter blockers).
create table impediments (
  org_id        uuid not null,
  id            uuid not null default gen_random_uuid(),
  ref_code      text not null,
  kind          text not null check (kind in ('risk','impediment')),
  title         text not null,
  epic_id       uuid,
  dependency_id uuid,
  owner_name    text not null default '',
  status        text not null default 'open' check (status in ('open','resolved')),
  roam          text check (roam in ('resolved','owned','accepted','mitigated')),  -- risks only
  raised_at     timestamptz not null default now(),
  resolved_at   timestamptz,
  primary key (org_id, id),
  unique (org_id, ref_code),
  foreign key (org_id, epic_id)       references epics(org_id, id)        on delete cascade,
  foreign key (org_id, dependency_id) references dependencies(org_id, id) on delete cascade,
  check (epic_id is not null or dependency_id is not null),
  check (kind = 'risk' or roam is null)
);

-- Append-only: audit trail + decision log + commitment history (D6).
create table plan_events (
  org_id     uuid not null references organisations(id) on delete cascade,
  id         bigint generated always as identity,
  at         timestamptz not null default now(),
  actor_id   uuid,                         -- pseudonymisable (GDPR); rows are never deleted
  action     text not null,                -- e.g. rank_changed, commitment_changed, dependency_answered, phase_changed
  entity     text not null,                -- table name
  entity_id  uuid,
  quarter_id uuid,
  reason     text not null default '',
  before     jsonb,
  after      jsonb,
  primary key (org_id, id)
);
create index plan_events_entity_idx on plan_events (org_id, entity, entity_id, at desc);

-- Ref-code counters, one row per org + kind (concurrency-safe via function in 003).
create table ref_counters (
  org_id uuid not null references organisations(id) on delete cascade,
  kind   text not null check (kind in ('epic','dependency','impediment')),
  next   int  not null default 1,
  primary key (org_id, kind)
);

-- Integration config. NON-SECRET ONLY: tokens live in Vault / Edge Function secrets (D21).
create table integration_connections (
  org_id     uuid not null references organisations(id) on delete cascade,
  id         uuid not null default gen_random_uuid(),
  source     text not null check (source in ('azure_devops','jira','trello')),
  config     jsonb not null default '{}'::jsonb,   -- e.g. {"organization":"x","project":"y","teamMapping":{...}}
  enabled    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (org_id, id)
);
create table integration_sync_runs (
  org_id        uuid not null,
  id            uuid not null default gen_random_uuid(),
  connection_id uuid not null,
  status        text not null check (status in ('running','ok','error')),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  stats         jsonb not null default '{}'::jsonb,
  error         text,
  primary key (org_id, id),
  foreign key (org_id, connection_id) references integration_connections(org_id, id) on delete cascade
);
