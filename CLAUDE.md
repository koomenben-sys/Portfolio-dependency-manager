# Portfolio Dependency Manager — Claude Context

## My Preferences
- Keep responses concise and direct
- No emojis unless I ask
- Ask before creating new files if there's an existing one that could be edited
- Read relevant files before suggesting changes
- Don't refactor or "improve" code beyond what's asked
- Use `npm` for all package management

## Current Work / Last Session
_Updated by Claude at the end of each session._

- **Last session:** 2026-02-27
- **Worked on:**
  - Diagnosed F5 refresh issue: app showed empty data and null role after reload
  - Root cause: stale Supabase session in localStorage — tokens had gone invalid, so all DB queries silently failed while the app still showed as "logged in". Fix: clear `sb-*-auth-token` in DevTools → Application → Local Storage, then log in again.
  - Also identified two code-level fragilities exposed by the stale session scenario:
    1. `loadRole` could throw without being caught → `role` stayed `null` (no badge, no admin access)
    2. Data hooks had no retry — one failed load on mount = permanently empty data
  - Fixed both in PR #7 (`claude/hardcore-moser`): added `.catch(() => 'viewer')` on `loadRole` call in `AuthContext`, and a single 5s auto-retry to all four data hooks
  - PR #7 is open and ready to merge
- **Next steps:**
  - Merge PR #7
  - Dev server worktree: `eloquent-jennings` was superseded by `main` + PR #7; after merging, run dev from `main` worktree or copy `.env` to the new worktree
- **Open questions / decisions:**
  - `gh` CLI is installed and authenticated (HTTPS, koomenben-sys)
  - Auth system lives in `src/context/AuthContext.jsx` + `src/views/LoginView.jsx`
  - Admin role management is done via Supabase SQL editor directly (no client-side UI)
  - If app shows empty data / no role badge after F5: clear `sb-*-auth-token` in DevTools → Application → Local Storage, then log in fresh. PR #7 adds a 5s auto-retry so this should recover on its own for transient failures.

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
