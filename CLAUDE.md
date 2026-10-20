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

- **Last session:** 2026-10-19 — Release A (Waarde & strategie, PR #20) and Release B (Capaciteit & ritme, PR #21, stacked on #20) built, persona-tested and iterated. Merging was left to the owner.
- **Release A:** goals/programmes (themes), value model per org, OnePager tab, Kwartaalresultaat (`#kwartaalresultaat`). Migration 009. `docs/design.md` section 21 (D40-D48), `docs/acceptance.md` section K.
- **Release B:** T-shirt sizes with org mapping, team-level capacity (no per-person data, NL holidays automatic), certainty on asks, automatic bottleneck chips, Plan vastzetten + "gewijzigd", commitment signals + Op uitzondering / Sprintkadans, Afsluiten (`#afsluiten`, via the phase word). Migration 010. `docs/design.md` section 22 (D50-D61), `docs/acceptance.md` section L.
- **Read first:** `docs/design.md` sections 19-22, `docs/acceptance.md` sections J-L.
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
  domain/      model.js (statuses, phases, cyclePhase + STEPS per phase), capacity.js (available/load/cut line), plan.js (selectors),
               rhythm.js (sizes, signals, Voortgang selectors, closeRows), follows.js (Volgen)
  data/        repository.js (contract + permission helpers), mockRepository.js, supabaseRepository.js, seed.js
  context/     PlanContext.jsx (state, actor, quarter, run()), AuthContext.jsx
  views/       core: PrioritizeView, DependenciesView (also step 2 "Afgestemd"), AlignView, ProgressView (Voortgang), ResultView (Resultaat),
               QuarterResultView (tussenstand), SettingsView, LoginView
               beta (settings.modules): OverviewView, BoardView, DependenciesView.legacy, SessionView, InQuarterView, AttentionView
  components/plan/  core.jsx (calm primitives: StatusChip, RankNo, DepSummary, Tabs, InlineReason, AnswerControl, Menu, Dialog, FollowStar),
               CycleActions.jsx (lock / close dialogs; the phase word is plain text, steps follow cyclePhase: design.md section 23),
               SimpleEpicPanel.jsx, OnboardingWizard.jsx (3 steps), TourPanel.jsx + tourScenarios.js (3 tours),
               legacy for beta views: ui.jsx, EpicPanel.jsx, DependencyForm.jsx, AnswerModal.jsx, SetupPanel.jsx
  integrations/azureDevOps/  mapper.js, client.js, mock.js
db/migrations/ 001_core … 011_follows   db/tests/ rls_test.sql, run_pglite.mjs (run in order; all re-runnable)
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
