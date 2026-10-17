# Quarterly Planning Tool — Design Document (MVP iteration)

Status: DRAFT -> APPROVED. The owner (Ben) approved the acceptance criteria and open questions in chat on 2026-10-17: UI in English terminology, migration 001 may drop the Feb tables, name "Kwartaalplan", old Feb views may be replaced, and he delegated the sign-off of the acceptance criteria and Gherkin scenarios to the lead (Claude, acting as Head of Product), with a mandate to rework the MVP if the interviews justify it. The lead reviewed the criteria critically and kept the scope: the five role interviews pointed at refinements (exec page derived from board data, minimal check-ins, phases and lock, notification-free "My attention"), not at a different product, so no fundamental rework was needed. Deviations during build are recorded in section 16.
Working title: "Kwartaalplan" (the repo/app name is still Portfolio Dependency Manager).

Every major decision below is numbered (D1, D2, ...) and states the reason and the rejected alternatives, so it can be explained to others.

---

## 1. Vision and principles

An enterprise planning tool for scarce team capacity and cross-team dependencies, used in Agile quarterly planning sessions. It replaces the giant quarterly planning meeting and the Excel / Azure DevOps mix. Top-down strategic priority meets bottom-up team capacity; the result is visible instantly: where top-level priority lies, what teams committed to, where discussion is still needed. During the quarter: light check-ins and impediment tracking.

Principles:

1. **The epic per team is the unit.** Programs/portfolios are an optional label used as a filter. Loose epics work equally well.
2. **The planning event is the product.** The tool models the session (phases, discussion queue, confidence vote, lock), not just a tracker.
3. **Decisions are visible and explained.** Every change to rank or commitment carries a reason and is kept in history.
4. **Capacity is a conversation prompt, never a gate.** Warn, never block; show assumptions.
5. **Do not duplicate the system of record.** Epics live in Azure DevOps / Jira; we import, we do not become a second backlog. No depth below epic.
6. **Give back to teams.** Intake queue, commitment summary, "why we said no" - not just upward reporting.
7. **Accessible status.** Never colour alone: icon + text label + colour.

## 2. Starting point (base commit)

**D1 - Base = commit `10fe602` (2026-02-28, current `main`).**
Reason: the owner prefers the Jan/Feb version; it is stable, small (~2,800 lines), has auth with roles, a design system (`src/constants/design.js`) and a working Supabase hook pattern. Its core spine (team - initiative - dependency - quarter) already matches the vision.
Rejected: (a) June branch `feature/quarter-planning-views` (programs, sidebar shell): pulls in a Program-as-parent concept that contradicts "grouping is only a filter", and its quarter lifecycle (planning / in_progress / done) is too coarse for session phases; it also has uncommitted work that must not be touched. (b) Restart from scratch: throws away auth and design system for no gain.
Ported from June as *ideas only*: first-class `quarters` table with a lifecycle (extended here to session phases, D9); program as optional grouping (here: a plain label, D3).

**Gap found in the base:** all hooks call Supabase directly (`supabase.from(...)`), so the app cannot run without a database. A repository layer is the first technical change (D12).

## 3. Research summary

Full notes with sources: `docs/research/research-competitors.md`, `docs/research/research-ux.md`. Caveat: based on search summaries; prices are third-party/unverified.

| Tool | What to take | What to avoid |
|---|---|---|
| SAFe PI planning (planning board, program board, ROAM, fist-of-five, commit) | Phases, risks as ROAM, per-team confidence vote, lock | SAFe-only vocabulary; vote as rubber stamp |
| Jira Align / Planview / Targetprocess | Dependency owner + committed quarter; ROAM | Sales-led, 500+ dev scale, quote-only pricing |
| Jira Plans / Advanced Roadmaps | Capacity vs demand, scenarios | Locked to Jira; no commitment ritual; hidden dependency lines |
| Azure DevOps Delivery Plans | Predecessor/successor links as data source | No capacity, no commitment; ADO-only |
| Easy Agile Programs, Agile Cockpit (NL, verified: Agile Cockpit B.V., Jira-only) | Jira-native PI board; prioritisation model + scenarios | Jira-only data model |
| Miro / Lucid PI boards | Facilitation feel | Canvas-only; dependencies drop out of view at scale; no capacity maths |
| Aha!, ProductPlan | Roadmap polish | Per-editor pricing; not dependency tooling |

**Gap we target:** affordable, tool-agnostic (Jira/ADO/Trello via import) combination of capacity vs demand, dependency negotiation, commitment/confidence and light in-quarter check-ins. Competitors split these over boards, timelines or heavy suites.

UX rules adopted (sources in the UX note): teams as lanes with one fixed card layout; dependencies as inline badges by default plus a team x team matrix (matrices beat node-link diagrams above ~20 nodes), lines only for the selected item; capacity as 3 bands (<=80% / <=100% / >100%) with the percentage always printed, warn-not-block; exec page limited to ~6 KPIs with "data as of"; status = icon + text + colour; fist-of-five shows distribution and requires a reason at <=3; check-in = one optional line; stale flags precise.

## 4. Personas and jobs-to-be-done

| Persona | Job to be done | Primary screen |
|---|---|---|
| Director / C-level | "Show me in 2 minutes whether our strategic and regulatory priorities are covered, and what needs my decision." | Overview |
| Product owner / manager | "Get my epic onto other teams' plates and know, without chasing, what they promised." | Board, Dependencies, My attention |
| Team lead / engineering manager | "See what is asked of my team, say yes/partial/later/no with a reason, and protect capacity." | Dependencies (intake queue), Board |
| Agile coach / facilitator | "Run the quarterly session from the queue: phases, discussion items, confidence, lock." | Session |
| Admin | "Set up teams, capacity, themes, quarters, import." | Settings |

Role split (D5): directors focus on strategy/compliance (themes, regulatory epics, rank); POs, PMs and teams focus on delivering value (epics, dependencies, commitment).

## 5. Domain model

```
organisation (1, MVP; tenant boundary)
 ├─ team ── team_capacity (per quarter)
 ├─ theme  (strategic theme, set by top)
 ├─ quarter (phase: prep > draft > negotiate > review > vote > locked > active > closed)
 │    ├─ epic_plan  (epic x quarter: strategic_rank, effort range, commitment status)
 │    ├─ confidence_vote (team x quarter)
 │    └─ baseline snapshot (taken at lock)
 ├─ epic  (owned by exactly one team; optional theme; optional label; optional external link)
 │    ├─ dependency (epic needs something from another team, in a quarter)
 │    ├─ check_in
 │    └─ impediment (kind: risk | impediment; ROAM)
 ├─ discussion_item (raised on epic or dependency)
 └─ plan_event (append-only: audit + decision log + commitment history)
```

| Entity | Definition and key fields |
|---|---|
| Team | Name; capacity per quarter derived from headcount x working days x focus factor - absence - reserve (D7). |
| Epic | The unit of planning. `team_id` (one owner), `title`, `theme_id` (nullable), `label` (free text, e.g. "GDPR"; filter only), `regulatory` + `regulatory_deadline`, external link (`external_source`, `external_id`, `external_url`). |
| Epic plan | An epic's plan for one quarter: `strategic_rank` (1..n, set by users with rank permission), `effort_low`/`effort_high` in person-weeks, `confidence` (low/med/high), `commitment` status. |
| Dependency | Requesting epic needs `ask` from `provider_team` in `quarter`, with effort estimate. Response: `proposed`, `accepted`, `partial`, `deferred`, `declined`, `needs_priority_call`; with reason and (if deferred) target quarter. |
| Quarter | `year`, `q`, `phase`. |
| Strategic priority from the top | `theme` (ordered) + `strategic_rank` on epic plan + regulatory flag with deadline. |
| Commitment status | Epic plan: `draft`, `discuss`, `committed`, `at_risk`, `not_committed`. |
| Check-in | Epic, date, confidence (low/med/high), optional one-line note. |
| Impediment | `kind` risk/impediment, epic and/or dependency, owner, raised date, status, `roam` (resolved/owned/accepted/mitigated) for risks, resolved date. |
| Discussion item | Raised on an epic or dependency by anyone: reason, owner, timebox, outcome, status open/resolved. |
| Optional grouping | `epic.label` text. No parent entity (D3). |

**D2 - Epic owned by exactly one team; shared work is modelled as dependencies.**
Reason: unambiguous accountability and capacity maths; the dependency is exactly where shared work gets negotiated. Rejected: multi-team epics (ownership fights, double counting of capacity); splitting into per-team "child epics" as a separate entity (extra depth, duplicates ADO).

**D3 - Program/portfolio = free-text `label` on the epic, used as filter. No parent table.**
Reason: owner requirement (filter, not parent); loose epics must work equally well; labels need no maintenance. Rejected: Program/Portfolio tables with FK (forces hierarchy, empty-parent problem; the June design); many-to-many group table (more UI for no MVP benefit - can be added later without changing epics).

**D4 - Two status systems on purpose, with a shared vocabulary.**
Dependency status = the *answer to an ask* (between teams). Epic commitment = the *team's own promise*. A committed epic whose dependencies are not accepted is shown as a derived warning "committed with open dependencies". Reason: they have different owners and moments. Rejected: merging into one enum (PO suggestion) - loses who decides what; keeping unrelated vocabularies - confusing.

**D5 - Roles: `admin`, `planner`, `viewer`, plus permission flag `can_rank`.**
Reason: exec "role" is really one permission (set strategic rank/themes). A planner is bound to a team and may write only that team's rows. The facilitator is an admin action (phase control). Rejected: 4-5 distinct roles (granularity cost, no MVP gain); exec as a role (blocks a director who is also admin).

**D6 - One append-only `plan_event` table for audit, decision log and commitment history.**
Reason: the core question "what did teams commit to and who changed what and why" needs history; one table with `reason`, `before`, `after` serves audit (architect), decision log (director) and "changed since baseline" (coach). Rejected: three separate tables (triple the code and triggers); only current state (no trust, no audit). A reason is mandatory for rank changes, commitment changes after lock, and declines.

**D7 - Capacity = derived person-weeks with visible formula; ranges for effort.**
`net = headcount x weeks_in_quarter x focus_factor(default 0.65) - absence_weeks`; `available = net x (1 - reserve%)` where reserve covers run/on-call/support (default 20%). Load = sum of committed + planned own epics (low..high) plus accepted incoming dependencies (shown separately). Reason: raw "points" are not additive across teams and are gamed; formula with overridable assumptions builds trust. Absences are entered as aggregated weeks, never names (privacy).
Rejected: story points; a single typed-in number (fiction); per-person scheduling (becomes a resource planner; out of scope).

**D8 - Capacity is warn-not-block; thresholds <=80% green, <=100% amber, >100% red, percentage always printed.**
Reason: research (UX note) and EM critique: gates get gamed; utilisation near 100% causes queueing. Rejected: hard block; heatmap team x many quarters in MVP (deferred).

## 6. Session model (the quarterly event)

**D9 - Quarter phase as a facilitator-controlled state machine.**
`prep` (async: epics, themes, capacity) > `draft` (teams draft their plan) > `negotiate` (dependency requests/answers) > `review` (capacity/risk, cut line) > `vote` (confidence) > `locked` (baseline taken) > `active` (in-quarter) > `closed`.
Phase changes what is editable (e.g. strategic rank only editable in `prep`/`review` or by `can_rank` with reason after lock; dependency answers only from `negotiate` onward). Admin advances or rewinds with a reason.
Reason: coach critique - the event is the product; async-by-default drafting, live time reserved for the discussion queue. Rejected: simple planning/active/closed (June model) - cannot express readiness, lock or baseline; per-phase deadlines/automation (deferred).

**Discussion queue.** Any user can flag an epic or dependency "needs discussion" with a reason; owner and timebox are set; the live agenda is this queue sorted by strategic rank then size. Resolving needs an outcome text.

**Cut line.** On the board each team's epics are sorted by strategic rank with a running cumulative load; the line where cumulative high-estimate load exceeds available capacity is drawn. The conversation becomes "what falls below the line" decided by rank, not by who shouts. Reason: EM critique.

**Confidence vote.** Per team per quarter, 1-5; reason required at <=3; distribution is shown, re-vote allowed; whether <=2 blocks locking is an admin setting, default "discussion trigger only".

**Lock and baseline.** Locking snapshots `epic_plan` and `dependency` into `baseline` JSON on the quarter. After lock, edits remain possible but are marked "changed since baseline" with a mandatory reason, and listed in a diff (added/dropped epics, status flips, rank/capacity moves). A one-page "plan of record" can be printed from the Session screen. Rejected: formal change-request workflow (heavy); hard freeze (teams route around the tool).

## 7. UX concept and key screens

Navigation: top bar with quarter selector, label filter, "as of" timestamp, role switcher (mock mode). Six screens, in this order of build priority within MVP.

1. **Overview (director).** Max 6 KPIs: % of top-N strategic epics committed, teams over capacity, regulatory epics at risk, open dependencies without answer (with age), open impediments (with age), confidence average. Below: theme coverage (epics + weeks per theme; "unaligned" epics visible), red-flag list (each with owner and age). "Data as of" and last-updated per team. Built from the same data as the board, no extra storage.
2. **Quarter board.** Team lanes (columns), epics ordered by strategic rank, one fixed card: rank, title, theme chip, regulatory marker, effort range, commitment badge (icon + text), dependency badges "needs 2 / asked of us 1" with worst state, ref to ADO. Capacity bar per team lane with % and cut line. Filters: label, theme, status. Density toggle. Clicking an epic opens a side panel (edit, dependencies, check-ins, history).
3. **Dependencies.** Provider-team *intake queue* (ask, requester, quarter, size, "what happens if we say no", answer buttons Accept / Partial / Defer to Qx / Decline / Needs priority call; reason required for all but Accept) and a team x team matrix (counts coloured by worst status) for overview. Timing conflict flag when the dependency quarter is later than the requesting epic's quarter.
4. **Session (facilitator).** Phase stepper, readiness list per team (has epics? capacity set? open asks unanswered? vote cast?), discussion queue, confidence vote panel, lock + diff + plan-of-record print.
5. **In-quarter.** Per epic quick check-in (low/med/high + one line), impediment/risk list (owner, age, ROAM), stale panel (no check-in within the configured cadence, default 14 days).
6. **My attention.** Derived inbox for the signed-in user/team: unanswered asks to my team, answers/counters/declines on my asks, stale check-ins, aging impediments, discussion items I own. (Replaces notifications in MVP.)
Plus **Settings**: teams and capacity assumptions, themes, quarters, ADO import, JSON export.

**D10 - Dependencies shown as badges + matrix; no graph in MVP.**
Reason: research (matrix study; Jira Plans anti-pattern: hidden/inconsistent lines). Rejected: node-link graph (hairball), timeline lines everywhere.

**D11 - Exec Overview is a derived read-only page, not a separate data product.**
Reason: the director asked for it to be the product; PO/EM said fold it. Compromise: build it first-class in the UI but derive everything from board data (no extra storage, always consistent, cheap). Rejected: separate dashboard store / exports (stale-data risk - the top distrust item for the director).

UI language: English (as base). Dutch labels are an i18n task for later. Styling: existing Tailwind design tokens in `src/constants/design.js`; status icons + text.

## 8. Architecture

```
React views
   │  hooks (usePlan, ...) 
   ▼
Repository interface  (src/data/repository.js: listEpics, upsertEpicPlan, answerDependency, ...)
   ├─ MockRepository      (in-memory seed + localStorage persistence)  <- default
   └─ SupabaseRepository  (supabase-js; RLS enforced server-side)
Integration adapters (src/integrations/): normalised Epic[] in, no DB knowledge
   └─ azureDevOps: mapWorkItems() pure + REST client (needs server-side token) + mock response
```

**D12 - Repository interface with Mock and Supabase implementations; selected by `VITE_DATA_SOURCE` (default `mock`).**
Reason: lets the app run fully without a database (the owner cannot expose his dashboard), keeps tests honest (same contract), and is the seam for SaaS. Orgid and actor are explicit parameters. Computations that must not drift (capacity load, cut line, KPIs) live in one pure module `src/domain/` used by both adapters; in Postgres a view mirrors the load calculation for reporting.
Rejected: mocking `supabase-js` (brittle, hides RLS reality); localStorage as primary store (no sharing, no tenancy); Firebase or custom backend (rewrites the working base for no gain).

**D13 - Keep Supabase + static GitHub Pages for MVP; server-side work goes to Edge Functions.**
Reason: base already uses it; owner's DB is restored. Risk noted: GitHub Pages and no SSO are blockers for a real enterprise rollout (director critique) - see section 11.

**D14 - Auth: reuse the existing Supabase Auth flow; in mock mode a role/team switcher replaces login.**
Rejected: building SSO now (Entra ID SSO is a later Supabase/Edge config, not app code).

## 9. Database schema (tenant-ready)

Migrations in `db/migrations/` (run in the Supabase SQL editor, in order):
`001_core.sql` (reset + tables), `002_rls.sql` (helper functions + policies), `003_functions_and_triggers.sql` (ref codes, triggers, append-only event log, capacity view), `004_bootstrap.sql` (creates the organisation and makes you admin). **001 drops the Feb tables (teams, portfolios, initiatives, dependencies, counters) - data loss, repopulate from JSON export if needed.**

**D15 - `org_id NOT NULL` on every table, composite FKs `(org_id, id)`.**
Reason: a child row can never point to another organisation's parent; cheap now, painful to retrofit. Single org in MVP (one seeded row). Rejected: schema-per-tenant (ops cost at SaaS scale on Supabase); org in JWT claims (stale after revocation) - membership table is authoritative.

**D16 - RLS through `is_member(org)`, `has_role(org, ...)`, `my_team(org)` SECURITY DEFINER helpers wrapped in `(select ...)` for per-statement caching; default deny.**
Planner writes only rows of their own team; `can_rank` gates theme and rank writes; `plan_event` is insert-only (UPDATE/DELETE revoked). Rejected: policies with inline subqueries (slow, repeated); `using (true)` as in the June migrations (fine for single-user, wrong for SaaS).

**D17 - Ref codes via `next_ref(org, kind)` function using `UPDATE ... RETURNING` on `ref_counters`, `UNIQUE (org_id, ref_code)`.**
Reason: the base's read-then-write counter races under concurrent users. Gaps acceptable. Codes: `EP-0001` epic, `DEP-0001` dependency, `IMP-0001`.

**D18 - Effort as numeric person-weeks (low/high), not S/M/L text.**
Reason: capacity maths need numbers; S/M/L is a display mapping only. Rejected: keeping text sizes with a lookup (hidden constants, per-org drift).

Tables: `organisations`, `memberships(user_id, org_id, role, team_id, can_rank)`, `teams`, `themes`, `quarters`, `team_capacity`, `epics`, `epic_plans`, `dependencies`, `confidence_votes`, `discussion_items`, `check_ins`, `impediments`, `plan_events`, `ref_counters`, `integration_connections`, `integration_sync_runs`. Details and constraints are in the migration files (the source of truth); `docs/database-schema.md` points here.

## 10. Integration strategy (adapter boundary)

**D19 - Adapter = pure function: external payload in, normalised `ExternalEpic[]` out; sync job writes through the repository.**
`ExternalEpic = { source, externalId, url, title, state, ownerName, areaPath/teamHint, linkedExternalIds[] }`. Epics get `external_source`, `external_id`, `external_synced_at`, `UNIQUE (org_id, external_source, external_id)`.
**Conflict rule (D20):** imported fields (title, state, external link) are mastered by the source and read-only in the UI; planning fields (rank, effort, commitment, dependencies, notes) are owned locally and never overwritten by sync.
**Secrets (D21):** PAT/OAuth tokens never reach the browser or any table readable by `authenticated`. Real use runs in a Supabase Edge Function with the token in Vault / function secrets. `integration_connections` stores only non-secret config (org URL, project, mapping). In dev, the client reads `VITE_ADO_PAT` only for local experimentation and the UI defaults to the **mock** response.
**MVP build (D22): Azure DevOps read-only import is built** (feasible at low cost: one WIQL query + work item batch for epics and relations via REST). Delivered: pure mapper, REST client taking credentials as arguments, mock response fixture, import preview UI (creates/updates epics by `external_id`; unknown team -> unassigned bucket for the admin to map). Not exercised against a real ADO org in this iteration. Jira and Trello: designed only, not stubbed. Rejected: scheduled two-way sync (conflict handling), webhook ingestion (needs server), CSV-only (does not prove the adapter).

## 11. Security, privacy, SaaS path (design only)

- EU Supabase region from day one (GDPR); DPA and subprocessor list required before pilot.
- Entra ID SSO: Supabase SSO (SAML) on a paid plan; required for real enterprise use (director critique). Not in MVP.
- Audit log retention vs erasure: `plan_event.actor_id` can be pseudonymised, rows are not deleted.
- Absences are aggregated weeks only. Works-council (OR) concerns: no individual productivity data is collected.
- Multi-tenant signup, billing, per-org settings UI, tenant isolation tests (pgTAP) are the next phase; the schema already carries org_id.
- Pages hosting is static; anything with secrets goes through Edge Functions.

## 12. Role-play validation: conflicts and resolutions

Five role agents (director, PO, engineering manager, agile coach, SaaS architect) critiqued `concept-brief`. Resolutions:

| Conflict | Resolution |
|---|---|
| PO, director, EM, coach: cut Supabase/RLS/tenancy and ADO. Architect: schema decisions are the expensive-to-retrofit part. | Owner scoped SaaS-ready design: **keep** schema + RLS (SQL only, low cost) and **mock-first** repository; ADO built as mock-backed read-only adapter. Real DB and real ADO calls are not exercised in this iteration. (D12, D15, D22) |
| Director: Overview is the product. PO/EM/coach: fold it, board first. | Overview built, but derived from board data. (D11) |
| EM/coach/PO: remove RAG check-ins (surveillance, status reporting). Owner: check-ins and impediments are required. | Check-in kept minimal: low/med/high + optional one-liner, configurable cadence, no mandatory RAG. (section 7) |
| PO: merge dependency and commitment status. | Kept separate with derived warning. (D4) |
| Director: SSO/EU in MVP. | Designed (section 11), not built; stated as blocker for production. |
| Coach: session phases, ROAM, vote, lock. PO/EM: too heavy. | Phases, discussion queue, vote, lock + diff in MVP; ROAM as a field on risks; no change-request workflow. (D9) |
| EM: capacity derived with ranges. Director/PO: heatmap is fiction. | Derived formula with visible assumptions, per-quarter bar only, warn-not-block. (D7, D8) |
| PO: notifications needed. | "My attention" inbox now; email digest deferred (needs server). |
| Director: compliance tagging, decision log. | `regulatory` + deadline on epics; `plan_event` with mandatory reasons. (D6) |
| Architect: 4 roles -> 3 + flag. | Adopted. (D5) |

## 13. MVP scope and non-goals

In: one organisation; Overview, Board, Dependencies (intake + matrix), Session, In-quarter, My attention, Settings; mock repository with realistic Dutch-company data; Supabase repository + migrations (written, not run by us); ADO mock import.
Out: multi-tenant onboarding/billing, SSO, Jira/Trello, notifications/email, real-time presence, change-request workflow, heatmap across quarters, node-link graph, programs as entities.

## 14. Risks

Stale data after week 2 (mitigation: "data as of", check-in cadence, My attention); capacity numbers distrusted (visible assumptions, ranges); Supabase repository untested until owner runs the migrations; scope breadth for one iteration (build order in `docs/acceptance.md`); rank politics (mandatory reason + history).

## 15. Open questions for the owner

1. Is English UI acceptable for now (Dutch later)?
2. OK that migration `001` drops the Feb tables (data loss, flagged per your earlier rule)?
3. Working name "Kwartaalplan", or keep "Portfolio Dependency Manager" for now?

## 16. Build log and deviations

Built 2026-10-17 on branch `claude/enterprise-planning-mvp-23669e`.

- Commits: design + migrations + acceptance (4d426f8); MVP code (194f103); fixes and removal of the Feb views (6f569c5).
- Source layout: `src/domain/` (pure model, capacity, selectors), `src/data/` (repository contract, mock, Supabase, seed), `src/context/PlanContext.jsx`, `src/views/*View.jsx`, `src/components/plan/`, `src/integrations/azureDevOps/`.
- `VITE_DATA_SOURCE` unset or `mock` = demo mode without login, persona switcher in the header, data in localStorage. `supabase` = existing auth flow + `memberships`.
- Verified: `npm run build` passes; all screens render against the mock in the browser; a scripted contract test in the browser confirmed the authorisation and validation rules (viewer read-only, planner own-team only, rank needs permission + reason, decline/defer need reason/quarter, phase gating, vote <=3 needs reason, lock stores baseline, locked edits need a reason and show in the diff, import keeps planning fields).
- Deviation (D17/D6 in the Supabase adapter): supabase-js cannot set the `app.reason` GUC that the rank trigger reads. Resolved in 005 (`update_with_reason` / `delete_with_reason`): the adapter sends reason-carrying writes through those RPCs.
- Deviation: org-level settings lived in memory in the Supabase adapter. Resolved: `org_settings` (005) plus the `profile` document (006).
- Deviation: `plan_events.actor_name` is not stored in Postgres (only `actor_id`). Resolved: names come from `memberships.display_name` via `member_directory` (006).
- Not done: live Azure DevOps call (CORS blocks it from the browser anyway; Edge Function is the path), Supabase adapter against a real database, automated tests.

### Validation round 2 (built MVP, five role agents) and what changed

Reviewers: director, product owner, engineering manager (platform team), agile coach/RTE, product designer (a11y). Full reports in the session notes; the changes landed in commit "Iterate on MVP validation round 2".

| Finding (who) | Change |
|---|---|
| Partial answers counted the full ask; open asks counted nowhere; incoming asks jumped the rank queue (EM) | `grantedLow/High` on partial answers; "if all accepted" load; cut line ranks own epics and accepted asks together by strategic rank (`rankedLoad`) |
| Band thresholds on rounded % (EM) | exact ratio |
| No edit of an ask, no contact, no needed-by, prefilled effort (PO) | edit/resend ask (answer resets to proposed), requester contact, needed-by date, empty effort fields with validation |
| Votes visible as cast, open from Draft, stale after plan changes, no gate on lock, re-lock kept old baseline, phase rules UI-only (coach) | votes only in Vote/Locked, facilitator reveal, "plan changed after vote" flag, readiness includes capacity/declines/open discussions, lock with open items needs an override reason, fresh baseline on re-lock, repository enforces phase rules for removals/asks/capacity, diff covers removed asks and capacity |
| Duplicate red flags, no regulatory view, numbers undefined, no export (director) | one row per epic with tags, regulatory register (regulation, deadline date, rank, fits capacity), legend, Print/PDF, confidence shown as x/5 |
| 11px type, contrast, card clutter, jargon, modals not accessible (designer) | 12px floor, outlined rank badge >10, strike-through instead of opacity, card reduced to rank/title/meta + commitment + worst-answer pill + regulatory, plain labels, legend, dialog roles/focus trap/Escape, aria-labels on repeated controls |
| No live sync (coach) | out of MVP scope; 30 s polling in Supabase mode; realtime is a follow-up (Supabase Realtime on plan tables) |
| Asks not tied to provider work items (PO) | follow-up: optional `provider_external_id` on dependencies and ADO child-item creation via Edge Function |
| Skill split / multi-pool capacity (EM) | rejected for MVP: one pool per planning unit keeps the model explainable; a "sub-team" planning unit is the workaround |

### Validation round 3 (Fable role agents on the iterated build) and what changed

| Finding (who) | Change |
|---|---|
| My attention ignored the quarter and `lastSeen` was never written; own open asks missing (PO) | scoped to the selected quarter; `lastSeen` persisted per user when leaving the view; new group "Your asks without an answer" |
| Re-sent asks kept the old age; `askedOfUs` always 0; raw JSON in history (PO) | `resentAt`; removed the dead badge and added a team filter ("my team + teams we ask / that ask us"); readable history lines and "answered on/by" per ask |
| Open asks judged against the aggregate remaining while answered asks used the ranked cut: two models on one screen (EM) | `simulateAsk()` inserts the ask at the requester's rank and reports fit, cumulative load and which own epics it pushes below the cut line; used in the intake queue and in the answer dialog (per chosen answer, incl. partial) |
| Absence subtracted after the focus factor; priority-call asks invisible in "if all accepted" (EM) | formula = (headcount × weeks − absence) × focus × (1 − reserve); pending = proposed + needs priority call; SQL view aligned (005) |
| Hidden votes leaked via Overview average and Plan of record (director, coach) | both hide until revealed or locked |
| Regulatory deadline before the quarter start shown as "fits" (director, EM) | new state "deadline before quarter start, not planned earlier" (severity 5 flag + register column), honouring the fiscal-year start month |
| Impediments KPI mixed quarters; "Open (days)" misleading; flag label from text splitting (director) | scoped to this quarter's epics; column renamed "Since last change"; label = epic ref + title |
| Decline dead-end in readiness; phases could be skipped; Supabase adapter lacked session rules (coach) | requester can **Acknowledge** a decline / deferral / priority call (clears readiness); phases advance one step at a time in both adapters; Supabase `setPhase`/`castVote` carry override, vote-blocks-lock, rewind reason, phase and own-team checks |
| New epic in a locked quarter needed no reason; low-vote queue item not tied to a team; reveal not reset on rewind (coach) | all three fixed (`teamId` on discussion items, reset when rewinding to Vote or earlier) |

Rejected / deferred from round 3: regulation as a configured list with 2nd-line owner and audit export (follow-up, section 17.4); per-skill capacity pools (D23); provider-side work-item link (follow-up).

### Code review (Fable, correctness only) and what changed

25 findings, 24 fixed in commit "Fix code-review findings": lazy Supabase client so demo mode runs with no env (AC A1); partial updates in the Supabase adapter use `update` instead of `upsert` (epics, impediments); `createEpic` returns the created epic (board no longer guesses the last row); ROAM changes no longer fail on the title check; empty-state safety (no teams, no quarter, hooks order); cross-cutting discussion items allowed in SQL; stable comparator for the ranked cut; epic team change re-routes its asks and refuses a self-dependency (mock + SQL trigger); rank permission may change the rank only (mock + trigger, closes an RLS hole); `update_with_reason` whitelist and empty-patch guard; `deleteTeam` refuses while asks reference the team; impediments require an epic; partial answers default granted-low to 0 in both adapters; answers blocked in closed quarters; team selectors follow a persona switch; modal focus handling no longer re-runs on every render; DB event names normalised for the diff; `updated_at` bumps only on real changes; settings merge instead of overwrite. Not changed: theme assignment stays with the epic's team (rank holders steer themes via the theme list, not per epic).

### Supabase mode: live test against the owner's project (2026-10-17, branch `claude/pensive-nobel-5232db`)

Status at the time of writing: the owner's project is reachable (new-style publishable key in `.env`; note that the
PostgREST root `/rest/v1/` answers "Secret API key required" to such a key, table endpoints work normally), but
**migrations 001-005 had not been run**: the Feb-2026 tables (`portfolios`, `initiatives`, `counters`, `user_roles`,
the June `quarters` with `quarter`/`stage` columns) were still present and none of the new tables or RPCs existed.
The adapter was therefore first desk-checked against the schema and the mock; the live walk-through follows once
the owner has run 001-006 (001 drops the Feb tables, data loss accepted by the owner).

Desk-check findings and what changed in `src/data/supabaseRepository.js`:

| Finding | Change |
|---|---|
| PostgREST updates zero rows **without an error** when RLS denies an UPDATE, so a planner editing another team's epic saw "saved" and nothing happened | every command mirrors the mock's JS permission and validation checks (same error text in both modes); Postgres texts such as "row-level security" are translated |
| Phase rules (closed quarter read-only, locked quarter needs a reason for removals / asks / capacity) existed only in the mock | `_guardPhase()` on a fresh row from the database, as in the mock |
| Events the triggers do not write were missing: `plan_added`, `dependency_added/edited/acknowledged`, `vote_cast`, `votes_revealed`, `discussion_resolved`, `baseline_replaced`, `import_run` | written by the adapter after the successful write (`_event`, best-effort) |
| History showed the user id instead of a name; check-ins had no author name; the members list showed ids | `memberships.display_name` + `member_directory` view (006); names mapped in `load()` |
| Organisation profile (name, planning-unit label, capacity unit, fiscal year start, no-response days, capacity defaults) lived in memory only | `org_settings.profile` jsonb (006) and `organisations.name` (admin update policy, 006) |
| `capacity_changed` events used a composite id as `entity_id` (uuid column) | `entity_id` null; the diff matches on `after.teamId` as before |
| Capacity and vote rows have no surrogate key in SQL, the UI keys on `id` | `id` synthesised as `team:quarter` in `load()` |
| Rows came back in arbitrary order (the mock keeps insertion order) | sorted by creation time (teams, epics, asks, discussion items, check-ins, impediments), events by time |
| Imported epics: `external_state` not stored, no dependency suggestions, imported title editable | aligned with the mock (AC G3-G5) |
| `resolveImpediment` did not set ROAM to resolved for risks; `requester_name` defaulted to the actor instead of the epic owner | aligned with the mock |

Differences that remain between mock mode and Supabase mode (by design or accepted):

- Reasons for rank / commitment / effort / phase changes reach the triggers through `update_with_reason` (005); a write without a reason is a plain PostgREST update and the trigger logs an empty reason, exactly as the mock does.
- When an answered ask is edited with a reason, the dependency trigger also logs `dependency_answered` (accepted → proposed) next to `dependency_edited`; the mock logs only the edit.
- Deleting an epic cascades in SQL and leaves `epic_plans_removed` / `dependencies_removed` events with an empty reason; the mock deletes silently.
- `plan_events` carry `strategic_rank` (trigger) or `rank` (adapter / mock) in before/after; the UI reads both.
- Each command re-reads the whole state after the write (one request per table); mock mode is in-memory. Screens refresh every 30 s in Supabase mode; there is no realtime (follow-up).
- Settings: `staleDays` and `voteBlocksLock` are columns, the rest of the profile is a jsonb document; the mock keeps one object.
- `members` comes from `member_directory` (006); without 006 a non-admin sees only their own row and history falls back to "former member" for other actors.
- Reload keeps the session (the Feb-era sign-out-on-reload was removed with the auth-lock fix).

Live walk-through (2026-10-17, owner's project, migrations 001-006 run by the owner, signed in as admin):

| Area | Result |
|---|---|
| Auth | **Blocker found and fixed**: every request after the first token refresh hung because `AuthContext` awaited Supabase calls inside `onAuthStateChange` (supabase-js holds its auth lock while the callback runs; `navigator.locks.query()` showed `lock:sb-…-auth-token` held forever). The callback now defers its work to the next tick, ignores `TOKEN_REFRESHED`, reads the role from `memberships` only (`user_roles` was dropped by 001) and no longer signs the user out on reload (that workaround existed for this very hang). Reload keeps the session. |
| Setup | teams, themes, quarters (duplicate → "Quarter exists"), organisation profile (`org_settings.profile` + `organisations.name`), capacity incl. change event: all ok; display name from 006 shown in the header. |
| Epics / plans | create (EP-0001…), validation, partial updates, `plan_added` / `effort_changed` / `commitment_changed` / `rank_changed` events; rank without reason rejected, rank with reason through `update_with_reason`: ok. |
| Dependencies | add (requester team and contact from the epic), self-dependency and zero-effort rejected, answers in Prep rejected by phase rule, decline/defer/partial validations, partial granted effort, priority call creates the discussion item, defer + acknowledge, scope edit resets to Proposed with `resentAt`, delete with reason via `delete_with_reason`: ok. |
| Session | one-step phase rule, votes only in Vote, reason at ≤3, hidden until reveal, cross-cutting discussion item, resolve needs outcome, lock blocked until override reason, baseline stored (plans/deps/capacity), locked-quarter rules for plan / removal / ask / capacity, rewind needs reason and hides votes, vote-blocks-lock setting, re-lock takes a fresh baseline with `baseline_replaced`: ok. |
| In-quarter | check-in with author name, impediment + risk with ROAM, resolve sets ROAM to resolved, `IMP-0001…`: ok. |
| Import | mock ADO: 6 created, 2 suggestions; re-import updates title/state and keeps rank/effort/commitment; title edits on imported epics ignored (D20): ok. |
| Deletes | `deleteTeam` with epics refused; theme delete nulls `themeId`; epic delete cascades and keeps events: ok. |
| Screens | Overview, Board, Dependencies, Session, In-quarter, My attention, Settings render the live data; polling picks up changes within 30 s. |
| UI forms (after merging `main` with the Dutch UI and onboarding wizard, PR #15 and #16) | wizard in Dutch with the profile from Supabase; team added through the form, duplicate name shows the Dutch message; capacity saved through the form with the profile defaults; "Open het bord" stores `setupComplete` (wizard does not return after reload); check-in through the dialog; admin language switch to English and back persists across reloads: ok. |
| Not tested live | planner / viewer accounts (only the owner's admin account exists): RLS for non-admins is desk-checked and mirrored in JS but not exercised against the database — invite a second user to verify (follow-up, section 17.4). |


### Owner questions during the build
- "Which agent is the coordinator?" - this session; the role agents are one-shot reviewers.
- Model: switched to Fable 5.1 mid-session by the owner.

## 17. Organisation configuration — mapping any organisation onto the model

The owner asked how an arbitrary organisation is mapped correctly. The answer is a small, explicit configuration surface (Settings > Organisation setup) and a mapping guide. Everything below exists in the MVP unless marked *follow-up*.

### 17.1 What must be configured (the setup checklist)
| Step | Data | Where | Who |
|---|---|---|---|
| 1. Organisation profile | name; what a planning unit is called (team / squad / product team / department / tribe); capacity unit (person-weeks, or person-days shown as weeks); fiscal-year start month; default weeks per quarter, focus factor, reserve %; check-in cadence; "no response" threshold | Settings > Organisation setup | admin |
| 2. Planning units | the teams that own epics and answer asks; optional ADO area path / Jira project key per team (import mapping) | Settings > Planning units; mapping in the import panel | admin |
| 3. People and roles | admin (facilitator), planner (bound to one planning unit), viewer; `can_rank` flag for whoever sets strategic priority | mock: personas; Supabase: `memberships` rows (*follow-up: invite UI*) | admin |
| 4. Strategic themes | the ordered list the top steers on; "unaligned" is always available | Settings > Strategic themes | can_rank |
| 5. Quarters | the quarter being planned (+ optionally the active one); phases are driven from Session | Settings > Quarters | admin |
| 6. Capacity | headcount + absence per team for the planning quarter, defaults from the profile; teams refine focus/reserve on the board | Settings > Capacity for all teams at once; Board > Capacity assumptions | admin / planner |
| 7. Epics | typed in on the board or imported (ADO mock now; Jira/Trello adapters later) | Board / Settings > Import | planner / admin |

### 17.2 Mapping guide — common organisation shapes
**D23 - One flexible "planning unit" instead of a fixed org hierarchy.** Reason: tribe/squad, department/team, product/line differ per company; modelling levels forces every customer into one shape (the June "Program" trap). The unit is "the thing that owns epics, has capacity and answers asks". Rejected: configurable hierarchy depth (large UI and query cost, little planning value), per-person capacity (becomes resource management, privacy issues).

| Organisation shape | Planning unit | Grouping (label) | Who ranks | Notes |
|---|---|---|---|---|
| Spotify-style tribes/squads | squad | tribe name as label (filter) | tribe leads + CPO with `can_rank` | one admin per tribe if sessions run per tribe (*follow-up: multiple concurrent sessions*) |
| SAFe ART | team | ART or value stream as label | business owners | quarter = PI; confidence vote and ROAM map 1:1 |
| Classic departments | department or team | program/portfolio as label | management team | reserve % tends to be high (run work) |
| Product lines with shared platform teams | product team + platform teams as units | product line as label | product leadership | platform teams live by the intake queue |
| Vendors / external teams | a planning unit with its own capacity (contracted weeks) | supplier name as label | – | treat their asks like any other team |

**Rules of thumb for a good mapping**
1. If two groups negotiate capacity with each other, they are separate planning units. If they never do, merge them.
2. Capacity is per unit per quarter; keep the formula defaults honest (focus 0.6-0.7, reserve 20-40 % for platform/run teams).
3. Labels are cheap; add a program or portfolio label only when someone will filter on it.
4. Only a handful of people get `can_rank`; everyone else influences rank through the discussion queue.
5. Regulatory epics carry the regulation name and a hard date so the register is defensible.

### 17.3 Roles and views (who sees what)
| View | admin (facilitator) | planner | viewer / director (`can_rank`) |
|---|---|---|---|
| Overview | read | read | read (primary) |
| Board | edit all; capacity all | edit own unit's epics, asks, capacity | read; rank + themes if `can_rank` |
| Dependencies | answer for any unit | answer for own unit; raise asks from own epics | read |
| Session | phases, reveal, lock, settings | vote for own unit, raise/resolve discussion items | read |
| In-quarter | all | check-ins and impediments for own unit | read |
| My attention | – (no team) unless also a planner | own unit's asks, answers, stale items | – |
| Settings | all | – | themes if `can_rank` |

### 17.3b Onboarding wizard and demo tour (built 2026-10-17, second iteration)
- **Onboarding wizard** (`src/components/plan/OnboardingWizard.jsx`): shown to admins while `settings.setupComplete` is false. Steps: profile (language, name, planning-unit label, capacity unit, fiscal-year start), teams, strategic themes, first quarter, capacity per team (defaults editable), where epics come from, done. Each step writes through the repository, so leaving halfway keeps progress. Demo mode offers "Start with an empty organisation" (`MockRepository.resetEmpty`) and "Load the demo organisation instead".
- **Demo tour** (`TourPanel.jsx`, `tourScenarios.js`): five role scenarios (director, head of platform, product owner, facilitator, viewer) that switch persona and screen per step and explain what to look at; bilingual prose; navigation only, no data changes. Script for live demos: `docs/demo-script.md`.
- **Language** (`src/i18n/`): English strings are keys, `nl.js` holds Dutch; default `nl` (semi-government is the first target market); switch in the header; stored in `settings.language`. Decision D24: a minimal in-house `t()` instead of i18next. Reason: ~400 strings, no plural/ICU needs yet, zero dependencies; rejected: i18next (weight), separate Dutch build (two deployments).

### 17.4 Follow-ups for configuration
- Invite / membership UI (Supabase: insert into `memberships`, send magic link); today SQL.
- Multiple concurrent sessions (per tribe/ART) = quarter scoped to a label; schema already allows several quarters, a `scope_label` column is the small addition.
- Terminology overrides beyond the unit label (e.g. "epic" -> "feature", "ask" -> "dependency request") as an i18n table; Dutch UI strings.
- Import mapping persistence (`integration_connections.config.teamMapping`) and Jira/Trello adapters behind the same `ExternalEpic` contract.

## 18. Visual foundation (2026-10-17, commit 4822c13)
- **D25 — Design tokens as CSS variables.** Inter Variable (`@fontsource-variable/inter`), `lucide-react` line icons, slate neutrals, one teal accent (#0E7490), status = icon + short label + pastel fill, radius 4/6/8/12, shadows only on floating layers, 150-200 ms motion with `prefers-reduced-motion` honoured, focus rings everywhere. Tokens live in `src/index.css` and are mapped in `tailwind.config.js` (`canvas`, `surface`, `border`, `ink`, `muted`, `accent`, `ok/warn/danger/info`), so a tenant theme (`[data-theme="overheid"]`) swaps colours without a rebuild. Rejected: a component library (weight, look-alike), indigo accent (kept from the Feb prototype, too loud).

## 19. Less is more reset (2026-10-17)

Owner, verbatim gist, late 2026-10-17: *"This is first and foremost about aligning dependencies BASED ON PRIORITISATION (for which we had a nice solution). The Jan/Feb version already had a very nice basis. You turned it into a bloated, unclear monster. ... Less is more."*

The product in one sentence: **rank the epics top-down, then let teams agree on the dependencies — highest priority first.** The reset brings back the Feb information architecture (Prioritization · Dependencies · Alignment, commit `10fe602`) on the current data model and the new visual foundation. Binding spec: `core-reset-spec.md` (side-session notes); it supersedes the earlier revamp brief's screen designs.

### Decisions
- **D26 — Exactly three numbered screens.** `#prioriteren` (home), `#afhankelijkheden`, `#afstemmen`, plus Instellingen (gear) and an account menu (Bekijken als, language, Rondleiding). Slim top bar instead of a sidebar: the Feb version had numbered tabs and three items do not justify a 240 px rail. Rejected: the revamp brief's sidebar + command palette + toasts (more surface, no more clarity).
- **D27 — Extended modules behind one toggle, code kept.** Overzicht, Bord (capacity lanes / cut line), Intake & capaciteit (old Dependencies screen, now `DependenciesView.legacy.jsx`), Sessie (phases, votes, lock), In het kwartaal (check-ins, impediments) and Mijn aandacht leave the navigation. `settings.modules` (default **off**, mock state / `org_settings.profile` jsonb) adds them back as the "Uitgebreid (beta)" group and shows themes, capacity and cadence in Instellingen. Nothing is deleted: the capacity maths, session model and selectors keep working for a later iteration. Rejected: deleting the views (other work may build on them), keeping them in the nav as "advanced" tabs (that is the monster).
- **D28 — `reorderPlans(actor, quarterId, orderedPlanIds, reason='')`.** One command for drag & drop and the arrow buttons: needs rank permission, assigns ranks 1..n in the given order, logs one `rank_changed` event for the plan that moved furthest. The reason is optional (inline "Waarom? (optioneel)", no modal) except in a locked quarter. Supabase: the 005 trigger insists on a reason, so an empty one is stored as "Herprioritering"; only rows whose rank changes are written, each through `update_with_reason`. The panel's rank field also goes through this command so the list never has gaps or duplicates. Rejected: a numeric rank field with mandatory reason modal (the old flow; slow and nobody wrote a useful reason).
- **D29 — Reason required only for "Kan niet" (declined) and "Uitgesteld" (deferred).** "Bespreken" (needs_priority_call) takes an optional reason; "Toezeggen" none. `REASON_REQUIRED` in `domain/model.js`, mirrored in both adapters.
- **D30 — Effort on an ask is optional.** The Feb version had a T-shirt size at most; the inline "+ Verzoek" row has an optional "pw" field. Both adapters only check low <= high. Capacity maths treats 0 as 0.
- **D31 — Four answer states in the UI.** Open · Toegezegd · Bespreken · Kan niet (`ASK_META`). Existing `partial` / `deferred` data is displayed read-only as "Toegezegd (deels)" / "Uitgesteld" and no longer offered as an answer in the core screens; the legacy answer dialog (with partial/deferred) stays in the beta Intake screen.
- **D32 — Wizard in three steps.** Organisatie (name, language) · Teams (one per line, at least two) · Kwartaal + eerste epics ("Team: titel" per line, ranked in the order typed via `reorderPlans`) → "Naar prioriteren". Themes, capacity, fiscal year and unit label left the wizard (still in Instellingen / modules). Optional link to the Azure DevOps demo import.
- **D33 — Three short role tours.** Directeur (prioriteren), Teamlead (aan ons gevraagd), Facilitator (afstemmen); 3-4 steps, one sentence each, Dutch + English, small coach card bottom-right with a `[data-tour]` highlight ring and view nudges (tab, matrix) via a window event. The five long tours were removed.
- **D34 — Copy and density rules.** No explanatory paragraphs; helper text <= 6 words; empty state = one line + one button; max two chips per row; numbers and icons over sentences; demo banner replaced by a small "Demo" chip.

### What each screen shows
1. **Prioriteren** — one table of the quarter's epics by strategic rank (# · Epic · Team · Afhankelijkheden as tiny count chips · Status), drag & drop or arrow buttons (Alt+↑/↓), inline optional reason after a move, flash on the dropped row, collapsed "Nog niet geprioriteerd (n)" with a one-click "Rang" action, a subtle left marker (amber/red) when an ask is Bespreken / Kan niet, search, "+ Epic". Row click opens the simplified panel.
2. **Afhankelijkheden** — team selector; tabs "Wij vragen (n)" (our epics in rank order with their asks and an inline "+ Verzoek" row: team · what · optional pw) and "Aan ons gevraagd (n)" (asks ordered by the requesting epic's rank; segmented Toezeggen / Bespreken / Kan niet; Kan niet asks an inline required reason, Bespreken an optional one).
3. **Afstemmen** — four clickable count tiles; "Te bespreken" = team pairs with Bespreken / Kan niet asks sorted by the highest-ranked epic involved, expandable to the concrete asks (rank · epic · what · status · reason); matrix toggle (team × team, counts, worst-status colour + glyph, axes "vraagt ↓ levert →"), a cell focuses its pair.
- **Epic panel** (`SimpleEpicPanel.jsx`): title, team, quarter, rank (via reorderPlans), effort low–high, asks with status, "Meer" (description, label, team, remove from quarter), "Historie" collapsed. Docked right, slide-in, Esc closes, focus returns. The full `EpicPanel.jsx` stays for the beta views.
- **Instellingen**: Organisatie · Teams · Kwartalen · Mensen & rollen (existing members panel) · Import · Demo · Uitgebreide modules (beta); setup checklist only for teams / quarter / epics while incomplete.

### Seed
Six teams (Payments, Klantportaal, Claims, Polisadministratie, Data Platform, Platform & Security), 16 epics in 2027 Q1 (14 ranked), 13 asks (6 Toegezegd, 3 Bespreken, 2 Kan niet, 2 Open) giving four pairs on Afstemmen. Mock storage key bumped to `kwartaalplan.mock.v2` so existing browsers pick up the calmer seed. Bug fixed on the way: the mock's `createEpic` let `id: undefined` override the generated id.

### Verified
`npm run build` after every step; a bundled Node smoke test against `MockRepository` (seed shape, reorderPlans permissions / ranks / event, answer-reason rules, ask without effort, wizard flow). Browser verification by the lead.
