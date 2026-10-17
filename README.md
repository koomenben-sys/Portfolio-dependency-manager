# Kwartaalplan — quarterly planning for scarce teams and cross-team dependencies

React + Vite + Tailwind. Runs fully without a database in demo mode; Supabase (Postgres + RLS) for a real organisation.

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173/Portfolio-dependency-manager/`. Without `VITE_DATA_SOURCE` the app starts in **demo mode**: fictional data for "Oranje Verzekeringen", stored in your browser, with a persona switcher in the account menu (facilitator, director, team planners, viewer).

## Screens

Rank the epics top-down, then let teams agree on the dependencies — highest priority first.

1. **Prioriteren** — one ranked table of the quarter's epics; drag & drop (or arrow buttons) to reorder, optional inline reason; dependency summary per row; row click opens the epic panel.
2. **Afhankelijkheden** — per team: "Wij vragen" (our epics with their asks, inline "+ Verzoek") and "Aan ons gevraagd" (asks ordered by the requesting epic's rank, answered with Toezeggen / Bespreken / Kan niet).
3. **Afstemmen** — four status counts, the "Te bespreken" team pairs sorted by highest-ranked epic, and a team × team matrix.

Plus Instellingen (organisation, teams, quarters, people, import, demo) and an account menu with language and three short role tours. The earlier screens (Overzicht, Bord with capacity lanes, Sessie with phases and votes, In het kwartaal, Mijn aandacht, the capacity-aware intake queue) are kept behind Instellingen › "Uitgebreide modules (beta)".

## Supabase mode

1. Run `db/migrations/001_core.sql` … `008_realtime.sql` in order in the Supabase SQL editor (001 drops the old Feb-2026 tables; 004 needs your e-mail; all files are re-runnable).
2. `.env` in the repo root: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (the anon or publishable key), `VITE_DATA_SOURCE=supabase`. For a one-off run: `VITE_DATA_SOURCE=supabase npm run dev`.
3. Sign in once (create the account from the login screen if needed), then re-run 004 so your user becomes admin. Rename yourself in `memberships.display_name` if the e-mail local part is not what you want shown in history.
4. Settings → Organisation profile, planning units, quarters and capacity; or import epics from Azure DevOps (demo data).
5. Settings → People and roles → "Invite": invite planners and viewers by e-mail; "Send link" e-mails a sign-in link (add the app URL under Auth → URL configuration → Redirect URLs). Invitees get access on first sign-in with that address.

### RLS test

Paste `db/tests/rls_test.sql` into the Supabase SQL editor and run it after the migrations. It creates throw-away test users and organisations, checks role and tenant isolation (73 checks), removes everything again and shows a PASS/FAIL grid; the first row is the total. Locally, without a database: `npm run test:rls` (runs the migrations and the same script in PGlite).

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
  views/         Prioritize, Dependencies, Align, Settings, Login; beta: Overview, Board, Dependencies.legacy, Session, InQuarter, Attention
  components/plan/  core.jsx (calm primitives), SimpleEpicPanel, OnboardingWizard, TourPanel + tourScenarios; legacy ui.jsx, EpicPanel, DependencyForm
  integrations/azureDevOps/  mapper (pure), REST client (credentials as arguments), mock response
db/migrations/   tenant-ready schema, RLS, triggers, bootstrap, round-2 changes, live-test changes, invitations, realtime (001-008)
db/tests/       rls_test.sql (SQL editor) + run_pglite.mjs (npm run test:rls)
```
