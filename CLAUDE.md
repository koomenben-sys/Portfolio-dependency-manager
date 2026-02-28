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

- **Last session:** 2026-02-28
- **Worked on:**
  - Portfolio Overview: added Pending status badge to initiative list; fixed right-alignment of status labels (`shrink-0 ml-4 text-right`)
  - Fixed broken GitBranch icon in Dependencies tab (malformed arc path → explicit SVG elements)
  - Simplified dev server setup: retired `eloquent-jennings` worktree; root repo (`main`) now runs dev server on port 5173
  - Feature backlog brainstorm saved to `BACKLOG.md`
- **Next steps:**
  - Nothing pending — app is stable and clean
- **Future feature ideas (brainstormed, not started):**
  - Quarter filter across all views
  - Timing conflict detection (initiative in Q1 but dependency in Q2)
  - Team capacity per quarter (sum effort sizes per team per quarter)
  - Quarterly roadmap swimlane view
  - Logo / branding
- **Open questions / decisions:**
  - `gh` CLI is installed and authenticated (HTTPS, koomenben-sys)
  - Dev server runs from `eloquent-jennings` worktree (`npm run dev`) — kept updated to `main`
  - Auth system lives in `src/context/AuthContext.jsx` + `src/views/LoginView.jsx`
  - Admin role management is done via Supabase SQL editor directly (no client-side UI)
  - `Icons.jsx` exports `SortUnsorted`, `SortAsc`, `SortDesc` in addition to existing icons
  - If a commit lands on a feature branch after PR is merged, cherry-pick it directly onto `main`

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
  constants/design.js        # Design system — card styles, status colours, buttons, inputs, typography, accents
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

## Dev Servers
- Root repo (`main`) → port 5173, always running (`npm run dev` from repo root)
- Feature worktree → port 5174, started when needed
- Preview feature changes at `http://localhost:5174/Portfolio-dependency-manager/`

### Important: where to make edits
- **Edit files in the root repo `src/`** — the dev server runs from there, so hot-reload works immediately
- Commit directly on `main` for small fixes; use a worktree + PR for larger features
- The `eloquent-jennings` worktree is retired — no longer used

## Environment / Secrets
- Supabase credentials are injected as GitHub Actions secrets for the Pages build
- Local dev: `.env` lives in the **repo root** (`portfolio-dependency-manager/.env`)
- Each worktree has a symlink: `ln -s ../../../.env .env`
- When creating a new worktree, always run that symlink command as part of setup
