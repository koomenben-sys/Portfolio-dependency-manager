# Database Schema

## Overview

Four tables mirror the app's core data model. `initiatives` belong to `portfolios`, and `dependencies` belong to `initiatives`. A `counters` table tracks the sequential numbers used to generate human-readable ref codes (e.g. PF-0001, IN-0042).

---

## Entity Relationship

```
teams
  ├── initiatives (team_id → teams.id)
  │     └── dependencies (initiative_id → initiatives.id)
  │
  └── dependencies (depends_on_team_id → teams.id)

portfolios
  └── initiatives (portfolio_id → portfolios.id)

counters (standalone — tracks ref code sequences)
```

---

## Tables

### `teams`

User-managed list of teams. Can be added, renamed, and deleted via the Settings menu.

| Column     | Type        | Notes                       |
|------------|-------------|-----------------------------|
| id         | uuid        | Primary key, auto-generated |
| name       | text        | Unique team name             |
| created_at | timestamptz | Auto-set on insert           |

---

### `counters`

Tracks the next sequence number for each entity's ref code.

| Column   | Type    | Notes                                        |
|----------|---------|----------------------------------------------|
| entity   | text    | Primary key. One of: `portfolio`, `initiative`, `dependency` |
| value    | integer | Current counter value, incremented on each insert |

---

### `portfolios`

| Column      | Type        | Notes                              |
|-------------|-------------|------------------------------------|
| id          | uuid        | Primary key, auto-generated        |
| ref_code    | text        | Unique. Format: `PF-0001`          |
| name        | text        | Portfolio name                     |
| description | text        | —                                  |
| year        | integer     | e.g. 2024                          |
| owner       | text        | Person responsible                 |
| created_at  | timestamptz | Auto-set on insert                 |

---

### `initiatives`

| Column       | Type        | Notes                                                    |
|--------------|-------------|----------------------------------------------------------|
| id           | uuid        | Primary key, auto-generated                              |
| ref_code     | text        | Unique. Format: `IN-0001`                                |
| name         | text        | Initiative name                                          |
| team_id      | uuid        | FK → `teams.id`. Nullable (set null on delete)           |
| quarters     | text[]      | Array of selected quarters, e.g. `{Q1,Q3}`              |
| portfolio_id | uuid        | FK → `portfolios.id`. Nullable (set null on delete)      |
| effort       | text        | One of: `TBD`, `S`, `M`, `L`, `XL`                      |
| value_type   | text        | One of: `EUR`, `Regulatory`, `Risk Reduction`            |
| value_amount | text        | Nullable. Only relevant when `value_type = 'EUR'`        |
| priority     | integer     | Sort order for prioritization view                       |
| created_at   | timestamptz | Auto-set on insert                                       |

---

### `dependencies`

| Column          | Type        | Notes                                                              |
|-----------------|-------------|--------------------------------------------------------------------|
| id              | uuid        | Primary key, auto-generated                                        |
| ref_code        | text        | Unique. Format: `DEP-0001`                                         |
| initiative_id   | uuid        | FK → `initiatives.id`. Cascades on delete                          |
| depends_on_team_id | uuid     | FK → `teams.id`. Nullable (set null on delete)                     |
| description     | text        | What is needed from that team                                      |
| quarters        | text[]      | Array of quarters when the dependency is needed                    |
| effort          | text        | One of: `TBD`, `S`, `M`, `L`, `XL`                                |
| status          | text        | One of: `Pending`, `Committed`, `Under Discussion`, `Can't Commit` |
| created_at      | timestamptz | Auto-set on insert                                                 |

---

## SQL — Run in Supabase SQL Editor

```sql
-- Teams (user-managed, editable via Settings)
create table teams (
  id         uuid        primary key default gen_random_uuid(),
  name       text        unique not null,
  created_at timestamptz not null default now()
);

-- Seed with default teams (matches app's TEAMS constant)
insert into teams (name) values
  ('Team Alpha'),
  ('Team Beta'),
  ('Team Gamma'),
  ('Team Delta'),
  ('Team Epsilon');

-- Counters (for ref code generation)
create table counters (
  entity text primary key,
  value  integer not null default 0
);

insert into counters (entity, value) values
  ('portfolio',   0),
  ('initiative',  0),
  ('dependency',  0);

-- Portfolios
create table portfolios (
  id          uuid        primary key default gen_random_uuid(),
  ref_code    text        unique not null,
  name        text        not null default '',
  description text        not null default '',
  year        integer     not null default extract(year from now())::integer,
  owner       text        not null default '',
  created_at  timestamptz not null default now()
);

-- Initiatives
create table initiatives (
  id           uuid        primary key default gen_random_uuid(),
  ref_code     text        unique not null,
  name         text        not null default '',
  team_id      uuid        references teams(id) on delete set null,
  quarters     text[]      not null default '{}',
  portfolio_id uuid        references portfolios(id) on delete set null,
  effort       text        not null default 'M',
  value_type   text        not null default 'EUR',
  value_amount text,
  priority     integer     not null default 0,
  created_at   timestamptz not null default now()
);

-- Dependencies
create table dependencies (
  id                  uuid        primary key default gen_random_uuid(),
  ref_code            text        unique not null,
  initiative_id       uuid        not null references initiatives(id) on delete cascade,
  depends_on_team_id  uuid        references teams(id) on delete set null,
  description         text        not null default '',
  quarters            text[]      not null default '{}',
  effort              text        not null default 'TBD',
  status              text        not null default 'Pending',
  created_at          timestamptz not null default now()
);
```

---

## Allowed Values

| Field                    | Allowed values                                            |
|--------------------------|-----------------------------------------------------------|
| `counters.entity`        | `portfolio`, `initiative`, `dependency`                   |
| `initiatives.effort`     | `TBD`, `S`, `M`, `L`, `XL`                               |
| `initiatives.value_type` | `EUR`, `Regulatory`, `Risk Reduction`                     |
| `dependencies.effort`    | `TBD`, `S`, `M`, `L`, `XL`                               |
| `dependencies.status`    | `Pending`, `Committed`, `Under Discussion`, `Can't Commit`|
| `*.quarters` (array)     | `Q1`, `Q2`, `Q3`, `Q4`                                    |
