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
  - Diagnosed and fixed F5 refresh bug (PR #8, `claude/fetch-timeout-fix`, not yet merged)
  - Root cause: Supabase v2 fires `SIGNED_IN` on session restoration from localStorage (not just `INITIAL_SESSION`), so all event-based guards were bypassed
  - Fix: `reloadSignoutConfirmed` gate in `AuthContext.useEffect` — blocks ALL `onAuthStateChange` events on reload until our `signOut()` fires a `SIGNED_OUT`, then allows subsequent events (real user login) normally
  - Also added: 8s fetch timeout in `supabase.js`, `loadRole` retry on throw, `.catch(() => 'viewer')` safety on `loadRole` call
- **Next steps:**
  - Test F5 on `localhost:5173` — press F5, confirm login screen appears (or blank screen with no data), log back in, confirm data and role load correctly
  - If confirmed working: merge PR #8
- **Open questions / decisions:**
  - `gh` CLI is installed and authenticated (HTTPS, koomenben-sys)
  - Dev server runs from `eloquent-jennings` worktree (`npm run dev`) — kept updated to `main`
  - Auth system lives in `src/context/AuthContext.jsx` + `src/views/LoginView.jsx`
  - Admin role management is done via Supabase SQL editor directly (no client-side UI)
  - PR #8 branch: `claude/fetch-timeout-fix`

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
