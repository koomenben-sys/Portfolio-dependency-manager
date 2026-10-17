# Kwartaalplan — quarterly planning for scarce teams and cross-team dependencies

React + Vite + Tailwind. Runs fully without a database in demo mode; Supabase (Postgres + RLS) for a real organisation.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/Portfolio-dependency-manager/`. Without `VITE_DATA_SOURCE` the app starts in **demo mode**: fictional data for "Oranje Verzekeringen", stored in your browser, with a persona switcher in the header (facilitator, director, team planners, viewer).

## Supabase mode

1. Run `db/migrations/001_core.sql` … `004_bootstrap.sql` in the Supabase SQL editor (001 drops the old Feb-2026 tables).
2. `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_DATA_SOURCE=supabase`.
3. Sign in once, re-run 004 so your user becomes admin.

## Docs

- `docs/design.md` — vision, personas, domain model, UX, architecture, schema, integrations, decisions with reasons, build log.
- `docs/acceptance.md` — acceptance criteria and Gherkin scenarios (approved).
- `docs/research/` — competitor and UX research notes.
- `BACKLOG.md` — older feature backlog (pre-MVP).

## Source layout

```
src/
  domain/        pure model, capacity maths, selectors (board, overview, attention, diff)
  data/          repository contract, MockRepository, SupabaseRepository, seed data
  context/       PlanContext (state + actor + quarter), AuthContext (Supabase mode)
  views/         Overview, Board, Dependencies, Session, InQuarter, Attention, Settings, Login
  components/plan/  shared UI (pills, capacity bar, modals), EpicPanel, DependencyForm
  integrations/azureDevOps/  mapper (pure), REST client (credentials as arguments), mock response
db/migrations/   tenant-ready schema, RLS, triggers, bootstrap
```
