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

- **Last session:** 2026-02-27
- **Worked on:**
  - F5 fix confirmed working and merged (PR #9) — `reloadSignoutConfirmed` gate in `AuthContext`
  - Initiative tab UI: delete button moved above separator line (top-right of card); dependency items now render inside the initiative's white card box (PR #10)
  - Prioritization tab: added dedicated Value column, removed Ref column, added clickable column-header sorting with stacked triangle icons (PRs #11, #12)
  - Alignment tab: renamed "Status" heading to "Dependency status" (PR #13)
- **Next steps:**
  - Potential future features (brainstormed, not started): quarter filter across all views, timing conflict detection (initiative quarter vs dependency quarter), team capacity per quarter, quarterly roadmap swimlane view
- **Open questions / decisions:**
  - `gh` CLI is installed and authenticated (HTTPS, koomenben-sys)
  - Dev server runs from `eloquent-jennings` worktree (`npm run dev`) — kept updated to `main`
  - Auth system lives in `src/context/AuthContext.jsx` + `src/views/LoginView.jsx`
  - Admin role management is done via Supabase SQL editor directly (no client-side UI)

## Project Overview
A React app for managing portfolios, initiatives, and cross-team dependencies.
Deployed to **GitHub Pages** via GitHub Actions.

## Tech Stack
- **React 18** + Vite + Tailwind CSS
- **Supabase** (data layer — migrated from localStorage in PR #3)
- **npm** for package management (`npm run dev`, `npm run build`)
- Dev server: `http://localhost:5173`

## Key Architecture

### Source structure
```
src/
  App.jsx                    # Auth shell (App) + authenticated UI (AuthenticatedApp)
  lib/
    supabase.js              # Supabase client
    db.js                    # DB query helpers
  hooks/
    usePortfolios.js         # Portfolio CRUD
    useInitiatives.js        # Initiative CRUD
    useDependencies.js       # Dependency CRUD
    useTeams.js              # Team management
    useLocalStorage.js       # (legacy, mostly unused now)
  views/                     # Pages: Portfolios, Dependencies, Prioritization, Alignment, PortfolioOverview
  components/
    Layout/                  # Header, Navigation, SettingsModal
    Portfolio/PortfolioCard.jsx
    Initiative/InitiativeCard.jsx
    Dependency/              # DependencyItem, DependencyMatrix
    common/Icons.jsx
  constants/index.js         # Teams, Quarters, Effort sizes, Statuses, Value types
  utils/
    referenceCodeGenerator.js  # Generates PF-0001, IN-0001, DEP-0001
    dataExport.js              # JSON export/import
```

### Data model reference codes
- Portfolios: `PF-0001`
- Initiatives: `IN-0001`
- Dependencies: `DEP-0001`

### Adding a new feature (pattern)
1. Add DB helper in `src/lib/db.js`
2. Add hook in `src/hooks/`
3. Add component(s) in `src/components/`
4. Add view in `src/views/`
5. Wire up in `App.jsx` and `Navigation.jsx`

## Git Workflow
- Claude uses **worktrees** for feature branches (in `.claude/worktrees/`)
- Main branch: `main`
- PRs merge into `main`, which triggers GitHub Pages deploy

## Environment / Secrets
- Supabase credentials are injected as GitHub Actions secrets for the Pages build
- Local dev: needs `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
