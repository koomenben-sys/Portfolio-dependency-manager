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
- Multi-tenant signup, billing, per-org settings UI, tenant isolation tests: `db/tests/rls_test.sql` (section 18.2); the schema already carries org_id.
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
- Each command re-reads the whole state after the write (one request per table); mock mode is in-memory. Screens update through Supabase Realtime (008, section 18.3), with a fallback to refreshing every 30 s.
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

**RLS test (added in section 18).** `db/tests/rls_test.sql` checks the policies and triggers for non-admin roles and tenant isolation without real accounts. To run it: open the Supabase SQL editor, paste the whole file, click Run. The grid shows a TOTAL row and one PASS/FAIL row per check. The script makes its own test users (`rls-*@example.invalid`, no password) and two test organisations, runs every check as one of those users inside a rolled-back sub-transaction, and deletes everything again. Locally, `npm run test:rls` runs migrations 001-008 and the same script in PGlite (Postgres in WASM with a minimal Supabase stand-in).


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
| 3. People and roles | admin (facilitator), planner (bound to one planning unit), viewer; `can_rank` flag for whoever sets strategic priority | Settings > People and roles (invite by e-mail, edit role / team / rank, remove; section 18) | admin |
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
- ~~Invite / membership UI~~ — built, section 18.
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

### Iteration 1 (fictive-user tests, 2026-10-18)

Four fictive users (director, team lead / planner, facilitator, viewer) walked the three screens; all scored "calm & clear" 8/10 and "I'd use it" 5-7/10. Every change below removes something or answers the persona's one question in one glance; no explanatory text was added. Binding list: `reset-iteration-1.md` (side-session notes).

| Persona | Finding | Change |
|---|---|---|
| Director, planner, viewer | "Toegezegd" in the Status column: three of four did not know what it referred to. | Status (epic commitment) column removed from Prioriteren; the one signal per row is the dependency state. |
| Director | Count chips "2 ✓ 1 ?" did not answer "what and with whom". | One readable worst-issue cell per row: "✕ Kan niet · Platform & Security", "? Bespreken · Team", "◷ 1 open", "✓ 2 toegezegd", "–"; several asks show the worst plus "+n"; the tooltip lists them all (`WorstIssue` in `core.jsx`). Open uses a clock glyph everywhere. |
| Director | EP-codes and the "Sleep, of Alt+↑/↓" hint were noise. | Codes stay in the panel only; the hint is the drag handle's tooltip. |
| All | Teal badges for ranks 1-3 were unexplained. | One neutral rank badge style; the left marker for Kan niet / Bespreken rows stays. |
| Planner | Wanted to see only her team on Prioriteren. | Team filter "Alle teams" next to search (default all; reordering pauses while filtering). |
| Team lead | Needed the counts of a tab before reading rows, and the load an incoming list puts on the team. | One line of icon+number chips per tab (✕ · ? · ◷ · ✓), each a filter; "Aan ons gevraagd" adds "Gevraagd n pw · beschikbaar n pw" when capacity is set for the quarter (requested = effortHigh of asks not declined; available from `availableWeeks`), red when requested > available. |
| Planner | Epics without asks took space on "Wij vragen"; reasons were too small to read. | Epics without asks collapse into "n epics zonder verzoeken"; reasons under an ask in normal muted text; rank order kept. |
| Planner | "2–3 pw" on outgoing rows was never used. | Effort text removed from "Wij vragen" rows (kept in "Aan ons gevraagd" and the form). |
| Planner | The bin icon on every ask invited mistakes. | Delete appears on hover / keyboard focus only. |
| Team lead | "Bespreken" opened a reason box like "Kan niet". | Bespreken answers in one click; only Kan niet asks for a reason inline. |
| Team lead | The team selector did not read as the page subject. | Title row "Afhankelijkheden · [team ▾]", defaulting to the actor's team. |
| Facilitator | Eye landed on Open/Toegezegd first. | Tiles ordered Kan niet · Bespreken · Open · Toegezegd; the last two quieter (smaller number, muted). |
| Facilitator, director | "Are the top priorities safe?" needed a scan of the list. | One line "Top 5: n in gevaar (rang 2, 5)" from the five highest-ranked epics with a Kan niet / Bespreken ask; rank numbers open the pair. |
| Facilitator | Open asks between two teams were invisible on the agenda. | Open-only pairs listed after the problem pairs in a quieter style; one worst-status chip per pair. |
| Facilitator | Outcomes had to be recorded on another screen during the meeting. | Segmented Toezeggen / Bespreken / Kan niet inline per ask for the provider's planner or an admin; "Besproken" check per pair, session-local (`localStorage` key `kp.discussed.<quarter>`, no domain change). |
| Facilitator | The matrix button competed with the agenda. | Matrix behind a text link "Matrix tonen" at the bottom. |
| All | "Live"/"30 s" chip meant nothing in the demo. | Shown only in Supabase mode; the small DEMO chip stays. |
| Viewer | Disabled inputs in the panel looked broken. | Rank, effort, description and label render as plain text without the rights. |

Deliberate deviations: the optional reason for "Bespreken" has no entry point in the core screens yet (the panel is read-only for asks; adding a field there would be new UI) — the reason survives from an earlier "Kan niet" answer and is shown wherever it exists. The "Besproken" check is per browser, as the list asked.

### Visual polish (2026-10-18)

CSS/Tailwind only, no new UI or text (review: `polish-review.md` in the side-session notes). Rows 48 → 44px; epic titles regular weight and team names muted so the dependency cell is the one medium-weight element per row; table header "#" aligned to the rank badge. Chips are tint-only (no 1px border; `toneBorder()` exists for buttons such as matrix cells); zero-count chips go grey instead of translucent. Nav: active item = ink text + filled number, no tinted pill. Afstemmen: icon inline before the tile label, 32px counts for Kan niet / Bespreken (quiet at zero), 24px muted for the rest; pairs are one card with `divide-y`, expanded asks on the canvas background. `--color-muted` nudged to `#5f6b80` so muted text stays ≥ 4.5:1 on canvas and surface-2.
Wow detail: FLIP reorder on Prioriteren — displaced rows glide 260ms (`useLayoutEffect` measuring `getBoundingClientRect`, skipped under `prefers-reduced-motion`).

## 20. P1: invites, RLS tests, realtime (built 2026-10-17, branch `claude/p1-invites-rls-realtime`)

Migrations `007_invitations.sql` and `008_realtime.sql` (both additive and re-runnable), test `db/tests/rls_test.sql`.

### 18.1 Invitations and member admin
**D35 - An invitation is a row, not an account.** `invitations(org_id, email, role, team_id, can_rank, display_name, invited_by, created_at, accepted_at)`, e-mail lower case and unique per organisation. After sign-in the app calls `accept_invitations()` once (SECURITY DEFINER). The function turns open invitations for the user's **confirmed** e-mail address into `memberships` rows and marks them accepted. An existing membership is left alone. The call runs in an effect after the user is set, never inside `onAuthStateChange` (see section 16). The plan only loads once that call is done, so a new invitee does not see "no membership".
Rejected: creating `auth.users` from the browser (needs the service key); a trigger on `auth.users` insert (the trigger would sit in the auth schema and fire for every sign-up, including people with no invite); `supabase.auth.admin.inviteUserByEmail` (service key, so it would need an Edge Function — a good later option for branded invitation e-mails).

**D36 - The sign-in link only goes out when an admin clicks it.** "Send link" calls `signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: <app url> } })`. This works only for invited addresses and does not touch the admin's own session. With the implicit flow (the supabase-js default here), the link works in the invitee's own browser. In demo mode the invitation is accepted at once, the person shows up in "Viewing as", and the screen says that no e-mail was sent.

**D37 - Invitations are visible to admins only.** The brief also mentioned "member read own org". It was not built: invitees' e-mail addresses are personal data, and acceptance does not need to read the table.

**Guards (same texts in JS and SQL):** an admin cannot remove themselves or change their own role, and an organisation keeps at least one admin (trigger `memberships_guard`, applies only to app users; the SQL editor is not restricted). A planner needs a team, and other roles have no team.

UI: `src/components/plan/MembersAdmin.jsx`, one compact table. It lists members with inline role / team / rank controls, then open invitations as rows with an "Invited" chip, "Send link" and "revoke". An "Invite" button opens a small form. Following owner feedback ("lightweight tool"), the screen has no explanatory text.

### 18.2 RLS and tenant-isolation test
**D38 - Plain SQL, no pgTAP.** The script runs as-is in the Supabase SQL editor. It creates seven throw-away users directly in `auth.users` plus two organisations. Each check switches to role `authenticated` with `request.jwt.claims` (as PostgREST does), inside a sub-transaction that is always rolled back. It compares the count returned, or the error raised, with the expected result. The 73 checks cover:
- team scope;
- strategic rank without `can_rank`;
- viewer read-only;
- a `can_rank` viewer changing the rank only;
- tenant isolation over every table and view in both directions;
- `plan_events` insert-only;
- requester / provider split on asks;
- invitations admin-only, plus acceptance;
- membership guards.

The script cleans up after itself and is re-runnable. Rejected: pgTAP (an extension to enable, and less readable for the owner); a Node test against the live project (needs real accounts or the service key).

**Gaps found while writing the test (fixed in 007).** The 002 policies were wider than the app's rules; the JS adapters hid this, but a direct API call would not have been stopped:
- the requesting team could answer its own ask (`deps_write` covers both teams);
- the provider team could create, edit or delete an ask in the requester's name;
- a `can_rank` user could add or remove plans (`epic_plans_write ... or can_rank`).

Triggers `dependencies_guard` and `epic_plans_guard` now enforce these rules in SQL, with the adapters' error texts.

**Local run:** `npm run test:rls` (PGlite, devDependency `@electric-sql/pglite`). It approximates Supabase (simplified `auth.users`, non-superuser owner) and is not a substitute for running the script on the real project. A negative control was checked: with the 007 guards dropped, the script reports FAIL.

### 18.3 Realtime
**D39 - Supabase Realtime `postgres_changes`, one channel per organisation, debounced reload.** 008 adds the 15 tables `load()` reads to the `supabase_realtime` publication; it checks `pg_publication_tables` first, so it is safe to re-run. `SupabaseRepository.subscribe(onState, onStatus)` listens on every table, filtered on `org_id=eq.<org>` (RLS still decides what each subscriber receives). Events are debounced for 400 ms, because one write fires several (row plus `plan_events`); then the whole state is reloaded once. `MockRepository.subscribe` listens to the browser `storage` event, so two demo tabs stay in sync.

`PlanContext` exposes `liveStatus`:
- `live` (subscribed): a safety refresh runs every 2 minutes, in case events are missed (for example when 008 was not run — Realtime then still reports SUBSCRIBED);
- `polling` (subscription failed or not yet up): refresh every 30 s;
- `offline` (browser offline): the state reloads when the network returns.

`LiveIndicator.jsx` shows a dot plus "Live" / "30 s" / "Offline" in the header.

Rejected: applying the change payload to local state (two code paths, and delete events carry only primary keys under RLS); Broadcast from the client (it would skip RLS and miss writes from triggers or SQL); Presence (not needed yet).

### 18.4 Owner actions and open points
1. Run `007_invitations.sql`, then `008_realtime.sql`, in the SQL editor. Then run `db/tests/rls_test.sql` and check that the TOTAL row says PASS.
2. Supabase Auth > URL configuration: add the app URL (`https://koomenben-sys.github.io/Portfolio-dependency-manager/` and the local dev URL) to the Redirect URLs, otherwise sign-in links fall back to the Site URL.
3. Keep "Confirm email" switched on. Otherwise someone could sign up by password with an invited address and claim the invitation (`accept_invitations` only accepts confirmed e-mail addresses).
4. The built-in Supabase e-mail sender is rate-limited to a few e-mails per hour; for a pilot, set up custom SMTP.

Not tested against the live project: sending sign-in links, accepting an invitation, the Realtime subscription, `rls_test.sql` in the Supabase SQL editor. Possible follow-ups:
- a "send me a sign-in link" option on the login screen (invitees have no password; the session persists, but after sign-out they need a new link from an admin);
- branded invitation e-mails via an Edge Function.


## 21. Release A — Waarde & strategie (built 2026-10-18, branch `claude/release-a-value-strategy`)

Owner brief: `spec-releases-AB.md` (side-session notes), items A1-A4 plus the "ADJUSTMENTS" block, which overrides them. Less is more stays the rule: no new nav item; each feature is one column, one chip, one picker, one panel tab or one Instellingen section. Acceptance: `docs/acceptance.md` section K. Migration `009_value_strategy.sql` (additive, re-runnable).

### Decisions
- **D40 — Goals reuse `themes`.** No new table: `themes` gains `type` ('goal' | 'program', default goal), `must`, `must_deadline` (a month, stored as its first day) and `archived`. UI name "Doel" / "Doelen & programma's"; the beta-only "Strategische thema's" section in Instellingen is replaced by the new core section. Owner and status fields from the first draft were dropped (adjustments): "archiveren" is an action, not a status. Archived goals stay referenced by their epics (history, A4 rows) but leave the pickers and the strategy line. Write permission unchanged: `themes_rank` (admin or `can_rank`), mirrored in both adapters with the same texts ("Themes need rank permission"; type check; "A deadline needs Moet"; "Name is required"). Rejected: a separate `goals` table (duplicate of themes, migration of `epic.theme_id`), a hierarchy goal → programme (nobody asked; a flat list with a type reads fine).
- **D41 — "Moet" is inherited, the epic's own deadline wins.** `effectiveMust(epic, theme)` in `src/domain/value.js`: an epic with `regulatory` + `regulatoryDeadline` shows its own chip; otherwise a "Moet" programme lends its deadline. One chip "Moet · mrt 2027", warn tone, never colour alone.
- **D42 — One filter select, one strategy line.** Prioriteren's filter select carries two optgroups (Teams, Doelen incl. "Zonder doel"), value encoded as `team:<id>` / `goal:<id>` / `goal:none`; the strategy line "Top 10: n Goal · …" is a row of toggle buttons (aria-pressed) that set the same filter. Counts come from `strategyCounts(state, quarterId, 10)` over active goals only; zero counts are rendered muted on purpose (the gap is the signal). Reordering pauses while a filter is active (same rule as the team filter).
- **D43 — One value column, model per organisation, score never stored.** `settings.valueModel` ∈ none | simple | wsjf | rice (`org_settings.profile.valueModel`, no SQL). `epics.value` jsonb holds the model's inputs (`{level}` for simple; `{bv, tc, rr, jobSize}` for WSJF; `{reach, impact, confidence, effort}` for RICE), `epics.value_note` one optional line. `valueScore(model, value, plan)` computes the number: WSJF = (bv + tc + rr) / jobSize, RICE = reach × impact × confidence/100 / effort; job size / effort default to the plan's high estimate in pw until Release B's T-shirt size exists. Simple shows a letter chip H / M / L; the others the number with one decimal. The "volgorde volgens waarde" ghost arrow was dropped (adjustments). WSJF / RICE inputs sit one click deeper (Disclosure "Invoer") so the panel keeps one row. Rejected: storing the score (two sources of truth when the model changes), one column per model.
- **D44 — OnePager = link + light template, three fields.** Research (`onepager-research.md`: SAFe Lean Business Case, Epic Hypothesis, PR/FAQ, Lean / Opportunity Canvas, Dutch startnotitie / PRINCE2 outline) agrees on problem / outcome / scope-risk as the narrative the tool does not already hold; cost, deadline, dependencies and value come from the data. Fields: "Probleem en gevolg", "Gewenst resultaat", "Buiten scope / risico" (`epics.one_pager` = `{problem, outcome, outOfScope}`), plus `epics.one_pager_url`. The panel gets two tabs (Epic · OnePager); the template is collapsed until something is filled. `hasOnePager(epic)` drives the small document icon in lists. Printing uses a portal (`PrintSheet`) that is hidden on screen and the only thing visible under `html.print-sheet` in print, so no route is needed and the layout is identical for every epic. Rejected: a rich-text editor, more than three fields, a separate OnePager route.
- **D45 — Kwartaalresultaat is a view without a nav item.** `#kwartaalresultaat` is reachable from a button on Afstemmen (every role, viewers included) and by URL; it is not listed in CORE or EXTENDED. `quarterResult(state, quarterId, model)` in `domain/value.js` gives one row per goal — Moet programmes first, then goals / programmes by position, "Zonder doel" last — with planned, committed (every ask of the epic answered Toegezegd, or no asks), value in the pipeline (sum of scores with a model, else the count) and at most five not-committed titles with the blocking team (team of the worst ask; "open" when only unanswered asks). Top line "Top 10: n toegezegd · m in gevaar" uses the same definitions over the ten highest ranks. Print: A4 landscape via a named page (`page: landscape`), header hidden with `data-print="hide"`. CSV: UTF-8 with BOM, semicolons (Dutch Excel), one row per goal. Rejected: reviving Overzicht (dropped in D27), per-team rows (that is Release B's Afsluiten).
- **D46 — Cycle phase indicator, read-only.** `cyclePhase(phase)` maps the eight quarter phases to Voorbereiden / Event / Uitvoeren / Afsluiten and shows one muted word next to the quarter selector. Setting the phase from this indicator touches `setPhase` (one step at a time, baseline on lock) and is left for Release B (B4/B6).
- **D47 — Link field.** Non-imported epics can carry an `externalUrl` (ADO / Jira / intranet) through one "Link" input in the panel's "Meer"; imported epics keep the source-mastered link read-only (D20).

### Data
- 009: `themes.type text not null default 'goal' check (type in ('goal','program'))`, `themes.must boolean not null default false`, `themes.must_deadline date`, `themes.archived boolean not null default false`; `epics.value jsonb not null default '{}'`, `epics.value_note text not null default ''`, `epics.one_pager jsonb not null default '{}'`, `epics.one_pager_url text`. Existing policies cover the new columns (`themes_rank`, `epics_write`); realtime publication already contains both tables.
- `rls_test.sql`: seven new checks (planner cannot change a goal's type / archive it, can_rank viewer archives a goal, planner writes value / one_pager of own epic only, viewer cannot write a OnePager, unknown type refused). Total 80. The PGlite runner applies 009 (twice).
- Mock storage key bumped to `kwartaalplan.mock.v3`; `load()` also back-fills the new fields on older saved states.

### Seed (demo)
Goals: Klantcontact digitaal, Efficiënte operatie, Datagedreven sturen; programmes: DORA (Moet, deadline March 2027), Kernmigratie. Top-10 spread 5 · 3 · 1 · 1 · 0. Three planned epics without a goal (Customer 360 dataset, Product catalogue single source, Kubernetes platform upgrade). Value model Eenvoudig with H / M / L on the 2027 Q1 epics. OnePagers: Digital claims intake (template), Self-service policy changes (link + template), Policy admin migration wave 2 (template), DORA ICT register (link only).

### Verified
`npm run build` after every commit; `npm run test:rls` (PGlite); a Node smoke test over `MockRepository` for goals (permission, type, deadline, archive), value and OnePager writes, `strategyCounts` and `quarterResult` on the seed; browser check of the three screens, the panel tabs, Instellingen and `#kwartaalresultaat` in demo mode (port 5180).

### Iteration 1 (2026-10-19, director + PMO usability test: calm 7, useful 6-8)
- **D48 — Fewer signals, plainer words.** Prioriteren: strategy line "Top 10 per doel: Goal n · …" sorted by count, empty goals muted after "geen:"; at most two signals per row (Moet chip, dependency cell) — the coloured left bar, the OnePager icon and the "+n" suffix went; the value letter lost its chip. OnePager tab: a filled template shows directly, an empty one is one "+ Sjabloon invullen" link; facts cut to rang · doel · Moet (when set) · verzoeken (team — status), "laatste wijzigingen" only when present (print keeps all facts). Kwartaalresultaat: title "Wat gaat door en wat niet" + date line, top line in words, reason per not-committed epic on its own line ("Kan niet — reden", "Bespreken — reden / nog in gesprek", "Open — wacht op team"), Moet chips on rows and titles, "Zonder doel" only with epics, Waarde header tooltip, CSV export removed (boards print). After the re-test (director and PMO: calm 8, useful 7) the value-sum column left Kwartaalresultaat too ("a number I cannot explain to the board"), and "Afdrukken" moved below the facts, away from the empty link field. Asked for but deferred: decision owner + date per at-risk item, capacity cut line (Release B), Moet deadline risk text. `epicStanding` now returns the worst ask's reason and provider for every non-committed status.

### Left out on purpose
WSJF job size / RICE effort from a T-shirt size (Release B1), setting the cycle phase from the indicator (B4/B6), value-order hints, OnePager on the beta views (`EpicPanel.jsx` unchanged), per-epic `plan_events` rows for value / OnePager edits (not a rank, commitment, answer or phase change; history stays calm).

## 22. Release B — Capaciteit & ritme (2026-10-19)

Owner brief: `spec-releases-AB.md` B1-B6 plus the "ADJUSTMENTS" block (side-session notes). Acceptance: `docs/acceptance.md` section L. Migration `010_capacity_rhythm.sql`.

### Decisions
- **D50 — Size writes the range.** `size` ∈ S | M | L | XL on `epic_plans` and `dependencies`; the organisation maps sizes to pw ranges (`org_settings.profile.sizeMap`, defaults S 1–2, M 2–4, L 4–8, XL 8–13). Picking a size writes the range into `effort_low` / `effort_high`, so `capacity.js` and every sum stay unchanged; changing the mapping later does not rewrite old records (they keep their numbers). Rejected: computing pw on read (two sources of truth, breaks the database checks on effort).
- **D51 — Team-level capacity, calendar-based.** Owner decision after AVG / OR concerns: no slots, no names. `team_capacity` keeps its row per team and quarter: `headcount` = FTE ingevuld, new `fte_vacant`, `absence_weeks` = verlofweken (team total), `reserve_pct` = run %. Formula `max(0, FTE × werkdagen / 5 − verlofweken) × (1 − run%)`; werkdagen = weekdays of the quarter (fiscal start from settings) minus Dutch public holidays on weekdays (`src/domain/holidays.js`, Easter by the anonymous Gregorian algorithm; Goede Vrijdag and Bevrijdingsdag not included). `focus_factor` and `weeks` stay in the table for older rows but are no longer read by the core screens (the run % is the only deduction the owner wanted). Vacancies: same formula for `fte_vacant` without leave, shown as "+Y pw als gevuld", never added to Beschikbaar.
- **D52 — Certainty belongs to the ask and its requester.** It describes how sure the requesting team is of what it asks (scope / estimate), next to the size in the ask form; the provider expresses doubt through its answer (Bespreken) and later its signal. Default Midden.
- **D53 — Bottlenecks are derived, never stored.** `bottleneckFor(state, dep)` in `src/domain/rhythm.js`: Boven capaciteit (provider `teamLoad` > 100%) → Grote job (L / XL or high ≥ 8 pw) → Lage zekerheid; one chip, first match. Afstemmen counts pairs with a bottleneck in "Te bespreken" after the Kan niet / Bespreken pairs.
- **D54 — Plan vastzetten = one command.** `lockPlan(quarterId, reason)` stores the baseline and sets phase `locked` from any earlier phase in one step (the old step-by-step session flow stays in beta). "gewijzigd" compares the current plan with `quarter.baseline` per plan (rank, commitment, size / effort, ask answers) via `changedSinceBaseline(state, quarterId)`; the tooltip uses the last `plan_events` reason after `lockedAt`.
- **D55 — Signals on accepted asks, provider-owned.** `dependencies.signal` (on_track | at_risk | wont_make, default on_track), `signal_note`, `signal_at`, `confirmed_at`. Command `setSignal(depId, signal, note)` and `confirmSignal(depId)`. Worst signal beats Toegezegd in the Prioriteren dependency cell. Cadence: `org_settings.profile.cadence` = `{ mode: 'exception' | 'sprint', weeks: 2 }`; in sprint mode an accepted ask needs confirmation when `max(signal_at, confirmed_at)` is before the start of the current sprint (counted from the quarter start). Reminders are a quiet link in the core screen, no e-mail.
- **D56 — Afsluiten is a view behind the phase word.** `#afsluiten`, not in the nav. The phase word becomes a small menu for admins (Plan vastzetten / Kwartaal afsluiten / Afsluiten openen) and a link for everyone once closed. "Toegezegd" = epics whose plan was in the baseline with all asks accepted (or the current committed set without a baseline); "Geleverd" = `epic_plans.delivered` (team planner or admin). Voorspelbaarheid = geleverd / toegezegd per team. `carryOver(planId)` creates an unranked plan in the next quarter (idempotent) with an event row.

### Data (010)
`team_capacity.fte_vacant numeric(4,1) not null default 0 check (>= 0)`; `epic_plans.size text check (size in ('S','M','L','XL'))`, `epic_plans.delivered boolean not null default false`; `dependencies.size` (same check), `dependencies.certainty text not null default 'medium' check (in ('low','medium','high'))`, `dependencies.signal text not null default 'on_track' check (in ('on_track','at_risk','wont_make'))`, `signal_note text not null default ''`, `signal_at timestamptz`, `confirmed_at timestamptz`. `dependency_guard()` is replaced: size / certainty join the requester-only columns, the signal columns are provider-only. Existing policies cover `team_capacity` (`capacity_write` = can_write_team) and `epic_plans`.
- **D57 — Concept review (director, team lead, PMO; 2026-10-19).** All three asked to cut Sprintkadans, certainty and FTE vacant; these are explicit owner decisions (2026-10-18), so they stay but cost nothing by default: Op uitzondering is the default and prompts nothing, certainty defaults to Midden and is one small control in the ask form, FTE vacant defaults to 0. Cut on their advice: "Alles doorschuiven" and the "n wijzigingen sinds vastzetten" line on Afsluiten. Noted for the owner: the team lead fears a predictability % per team reads as a performance score (works council); the owner kept it visible and can revisit. Backlog: all-teams roll-up (load band + in gevaar per team on one line), predictability trend export, a copyable session summary for Teams / Slack.
- **D58 — "Gevraagd" on the capacity line is the team's load, not only incoming asks.** The line uses `teamLoad` (own plans that are not Niet toegezegd + committed asks, high estimates) so the band, the "Boven capaciteit" chip (D53) and the number the planner reads are one and the same; the old "Gevraagd n pw · beschikbaar n pw" line on Afhankelijkheden (incoming asks only) is replaced. `teamCapacity(state, teamId, quarterId)` in `capacity.js` returns everything the line shows; `teamLoad` and `rankedLoad` now pass the quarter's working days, so the beta screens follow the same formula.
- **D59 — Two small commands instead of widening `setPhase`.** `lockPlan` and `closeQuarter` are their own commands (both adapters, admin only) because `setPhase` advances one step at a time and carries the session-flow checks (votes, readiness) that the core screens no longer use; `closeQuarter` goes from locked or active to closed in one step. Both leave exactly one `phase_changed` row (mock: `_event`; Supabase: the 003 trigger via `update_with_reason`). `carryOver` writes the next quarter's plan without a reason even when that quarter is locked: the `carried_over` row is the record. Afsluiten is reachable by URL during Uitvoeren (Geleverd can be ticked before closing); the phase-word menu offers it only once the quarter is closed, as L10 says.
- **D60 — Top 5 during Uitvoeren counts both.** The Afstemmen top line adds asks with In gevaar / Gaat niet halen to the Kan niet / Bespreken ones while the quarter runs (a declined ask in a running quarter is still a risk); before lock it is unchanged. Afstemmen's "Te bespreken" includes committed asks that carry a bottleneck chip, so the count and the list agree.

### Data (010), continued
`log_epic_plan()` is replaced as well: a rank-only user cannot change `size` or `delivered`, and the `effort_changed` row carries the size. `rls_test.sql` gains 21 checks (section 11: requester sets size / certainty, provider cannot; provider signals and confirms on a committed ask, not on an open one, requester cannot; admin may; bad size / certainty / signal values refused; delivered by own team and admin only, rank-only refused; `fte_vacant` own team only, never negative). Total 101; the PGlite runner applies 010 twice.

### Built (2026-10-19, branch `claude/release-b-capacity-rhythm`)
- Domain: `holidays.js` (Easter, nine fixed holidays, `workingDays(q, fiscalStart)`), `capacity.js` (`availableWeeks(cap, workdays)`, `vacantWeeks`, `teamCapacity`; legacy formula only when no working days are passed), `rhythm.js` (sizes + `sizePatch`, certainty, `bottleneckFor`, `changedSinceBaseline`, signals + `worstSignal`, cadence + `needsConfirmation`, `closeRows` / `predictability`, `nextQuarter`); `buildBaseline` stores `size`.
- Repository (mock and Supabase, same texts): `size` on `upsertPlan` / `addDependency` / `updateDependency`, `certainty` on asks, `upsertCapacity` with `fteVacant` + `checkCapacity`, `lockPlan`, `closeQuarter`, `setSignal`, `confirmSignal`, `setDelivered`, `carryOver`, `sizeMap` / `cadence` validated in `updateSettings`. Mock key `kwartaalplan.mock.v4`, `load()` back-fills the new fields; the Supabase adapter normalises them so a database without 010 still loads.
- UI: `core.jsx` gains SizePicker, SizeText, SignalChip / SignalControl, BottleneckChip, ChangedMark, CapacityLine, ConfirmDialog; `CycleActions.jsx` (phase-word menu, lock / close dialogs); `CloseView.jsx` at `#afsluiten`. Afhankelijkheden: capacity line + four-field dialog, size + certainty in the ask form, signal control with optional note and "Bevestigen" on committed asks, read-only signal in Wij vragen. Prioriteren: compact capacity line for a team filter, "gewijzigd" marker with tooltip, worst signal in the dependency cell. Afstemmen: bottleneck chips, "Plan vastzetten", top line with signals. Epic panel: size picker (numbers stay editable without a size), signals on asks. Instellingen › Organisatie: Jobgroottes and Sturen. Dutch for every new string (`nl.js`); "At risk" now reads "In gevaar" everywhere.
- Seed: capacity rows with the four numbers for every quarter (2027 Q1: Platform & Security 126% overvraagd, Polisadministratie and Data Platform krap, Payments 1 vacant), sizes on five plans and six asks, one Laag-certainty ask (DEP-0013), DEP-0021 in 2026 Q4 accepted and In gevaar ("Pentest schuift"), 2026 Q3 closed with a baseline and seven committed plans (five delivered).

### Verified
`npm run build`; `npm run test:rls` (101 checks, two runs, 010 applied twice); a Node smoke test over `MockRepository` and the domain (holidays 2027 Q2 = Koningsdag, Hemelvaart, Pinkstermaandag → 62 working days; Payments 6 FTE / 4 leave / 20% → 56,3 pw and +9,9 pw if filled; size writes and clears the range, mapping change leaves old records; requester / provider / rank-only permissions; lockPlan once, one event, "Rang 9 → 4 · DNB vraag" after a reorder; sprint cadence prompt and confirm; closeQuarter; predictability 50% → 100% after Geleverd; carryOver once, refused into a closed quarter); browser check in demo mode (port 5182) of Afhankelijkheden (both tabs), Afstemmen, Prioriteren with and without team filter, Afsluiten for 2026 Q4.

### Left out on purpose
Per-person or per-slot capacity (AVG / OR), manual bottleneck flags, e-mail or push reminders for the sprint cadence, "Alles doorschuiven" and the "n wijzigingen" line on Afsluiten (D57), a Supabase live test of the new commands and of 010 against the owner's project (SQL is never run from here; the owner pastes 010 and `rls_test.sql`), editing size / certainty of an existing ask from the core screens (the ask form sets them; `updateDependency` accepts both), the beta views (`EpicPanel.jsx`, Bord, Intake) which keep their old capacity fields.

### Iteration 1 (2026-10-19, director + team lead on screenshots)
- **D61 — Keep the core screens as short as before.** Scores: Afhankelijkheden, Prioriteren and Afsluiten 8-9 calm; Afstemmen 5 because bottleneck-only pairs lengthened "Te bespreken" (9 rows). Now pairs whose asks are all committed but carry a bottleneck fold into one collapsed "Knelpunten (n)" group under the list (6 rows again in the demo). The provider's signal control is hidden while Op koers: a quiet "Signaal" button appears on row hover / focus; the three-way control shows only once a signal is set or the button is used. Kept against persona advice because they are owner decisions: "gewijzigd" markers (B4) and per-team predictability (B6, flagged again: both personas fear blame). Also fixed: the demo seed planned "Storm-season claims surge tooling" twice in 2026 Q4 (now "Pen-test remediation backlog" is the post-lock addition), two helper lines shortened to ≤ 6 words, Afsluiten no longer repeats the phase word when closed.
- **D62 — Owner trim (2026-10-19).** Removed: the predictability percentage on Afsluiten (total and per team), the "gewijzigd" markers on Prioriteren (with `ChangedMark` and the Release B `changedSinceBaseline` in `rhythm.js`; the beta views keep the older one in `plan.js`), and the reason field in the "Plan vastzetten" and "Kwartaal afsluiten" dialogs. Plan vastzetten stays: it marks the end of the quarter session (baseline = what was agreed), turns on the reason rule for rank changes and the signals, and gives Afsluiten its committed list.

## 23. Phases drive the steps; Voortgang; Volgen (2026-10-19)

Owner direction in chat (2026-10-19): three phases that cycle (Planning → Uitvoering → Afgesloten → Planning), three steps per phase, impediments belong in Voortgang, and a "volgen" filter so nobody has to see everything during execution. Acceptance: `docs/acceptance.md` section M. Migration `011_follows.sql`.

### Decisions
- **D63 — Three phases, read from the quarter.** `cyclePhase()` maps the eight stored phases onto Planning / Uitvoering / Afgesloten (Event folds into Planning: the quarter session is a moment, "Plan vastzetten" ends it). No schema change; the old step-by-step phase flow stays in the beta Sessie view.
- **D64 — Steps per phase, not more tabs.** The nav stays three numbered steps; step 2 and 3 change meaning with the phase (Afhankelijkheden → Afgestemd; Afstemmen → Voortgang → Resultaat). Step 1 keeps the name Prioriteren in every phase (one screen, its mode changes). Rejected: a fourth "Uitvoering" tab that appears only sometimes (unstable nav; against less is more), and a menu behind the phase word (hidden; replaced by buttons at the end of step 3).
- **D65 — Voortgang is the execution screen.** One top line plus three sections that hide when empty: In gevaar (signals), Impediments (the existing `impediments` table and commands, kind 'impediment' only; risks/ROAM stay beta), Nieuw sinds vastzetten. No charts, no burn-up.
- **D66 — Resultaat merges Kwartaalresultaat and Afsluiten.** One screen per closed quarter; the old routes redirect. During Planning the result table stays reachable from Afstemmen as a tussenstand.
- **D67 — Volgen is personal.** `epic_follows (org_id, user_id, epic_id)`, RLS: a user reads and writes only own rows. No notifications (yet); it is a filter. Mock keeps follows per actor id in state.

### Decisions made while building (2026-10-19, branch `claude/phase-tabs`)
- **D68 — One `state.follows`, two shapes.** Supabase `load()` returns the current user's epic ids as an array (RLS already filters to own rows); the mock keeps `{ [actorId]: epicId[] }` so the demo personas each have their own list. `followsOf(state, actorId)` in `src/domain/follows.js` reads both, so no screen knows the adapter. Following writes no `plan_events` row (personal, not a plan change). "Alleen gevolgd" is remembered in `localStorage` under `kp.followOnly.<actorId>`, wrapped in try/catch.
- **D69 — Resultaat exists only once the quarter is closed.** `#resultaat` and the old `#afsluiten` during Uitvoering normalise to Voortgang (M2's "same step number" rule); "Geleverd" is ticked after "Kwartaal afsluiten". This drops D59's "Afsluiten reachable by URL during Uitvoeren". `#kwartaalresultaat` stays the tussenstand during Planning only; in the other phases it lands on the phase's step 3.
- **D70 — Impediments belong to a quarter through their epic.** The `impediments` table has no quarter column and gets none: Voortgang lists open rows of kind `impediment` whose epic has a plan in the selected quarter (`openImpediments` in `rhythm.js`). Risks and ROAM stay in the beta In-quarter view.
- **D71 — Step 2 has two hashes, one screen.** `#afhankelijkheden` (Planning) and `#afgestemd` (Uitvoering / Afgesloten) both render `DependenciesView`; the screen reads the phase itself (title, "na vastzetten" labels, "Alleen gevolgd", read-only when closed). A hash that belongs to another phase is replaced in the URL (`history.replaceState`) with the step actually shown, so links stay honest.
- **D72 — Transition buttons sit at the end of step 3.** "Plan vastzetten" moved from the Afstemmen header to its last row (next to the matrix toggle); "Kwartaal afsluiten" is the last row of Voortgang; after closing, the hash becomes `#resultaat` and the steps switch by themselves. `CycleActions.jsx` keeps the two confirm dialogs only.
- **D73 — Week counter from the calendar.** `quarterWeek()` counts 7-day weeks from the quarter's calendar start (fiscal start honoured) and clamps to 1..total, total = weeks between the start of this and the next quarter (13 for a normal quarter).

### Built
- Domain: `cyclePhase()` now Planning / Execution / Closed, `STEPS`, `STEP_LABEL`, `stepForPhase()` (model.js); `quarterWeek`, `openImpediments`, `isPostLock` (rhythm.js); `followsOf`, `readFollowOnly` / `writeFollowOnly` (follows.js).
- App: three numbered steps per phase, plain phase word, `resolveView()` for the old hashes; `CycleActions.jsx` reduced to `LockPlanDialog` / `CloseQuarterDialog`.
- Screens: `ProgressView.jsx` (Voortgang: top line, In gevaar, Impediments with "+ Impediment" dialog and "Opgelost", Nieuw sinds vastzetten, "Alleen gevolgd", "Kwartaal afsluiten"); `ResultView.jsx` (Resultaat: `ResultTable` from `QuarterResultView.jsx` + "Geleverd per team" with "Doorschuiven naar <kwartaal>", print); `CloseView.jsx` removed. Afhankelijkheden in Afgestemd mode (M3); Prioriteren "Gevolgd (n)" filter and stars (M4/M8); Afstemmen lock button at the bottom (M7); epic panel "Volgen" toggle.
- Primitives (`core.jsx`): `FollowStar`, `FollowButton`, `FollowOnlyToggle`, `PostLockMark`.
- Data: `followEpic` / `unfollowEpic` in both adapters; `011_follows.sql` (table, RLS own rows only, additive, re-runnable); `rls_test.sql` section 12 (10 checks, total 111; `epic_follows` added to the tenant sweep); PGlite runner applies 011 twice. Mock key `kwartaalplan.mock.v5`, back-fill adds `follows: {}`.
- Seed: 2026 Q4 keeps IMP-0001 (12 days) and IMP-0002 (3 days) open, gains DEP-0022 created after the lock; nobody follows anything. Tours: the stale "streepje links" line now names the Afhankelijkheden column; the facilitator tour ends on "Plan vastzetten". Dutch for every new string.

### Verified
`npm run build`; `npm run test:rls` (111 checks, two runs, 011 applied twice); a Node smoke test over `MockRepository` and the domain (phase → steps for all eight phases and the old hashes; seed: two open impediments, one older than 7 days, one post-lock ask, no follows; `quarterWeek` on 2 Nov 2026 = week 5 of 13, clamped at both ends; follow / unfollow for a director and a viewer, idempotent, private, no event rows, Supabase array shape; impediment raise with owner and IMP-0006, viewer refused, resolve; `closeQuarter` admin only and from Uitvoering only, one `phase_changed` row, steps switch to Resultaat, closed quarter refuses new asks; `lockPlan` → Execution; back-fill). Browser (demo, port 5182): 2027 Q1 shows "Planning" with Prioriteren · Afhankelijkheden · Afstemmen, 2026 Q4 "Uitvoering" with Afgestemd · Voortgang ("Week 3 van 13 · 1 in gevaar · 2 impediments", three sections, Kwartaal afsluiten), 2026 Q3 "Afgesloten" with Resultaat (table + Geleverd per team, Doorschuiven naar 2026 Q4), `#afsluiten` → `#voortgang`, "na vastzetten" on DEP-0022, Volgen in the panel → star in the list and "Alleen gevolgd (1)".

### Left out on purpose
A Supabase live test of `followEpic` / 011 (SQL is never run from here; the owner pastes 011 and `rls_test.sql`); `epic_follows` in the realtime publication (personal rows, the writer's own `run()` reloads); notifications for followed epics; a "Gevolgd" filter on Afstemmen and Resultaat (M8 names Prioriteren, Afgestemd and Voortgang); risks / ROAM on Voortgang; editing an impediment's title or owner from the core screen; the beta views (Sessie, In het kwartaal) which keep the eight-phase flow and the old impediment table.

### Iteration 1 (2026-10-19, director 8/7, team lead 7/7 on screenshots)
- **D74 — Less in execution.** The "Top 10 per doel" line shows only during Planning; "Alleen gevolgd" appears once you follow something; the result table lists only goals with epics in the quarter (no 0/0 rows; "Zonder doel" only when it has epics); Resultaat shows no delivered counts (in line with D62). Not changed, for the owner: both personas again asked to drop the per-pair "Besproken" checkbox and the Open / Toegezegd tiles on Afstemmen (owner-approved core UI), and the director misses a cross-team early-warning overview (backlog).

## 24. Skins and display follow-ups (2026-10-20)

Two visual skins on one layout (PR #24) plus the owner-approved follow-ups (branch `claude/skins-followups`). Nothing here changes behaviour or data; only tokens, layout width and per-device preferences.

### Decisions
- **D75 — Skins are tokens, not components.** `src/index.css` holds every themeable value as a CSS variable on `:root` (Zakelijk, default) and overrides them under `:root[data-skin='speels']` (grey canvas, floating white panels, pill controls, Figtree + Bricolage). `tailwind.config.js` maps the token classes (`bg-surface`, `bg-surface-2`, `bg-canvas`, `border-border`, `text-ink`, `text-ink-2`, `text-muted`, `text-faint`, `bg-accent` / `text-accent-*`, status tones, `rounded-*`, shadows). The skin is an organisation setting (`settings.skin`, Instellingen › Organisatie, `org_settings.profile` in Supabase); `App.jsx` sets `html[data-skin]`. The beta views and their legacy components use the same token classes (no `gray-*` / `indigo-*` left), so they follow the skin without a layout change.
- **D76 — Presentatiemodus is personal and per device.** One icon button in the header (`aria-pressed`) sets `html[data-present]`; `body { zoom: 1.25 }` scales the whole app for the beamer in both skins without touching tokens or breakpoints. Stored in `localStorage` (`kp.present`, try/catch), never in org settings; not applied in print. No global shortcut.
- **D77 — Afhankelijkheden side by side from xl.** At ≥ 1280px "Wij vragen" and "Aan ons gevraagd" are two columns, each with its own heading, count and answer chips (`ColumnHead`); below xl the tabs stay. The capacity line sits above both. Same list components, same answering and asking.
- **D78 — Kolomkeuze on Prioriteren.** A "Kolommen" menu (`menuitemcheckbox`) shows or hides Team, Waarde (only with an active value model), Aantal afhankelijkheden (asks on the epic this quarter), Afhankelijkheden and Doel. Title and rank always show. Defaults are what was shown before; the choice is per user per device (`localStorage` `kp.prioCols`, try/catch).
- **D79 — Content column 1440px.** `#main` grew from 1200px to 1440px so the core screens use a wide display; tables and rows stretch (`w-full`), the side-by-side columns fill it, and text lines stay readable inside their panels. The header nav hides its scrollbar when it has to scroll (presentatiemodus on a narrow beamer).

### Verified
`npm run build`; `npm run test:rls` (111 checks, two runs). Browser (demo, port 5176) in both skins: Prioriteren with the Kolommen menu (Aantal and Doel on), Afhankelijkheden at 1440 / 1920 / 2560px (two columns) and 375px (tabs), presentatiemodus on Afstemmen, LoginView (Supabase mode, port 5177), Overzicht and Bord (beta). No console errors.

### Left out on purpose
A skin per user (owner: organisation-wide); a presentatiemodus shortcut; column choice stored in the organisation; the beta views' own radii and shadows (mechanical colour mapping only).

## 25. Uitvoering feedback (2026-10-21, branch `claude/uitvoering-feedback`)

Owner review of the Uitvoering phase (demo, 2026 Q4, viewing as Joris Smit). Eleven items A-K, one commit each; acceptance `docs/acceptance.md` section N; migration `012_epic_owner.sql`.

### Decisions
- **D80 — Toegezegd is derived, not stored.** `isCommitted(plan, asks)` / `committedEpicIds()` in `rhythm.js`: a plan counts as committed when its commitment is `committed` or `at_risk`, or when it has at least one ask and every ask is accepted; `not_committed` never counts and a draft / discuss plan without asks does not either (nobody said yes). In Uitvoering and Afgesloten Prioriteiten splits the ranked list into "Toegezegd dit kwartaal (n)" and a muted "Niet toegezegd (n)"; rank numbers stay, Planning shows one list. `closeRows()` keeps its baseline-based rule for Resultaat. Rejected: a stored flag (one more thing to maintain) and reusing `closeRows` (it reads the baseline, which Prioriteiten should not).
- **D81 — Eigenaar is free text on the epic.** `epics.owner_name` existed since 001 but was only used as the requester's name; it is now the project manager / product owner, editable in the panel by whoever may edit the epic and an optional column "Eigenaar" (default on) in Kolommen. 012 restates the column so the file documents the field. Rejected: a member picker (owners are often not users of the tool).
- **D82 — One Afhankelijkheden cell.** "4/5 toegezegd" coloured by the worst state, then the worst signal or answer when there is one ("· In gevaar · Platform & Security", "· Kan niet · Data Platform", "· 2 open"). The separate Aantal column is gone; a stored column choice for it is dropped on read.
- **D83 — Asks and answers are fixed from the lock on.** `phaseAllows('ask' | 'answer')` ends at `locked`; both repositories throw `PermissionError` ("Verzoeken / Antwoorden staan vast na het vastzetten"); `dependency_guard()` (012) refuses insert, ask-field update, answer update and delete when the quarter is locked, active or closed, for admins too. The provider's signal and `confirmed_at` stay allowed until the quarter closes; cascades from a deleted epic and the SQL editor are not restricted. Afgestemd shows chips instead of answer buttons, no "+ Verzoek" and no remove. This supersedes M3's "a new ask can still be added after the lock"; the "na vastzetten" label stays for asks that already exist. Rejected: a reason-based exception (the owner wants the agreement to be stable; changes belong in the next quarter's planning).
- **D84 — Header.** The Demo badge sits next to the logo; the phase is a chip (ok tint for "In uitvoering", neutral for Planning / Afgesloten; `PHASE_CHIP` in model.js). Step 1 reads "Prioriteiten" outside Planning (`stepLabel()`), also as the page title; "+ Epic" shows only while planning; the column Doel is labelled "Strategisch doel"; the unranked group is "Backlog (n)", collapsed.

### Built
- `App.jsx` (badge, chip, step label), `model.js` (`PHASE_CHIP`, `stepLabel`), `rhythm.js` (`isCommitted`, `committedEpicIds`), `plan.js` (`phaseAllows('ask')`, `ASKS_FIXED`, `ANSWERS_FIXED`), `core.jsx` (`WorstIssue` rewritten), `PrioritizeView.jsx` (groups, owner column, merged cell, Backlog, + Epic rule), `SimpleEpicPanel.jsx` (Eigenaar), `DependenciesView.jsx` (`mayAsk` / `mayAnswer` / signals), both repositories (`_guardAsk`, lock check in `answerDependency`), `012_epic_owner.sql`, `rls_test.sql` sections 13-14 (122 checks), PGlite runner applies 012.
- Seed (item K, mock key `kwartaalplan.mock.v6`): 2026 Q4 has 16 plans (two not committed, one backlog), 17 asks across every team (13 committed, 2 can't, 2 discuss), three signals (two In gevaar, one Gaat niet halen with a line), owners on 28 of 32 epics, values on the Q4 / Q3 epics; 2026 Q3 gets three asks next to its delivered flags; 2027 Q1 unchanged.

### Verified
`npm run build`; `npm run test:rls` (122 checks, two runs, 012 applied twice); a Node smoke test over `MockRepository` (answer / add / edit / remove refused in 2026 Q4 and 2026 Q3 for planner and admin, signal and confirm allowed, answer allowed in 2027 Q1, owner saved by a planner and refused for a viewer). Browser (demo, port 5176, both skins, 1440 and 375px, Anouk / Joris / Pieter): header badge and chip, Prioriteiten with the two groups and the Eigenaar column, Afgestemd read-only with the provider's signal control, Planning unchanged ("Prioriteren", "+ Epic", one list, Backlog (2)), Afgesloten read-only. No console errors. Pre-existing and untouched: at 375px the Prioriteren header controls and the top bar overflow horizontally.

### Left out on purpose
A Supabase live run of 012 (the owner pastes it); editing asks in Uitvoering with a reason (D83); a stored "toegezegd" flag; the team selector and capacity block on Afgestemd (design options are prepared separately); the status icons there.

## 26. Page titles, team header, size column (2026-10-21, branch `claude/team-header-size`)

Owner-approved artboards: "Optie 1 — Teamkop" and "Maat — varianten" (variant C). Acceptance: `docs/acceptance.md` section O. No schema change; nothing new on the repository contract.

### Decisions
- **D85 — One page title row everywhere.** `ViewHeader` renders the step name as a 32px display h1 with a quiet context line next to it from `quarterMeta()`: "2027 Q1" while planning, "2026 Q4 · vastgezet op 2 okt" once locked (`quarter.lockedAt`), "2026 Q3 · afgesloten" when closed. Every step of every phase uses it; Resultaat and Kwartaalresultaat take the step name as title and keep "Wat gaat door en wat niet" as the table heading. Rejected: a per-screen subtitle sentence (D34).
- **D86 — Team pages, Optie 1.** The title row carries a labelled "Team kiezen" select on the right (remembered per person on the device in `localStorage` `kp.team.<actorId>`, own team first). Below it one panel: "Team <naam>" as h2, a "Capaciteit" chip tinted by the load band (ok < 80%, warn 80-100%, danger > 100%, from `teamCapacity`), the percentage, a bar with a marker at 80% and one line "<n> van <m> pw gevraagd|toegezegd · run x% · n vacature(s)" with "krap vanaf 80%" on the right; the pencil for planners / admins sits in the block. Planning says "gevraagd", Uitvoering / Afgesloten "toegezegd" (same `teamLoad` number, D58). Uitvoering / Afgesloten add a slim line "Afgestemd op <datum> · alleen-lezen". The old capacity line and the "Afhankelijkheden · Team ▾" heading are gone. Rows: rank chip "#8" (28px, title "Prioriteit van de epic"), 28px status chips with icon + label; "Aan ons gevraagd" rows read ask · "Team · voor Epic" like the artboard. Signals (In gevaar / Gaat niet halen) no longer show on Afgestemd: they belong on Voortgang. There the provider changes a flagged signal in the "In gevaar" list and raises a first one in a collapsible section "Onze toezeggingen (n)": every committed ask the team provides (planner: own team; admin: a small team select), rank "#n", ask, "Team · voor Epic", the three-state signal control with its optional one-line note, and the sprint-cadence "Bevestigen" button when `settings.cadence` is a sprint cadence. Collapsed by default above five rows; viewers see chips only; absent once the quarter is closed.
- **D87 — Size column, variant C.** `SizeCell` is three fixed-width cells (bar scaled to the upper estimate against the organisation's largest size, the letter, "2–3 pw"), tabular numbers, right before the status chip on every ask row in both directions and all phases; the status chip sits in a fixed-width cell so the size column lines up. Numbers without a size: bar + "–"; nothing estimated: an empty cell of the same width. The size left the grey meta text. When the answer control does not fit next to the ask (two-column layout), size + control drop to a second line for every row of that column, so they stay aligned. Prioriteren / Prioriteiten offer "Maat" as an optional column (plan size, default off) in Kolommen. Dutch "Size" now reads "Maat" everywhere.
- **D88 — Demo data for all three phases.** 2026 Q3 gains three epics (SEPA mandate migration, Portal performance, Data platform cost optimisation) and eight asks so every team asks and provides; 2026 Q4 gains five asks (Payments and Klantportaal provide) and the two Bespreken answers became Toegezegd / Kan niet (answers are fixed after the lock, D83); 2027 Q1 gains five asks to Payments and Klantportaal (open / bespreken / toegezegd). Every ask and every Q3 / Q4 plan has a size (S / M / L / XL mix); capacity per quarter (`CAP_26_3`, `CAP_26_4`, `CAP_27_1`) gives each phase one team above 100% and one in 80-100% (Q3: Claims 104%, Data Platform 88%; Q4: Platform & Security 110%, Data Platform 81%; Q1: Platform & Security 126%, Polisadministratie 96%, Data Platform 93%). Owners on all 35 epics; goals on all but the three deliberate "Zonder doel" epics (D42). Mock key `kwartaalplan.mock.v7`.

### Verified
`npm run build`; `npm run test:rls` (122 checks, two runs). Browser (demo, port 5176) as Anouk, Joris Smit and Mark van Dijk over 2027 Q1, 2026 Q4 and 2026 Q3, both skins, 1440 and 375px: page titles, team block with band colour, selector on the right, read-only line, size column aligned, Maat column on Prioriteiten, signal control on Voortgang. No console errors. Pre-existing and untouched: at 375px the top bar overflows horizontally.

## 27. Voortgang feedback (2026-10-21, branch `claude/voortgang-feedback`)

Owner feedback on Prioriteiten, Afgestemd and Voortgang plus the approved proposals "Voorstel — sorteren" and "Voorstel — kwartaalbalk" (variant A). One commit per item; acceptance `docs/acceptance.md` section P; migrations `013_impediments_owner_status.sql` and `014_plan_created_at.sql`.

### Decisions
- **D89 — Columns can be reordered from the Kolommen menu.** Each optional column has "Naar links" / "Naar rechts" buttons next to its checkbox; the order is stored with the visibility choice under `kp.prioCols` as `{ on, order }` (the older `{ id: bool }` shape is read as `on`). Title and rank stay first, the reorder column last. Rejected: dragging headers (no discoverable keyboard path).
- **D90 — One class per column, for header and cell alike.** `COL_CLASS` in PrioritizeView gives every column its width, padding (`px-3`) and alignment (numbers / value centred, text left) so headings such as Waarde and Maat never touch and header text sits over the cell content.
- **D91 — One card structure on Afhankelijkheden / Afgestemd** (amended 2026-10-21). Both columns are cards per epic in rank order (`EpicCard`): header `#rank Epic title` with "+ Verzoek" (Wij vragen, while asking is allowed) or the requesting team (Aan ons gevraagd), the asks as rows inside built from one `AskRow`: `"Aan|Van <team>" (bold team, fixed cell) · ask (+ low certainty) · size cell (D87) · answer`. The answer cell has one fixed width on the whole page (chip width, or the width of the three-button control while the provider may answer) so the size cells line up across every card of both columns. Only the team shown and the answer control for the provider differ. Epics without asks sit in a collapsed group under Wij vragen. Column heading counts use the heading's colour and weight. No header row and no column sorting on this page (cards follow the epic rank). History: the first version of this entry made both columns flat rows with a sortable header row; the owner reverted to the grouped cards of section 26 and asked for Aan ons gevraagd to take the same card structure.
- **D92 — Impediments: Melder, Actiehouder, three statuses.** `owner_name` is the Melder (set to the raiser, `reporter_id` = raiser, admin may change both); `action_owner_id` / `action_owner_name` is the Actiehouder (free text or a member); status `open | in_progress | resolved`. The status and the action holder may be changed by the reporter, the action holder (by id, or by name for a free-text holder), a planner of the epic's team and admins: `canChangeImpediment()` in `data/repository.js`, mirrored by `impediment_guard()` (013). A status change leaves an `impediment_status_changed` event. Title and epic keep the `impediments_write` policy (planners). Rejected: a member-only picker (holders are often outside the tool).
- **D93 — Escalation is a threshold, not a flag.** `settings.impedimentEscalationDays` (Instellingen › Organisatie "Escalatie na (dagen)", default 7, 1-365) decides: an impediment that is not Opgelost and older than the threshold shows a red title, an "Escalatie" chip and sorts to the top (`isEscalated`, `openImpediments`).
- **D94 — Voortgang filters by team.** The title row carries "Team kiezen" with "Alle teams" (admin / viewer default; a planner starts on the own team), remembered per person on the device under `kp.progressTeam.<actorId>` (separate from the Afgestemd key so "Alle teams" never resets that page). It filters Deadline in gevaar (provider or epic team), Impediments (epic team) and Onze toezeggingen (provider team); the top line stays organisation-wide. Onze toezeggingen with "Alle teams" lists every committed ask; the signal control appears per row for whoever may write that provider team.
- **D95 — Voortgang sections are tables with one column template.** `#` (48px) · main · Team (176px) · Signaal / Status (376px, wide enough for the three-button signal control) · Toelichting / Actiehouder (288px); `table-fixed`, minimum 1120px inside a scrolling card. Notes truncate with a tooltip; the signal note is edited on a second row. Impediment rows: title + "IMP-0001 · Epic · n dagen open", team, status select (or chip) + Escalatie, action holder + "melder <naam>", a hover pencil for the edit dialog.
- **D96 — Quarter bar, variant A.** Above the sections a bar of the quarter's weeks, counted quarter-relative from the quarter's calendar start ("week 3 van 13", the same count as `quarterWeek`; not ISO weeks), past weeks filled, "▼ nu · week n". Selecting a Deadline in gevaar row (click, Enter or Space; `aria-selected`) highlights the span from now to the epic's deadline: its Moet deadline (own or inherited), else the latest `needed_by` of its asks in the quarter, else the quarter end (`epicDeadline`, `weekOf`, `quarterEnd` in rhythm.js), with "Tot deadline (wk 11): 8 weken" and "⚑ wk n" on the bar. No "nog nodig / marge": the tool has no remaining estimate and invents none. TODO (owner): refine the weekly use of this bar after the lock (what the team updates each week, whether a remaining estimate is worth asking for).
- **D97 — "Nieuw ongepland werk" lists epics, not asks.** `newSinceLock()` returns the quarter's plans created after `quarter.lockedAt` (`epic_plans.created_at`, 014, back-filled from the `plan_added` event or `updated_at`; the mock back-fills from `updatedAt`), shown with rank, title, team, owner and the date added. The "na vastzetten" mark on asks stays.
- **D98 — Phase chip with an icon.** Pause (Planning, warn tint), Play (In uitvoering, ok tint), Square (Afgesloten, neutral); 12px, aria-hidden, before the label.
- **D99 — Generic sorting, one helper.** `src/components/plan/sort.jsx`: `useTableSort(table, actorId)` (click: ascending, again: descending, third: back to the default order), `SortTh` / `SortButton` (↑ / ↓ and `aria-sort`), `SortedChip` ("Gesorteerd op <kolom> ↑ · Terug naar rang"). Remembered per table per person per device (`kp.sort.<table>.<actorId>`). Strings compare with `localeCompare`, numbers numerically, empty values last, ties keep the default order. Applied to Prioriteren / Prioriteiten (sorting pauses drag and the arrows; the handle dims with "Slepen kan in rangvolgorde"), the four Voortgang tables (the ask lists on Afhankelijkheden / Afgestemd had a sortable header row for one day; reverted with D91, their order is the epic rank and the view drops any stored `kp.sort.afhankelijkheden-*` key) (default order of Impediments: escalated first, then oldest).

### Built
- `PrioritizeView.jsx` (column order, `COL_CLASS`, sort accessors), `DependenciesView.jsx` (`AskRow`, `OutgoingRow`, `IncomingRow`, `AddAskRow`, `ListHead`), `ProgressView.jsx` (team select, `QuarterBar`, `SignalTr`, `ImpedimentTr`, `ImpedimentDialog` with edit mode, `TC` column template), `SettingsView.jsx` (escalation days), `App.jsx` + `model.js` (`PhaseIcon`, `PHASE_CHIP` tones), `core.jsx` (`SignalChip withNote`), `sort.jsx`.
- Domain: `rhythm.js` (`openImpediments`, `IMPEDIMENT_STATUSES`, `checkImpedimentStatus`, `escalationDays`, `checkEscalationDays`, `isEscalated`, `quarterEnd`, `weekOf`, `epicDeadline`, `newSinceLock`); `repository.js` (`canChangeImpediment`); signal label `at_risk` = "Deadline at risk" / "Deadline in gevaar" everywhere.
- Data: both adapters (`upsertImpediment` with the reporter / holder / status rules and event, `setImpedimentStatus`, `resolveImpediment` delegating, `impedimentEscalationDays` in `updateSettings`, plan `createdAt`); migrations 013 and 014; `rls_test.sql` section 15 (135 checks); PGlite runner applies 013 and 014 twice. Mock key `kwartaalplan.mock.v9`.
- Seed: 2026 Q4 impediments with reporters, holders and mixed statuses (IMP-0001 In behandeling 12 days, IMP-0006 Open 9 days — both escalated; IMP-0002 fresh; IMP-0005 resolved); epic 23 (rank 13) and the backlog epic 20 added after the lock; the post-lock plan id is unique again (`p0-16`, was a duplicate `p0-13`).

### Verified
`npm run build`; `npm run test:rls` (135 checks, two runs, 013 and 014 applied twice); a Node smoke test over `MockRepository` (23 checks: seed order and escalation, viewer / other-team planner refused, reporter and epic team and holder by id and by name allowed, admin-only reporter change, event row, resolvedAt set and cleared, raise with IMP-0007, threshold validation and effect). Browser (demo, port 5176) as Anouk, Joris Smit and Mark van Dijk in 2027 Q1 and 2026 Q4, both skins, 1440 and 375px: Kolommen menu with arrows and reordering, header / cell alignment, sorting with chip and dimmed handle, Afgestemd with one row structure and "Aan / Van", Voortgang with team select, tables, quarter bar with a selected row, Escalatie, status select and edit dialog, "Nieuw ongepland werk", phase chip icons. No console errors on fresh loads (one HMR-only error while editing, not reproducible).

### Left out on purpose
A Supabase live run of 013 / 014 (the owner pastes them); "nog nodig / marge" on the quarter bar (no estimate exists); filtering "Nieuw ongepland werk" by team (not asked); sorting on the beta views; ISO week numbers on the bar.
