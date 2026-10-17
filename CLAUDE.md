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

- **Last session:** 2026-10-17 — MVP iteration "Kwartaalplan" (branch `claude/enterprise-planning-mvp-23669e`)
- **What changed:** the app was rebuilt around quarterly planning: team lanes by strategic rank, capacity (derived person-weeks, cut line), dependency asks with answers, session phases + confidence vote + lock/diff, in-quarter check-ins and impediments, director overview, "My attention" inbox, mock Azure DevOps import. Old Feb views/hooks removed.
- **Read first:** `docs/design.md` (decisions D1-D22, build log in section 16), `docs/acceptance.md`.
- **Data layer:** `src/data/repository.js` contract; `MockRepository` (default, localStorage) and `SupabaseRepository` (untested against a live DB). Views never call Supabase directly.
- **Open follow-ups:** migration `005_rpc_reason.sql` (RPC so rank changes pass the reason to the trigger), `org_settings` table, pgTAP tenant-isolation tests, Edge Function for the real ADO sync, Dutch UI strings.
- **Owner decisions 2026-10-17:** Feb tables may be dropped; name "Kwartaalplan"; old views replaced. Later that day: Dutch UI by default (`src/i18n/`, English strings are the keys, `nl.js` holds Dutch), onboarding wizard, demo tour per role (`docs/demo-script.md`). Second branch `claude/kwartaalplan-onboarding-tour-nl` stacked on PR #15.

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
  views/       OverviewView, BoardView, DependenciesView, SessionView, InQuarterView, AttentionView, SettingsView, LoginView
  components/plan/  ui.jsx (Pill, CapacityBar, Modal, ReasonPrompt), EpicPanel.jsx, DependencyForm.jsx
  integrations/azureDevOps/  mapper.js, client.js, mock.js
db/migrations/ 001_core, 002_rls, 003_functions_and_triggers, 004_bootstrap
```

### Adding a feature (pattern)
1. Pure logic in `src/domain/` (selectors/calculations), used by every screen.
2. Command on the repository contract: implement in `mockRepository.js` AND `supabaseRepository.js` (+ migration if schema changes).
3. UI in `src/views/` or `src/components/plan/`, calling `run('method', ...)` from `usePlan()`.
4. Every change to rank, commitment, dependency answer or phase must leave a `plan_events` row with a reason where required.

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
