# Portfolio Dependency Manager — Claude Context

## My Preferences
- Keep responses concise and direct
- No emojis unless I ask
- Ask before creating new files if there's an existing one that could be edited
- Read relevant files before suggesting changes
- Don't refactor or "improve" code beyond what's asked
- Use `npm` for all package management

## Feature Shipping Process
For major features, before writing code:
1. Define **acceptance criteria** — clear, testable conditions that must be true for the feature to be considered done
2. Write **Gherkin scenarios** — realistic Given/When/Then scenarios covering the happy path and key edge cases
3. Get sign-off on both before implementation starts

## Current Work / Last Session
_Updated by Claude at the end of each session._

- **Last session:** 2026-10-17 (late) — "Less is more" reset on branch `claude/kwartaalplan-revamp` (owner verdict: the MVP had become "a bloated, unclear monster"; the Feb version was the right basis).
- **What changed:** the product is three numbered screens again — 1 Prioriteren (ranked table, drag & drop, inline optional reason), 2 Afhankelijkheden (per team: Wij vragen / Aan ons gevraagd, three-button answers), 3 Afstemmen (four counts, "Te bespreken" pairs by highest rank, matrix) — plus a simplified epic panel, a 3-step wizard, 3 short tours and plain settings. Overzicht, Bord, Sessie, In het kwartaal, Mijn aandacht and the old intake screen are kept in the repo behind Instellingen › "Uitgebreide modules (beta)" (`settings.modules`, default off). New command `reorderPlans`; reason required only for Kan niet / Uitgesteld; effort on an ask optional; calmer seed (6 teams, 16 epics, 13 asks).
- **Read first:** `docs/design.md` section 19 (D26-D34) and section 16, `docs/acceptance.md` section J.
- **Data layer:** `src/data/repository.js` contract; `MockRepository` (default, localStorage) and `SupabaseRepository` (live-tested 2026-10-17, see `docs/design.md` section 16 "Supabase mode"). Views never call Supabase directly. Start Supabase mode locally with `VITE_DATA_SOURCE=supabase npm run dev` (launch config `mvp-supabase`, port 5175).
- **P1 invites / RLS tests / realtime (branch `claude/p1-invites-rls-realtime`, `docs/design.md` section 18):** migrations 007 (invitations, `accept_invitations()`, member/ask/plan guards) and 008 (realtime publication); `MembersAdmin.jsx`, `LiveIndicator.jsx`; `db/tests/rls_test.sql` (run in the SQL editor) and `npm run test:rls` (PGlite, local). Owner still has to run 007, 008 and the test, and add the redirect URL in Supabase Auth.
- **Open follow-ups:** live test of invites and realtime with a second account, sign-in-link option on the login screen, SSO/EU hosting, Vitest, Edge Function for the real ADO sync. Full list: `BACKLOG.md`.
- **UI rule (owner, 2026-10-17):** lightweight tool — compact tables, no explanatory paragraphs, at most one short helper line.
- **Owner decisions 2026-10-17:** Feb tables may be dropped; name "Kwartaalplan"; old views replaced; Dutch UI by default (`src/i18n/`, English strings are the keys, `nl.js` holds Dutch); onboarding wizard and demo tour per role (`docs/demo-script.md`). PRs #15, #16, #17 merged into `main`.

## Project Overview
An enterprise planning tool for scarce team capacity and cross-team dependencies, used in Agile quarterly planning sessions. One organisation in the MVP; schema is tenant-ready. Deployed to **GitHub Pages** via GitHub Actions.

## Tech Stack
- **React 18** + Vite + Tailwind CSS
- **Supabase** (Postgres + RLS + Auth) behind a repository interface; mock adapter by default
- **npm** (`npm run dev`, `npm run build`)
- Dev server: `http://localhost:5173/Portfolio-dependency-manager/`

## Key Architecture

```
src/
  domain/      model.js (statuses, phases), capacity.js (available/load/cut line), plan.js (selectors)
  data/        repository.js (contract + permission helpers), mockRepository.js, supabaseRepository.js, seed.js
  context/     PlanContext.jsx (state, actor, quarter, run()), AuthContext.jsx
  views/       core: PrioritizeView, DependenciesView, AlignView, SettingsView, LoginView
               beta (settings.modules): OverviewView, BoardView, DependenciesView.legacy, SessionView, InQuarterView, AttentionView
  components/plan/  core.jsx (calm primitives: StatusChip, RankNo, DepSummary, Tabs, InlineReason, AnswerControl, Menu, Dialog),
               SimpleEpicPanel.jsx, OnboardingWizard.jsx (3 steps), TourPanel.jsx + tourScenarios.js (3 tours),
               legacy for beta views: ui.jsx, EpicPanel.jsx, DependencyForm.jsx, AnswerModal.jsx, SetupPanel.jsx
  integrations/azureDevOps/  mapper.js, client.js, mock.js
db/migrations/ 001_core … 008_realtime   db/tests/ rls_test.sql, run_pglite.mjs, 005_review_round2, 006_live_test (run in order; all re-runnable)
```

### Adding a feature (pattern)
1. Pure logic in `src/domain/` (selectors/calculations), used by every screen.
2. Command on the repository contract: implement in `mockRepository.js` AND `supabaseRepository.js` (+ migration if schema changes).
3. UI in `src/views/` or `src/components/plan/`, calling `run('method', ...)` from `usePlan()`. Core screens use `components/plan/core.jsx`; keep copy terse (helper text <= 6 words, no paragraphs) and add Dutch in `src/i18n/nl.js`.
4. Every change to rank, commitment, dependency answer or phase must leave a `plan_events` row with a reason where required (rank: optional unless locked, via `reorderPlans`; answers: required for declined/deferred).
5. Anything beyond the three core screens goes behind `settings.modules` (the "Uitgebreid (beta)" group), not into the main nav.

### Reference codes
Epics `EP-0001`, dependencies `DEP-0001`, impediments `IMP-0001` (per organisation, via `next_ref()` in Postgres / counters in the mock).

## Git Workflow
- Claude uses **worktrees** for feature branches (in `.claude/worktrees/`)
- Main branch: `main`
- PRs merge into `main`, which triggers GitHub Pages deploy

## Dev Servers
- Root repo (`main`) → port 5173, always running (`npm run dev` from repo root)
- Feature worktree → port 5174, started when needed
- Preview feature changes at `http://localhost:5174/Portfolio-dependency-manager/`

### Important: where to make edits
- **Edit files in the root repo `src/`** — the dev server runs from there, so hot-reload works immediately
- Commit directly on `main` for small fixes; use a worktree + PR for larger features

## Environment / Secrets
- Supabase credentials are injected as GitHub Actions secrets for the Pages build
- Local dev: `.env` lives in the **repo root** (`portfolio-dependency-manager/.env`)
- Each worktree has a symlink: `ln -s ../../../.env .env`
- When creating a new worktree, always run that symlink command as part of setup
