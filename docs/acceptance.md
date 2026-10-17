# MVP Acceptance Criteria and Gherkin Scenarios

Status: APPROVED on 2026-10-17 (owner approved questions 2-5 in chat and delegated sign-off of these criteria and scenarios to the lead after a critical review; see docs/design.md header).
Design and reasons: `docs/design.md`. Verification method: `npm run build` plus manual browser run against the mock adapter (no automated test runner exists in the repo; adding one is out of scope).

## Build order (after sign-off, one commit per step)

1. Repository layer + domain module (capacity, cut line, KPIs) + Mock adapter with Dutch-company seed data; app boots without a database.
2. Quarter board + epic side panel.
3. Dependencies (intake queue + matrix).
4. Session screen (phases, discussion queue, vote, lock + diff).
5. Overview + My attention.
6. In-quarter (check-ins, impediments/risks).
7. Azure DevOps import (mock) + Settings.
8. Supabase repository (untested without the owner's DB) + remove superseded Feb views.

## A. Platform and data

**Acceptance criteria**
- A1. With `VITE_DATA_SOURCE` unset or `mock`, the app starts and works fully with no Supabase credentials; no network calls to Supabase are made.
- A2. Mock data contains: 8 teams, 6 strategic themes, 3 quarters (one in `negotiate`, one `active`, one `closed`), 25-35 epics (incl. 4 regulatory with deadlines, 3 loose without label/theme), 15-20 dependencies across all response states, capacity for every team, 2 team votes, 4 discussion items, check-ins, 5 impediments/risks. Names are plausible Dutch-company (insurer/retailer) teams.
- A3. Mock changes persist across page reloads (localStorage) and can be reset to seed from Settings.
- A4. A role/team switcher in mock mode (admin, planner of a chosen team, viewer, "can rank" flag) changes what is editable; a viewer can edit nothing; a planner can edit only own-team epics and answer asks addressed to own team.
- A5. Every change to strategic rank, commitment, dependency answer and phase writes a history entry (who, when, before/after, reason) viewable in the epic panel.
- A6. SQL migrations 001-004 exist in `db/migrations/`; `docs/database-schema.md` points to them. (They cannot be executed by us; owner runs them.)
- A7. `npm run build` succeeds without errors.

```gherkin
Feature: App runs without a database

  Scenario: First start in mock mode
    Given VITE_DATA_SOURCE is not set
    When I open the app
    Then I see the Quarter board with the seeded teams and epics
    And no request is sent to Supabase

  Scenario: Reset mock data
    Given I changed a commitment in mock mode
    When an admin chooses "Reset demo data" in Settings
    Then the board shows the original seeded commitments again

  Scenario: Planner may edit only own team
    Given I am a planner of team "Platform"
    When I open an epic owned by team "Checkout"
    Then its fields are read-only
    And I can still add a dependency ask from my own team's epic to "Checkout"
```

## B. Quarter board (team level, top-down priority)

**Acceptance criteria**
- B1. Teams are lanes; within a lane epics are ordered by strategic rank (unranked last, labelled "unranked").
- B2. Each card shows: rank, ref code, title, theme chip (or "unaligned"), regulatory marker with deadline, effort range in person-weeks, commitment badge (icon + text + colour), dependency badges ("needs N" / "asked of us N") coloured by worst response with text, external link if present.
- B3. Each lane header shows a capacity bar: load range vs available, percentage printed, band green <=80% / amber <=100% / red >100%, and a visible cut line where cumulative high-estimate load first exceeds available. Tooltip/expand lists the contributing epics and the capacity assumptions (formula inputs).
- B4. Incoming accepted dependencies are shown in the load separately from own epics.
- B5. Filters: label, theme, commitment status, "regulatory only", "unaligned only". Epics with no label are shown equally with labelled ones when no label filter is set.
- B6. Over capacity is a warning only; nothing is blocked.
- B7. A user with rank permission can change an epic's strategic rank; a reason is required; the change appears in history. Users without rank permission cannot.
- B8. Colour is never the only carrier of status (icon and text always present).

```gherkin
Feature: Quarter board

  Background:
    Given the quarter "2026 Q4" is selected

  Scenario: Epics ordered by top-down priority
    Given team "Payments" has epics ranked 3, 1 and 7
    When I view the board
    Then in the "Payments" lane the order is rank 1, rank 3, rank 7

  Scenario: Cut line when over capacity
    Given team "Platform" has 20 person-weeks available
    And its epics by rank have high estimates 8, 7, 6 and 5
    When I view the "Platform" lane
    Then the capacity bar shows the load as a percentage above 100% in red with a text label
    And the cut line is drawn after the second epic
    And no epic is blocked from being committed

  Scenario: Loose epic treated like a grouped one
    Given an epic has no label and no theme
    When I view the board without filters
    Then it appears in its team lane
    And it shows "unaligned" as theme
    When I filter on label "GDPR"
    Then it is hidden and the labelled GDPR epics remain

  Scenario: Changing strategic rank needs a reason
    Given I am a user with rank permission
    When I move epic "EP-0012" from rank 5 to rank 1 without entering a reason
    Then the change is rejected with the message that a reason is required
    When I enter the reason "DORA deadline Jan 2027"
    Then the rank is saved
    And the epic history shows who changed it, when, from 5 to 1, with that reason

  Scenario: Viewer cannot rank
    Given I am a viewer
    Then the rank control is not available
```

## C. Dependencies (request, answer, matrix)

**Acceptance criteria**
- C1. From an epic, a planner can request a dependency: provider team, quarter needed, ask text, effort low/high, optional "what happens if you say no". It starts as `proposed`.
- C2. The provider team's intake queue lists all asks addressed to the team for the selected quarter, with age, requester, effort, ranked by the requesting epic's strategic rank, plus the team's remaining capacity.
- C3. The provider planner can answer: Accept, Partial, Defer to quarter X, Decline, Needs priority call. All except Accept require a reason; Defer requires a target quarter. The answer and reason show on the requesting epic's card/panel.
- C4. Accepted and Partial asks count in the provider team's load as "incoming".
- C5. A proposed ask older than 5 days is flagged "no response".
- C6. The matrix shows requester team (rows) x provider team (columns) with counts coloured by worst response (with text count and icon); clicking a cell lists the dependencies.
- C7. A timing conflict is flagged when the dependency's quarter is after the requesting epic's quarter, or deferred beyond it.
- C8. Dependencies are shown as badges and the matrix; no network graph.

```gherkin
Feature: Dependency negotiation

  Scenario: Requesting a dependency
    Given I am a planner of team "Checkout" and epic "EP-0004" is ours
    When I ask team "Platform" for "API rate-limit support" in "2026 Q4" for 2 to 3 person-weeks
    Then the dependency has status "Proposed"
    And it appears in the "Platform" intake queue

  Scenario: Declining requires a reason
    Given I am a planner of team "Platform" and see an ask from "Checkout"
    When I choose "Decline" without a reason
    Then the answer is rejected asking for a reason
    When I enter "Team at 130% capacity; higher-ranked regulatory work"
    Then the status becomes "Declined" with the reason
    And the requester sees the reason on epic "EP-0004" without asking anyone

  Scenario: Accepted ask counts against provider capacity
    Given "Platform" has 20 weeks available and 12 own load
    When an ask of 3 to 4 weeks is accepted
    Then Platform shows incoming load 3 to 4 weeks separately
    And total load is 15 to 16 weeks

  Scenario: Deferral
    When I choose "Defer" and give no target quarter
    Then the answer is rejected
    When I choose "Defer to 2027 Q1" with a reason
    Then a timing conflict is flagged on the requesting epic if it is planned in "2026 Q4"

  Scenario: Unanswered ask ages
    Given an ask has been "Proposed" for 6 days
    Then it shows "No response - 6 days" in the queue and in the requester's My attention
```

## D. Session (facilitator): phases, discussion queue, vote, lock

**Acceptance criteria**
- D1. The Session screen shows the quarter phase stepper: prep > draft > negotiate > review > vote > locked > active > closed. Only admins can advance or rewind; a rewind requires a reason; each change is in history.
- D2. Phase controls editability: in `prep`/`draft` dependency answers are disabled; in `locked` and later, plan fields remain editable but each edit is marked "changed since baseline" and needs a reason.
- D3. A readiness list per team shows: has epics, capacity set, open asks unanswered, vote cast; teams not ready are highlighted.
- D4. Anyone with edit rights can flag an epic or dependency "needs discussion" with a reason; the item has owner and timebox; the queue is sorted by strategic rank then size; resolving requires an outcome text. Epics with open items show a "discuss" indicator on the board.
- D5. Each team can cast a 1-5 vote; a reason is required at 3 or lower; the panel shows the distribution and per-team votes; teams may re-vote; an admin setting chooses whether a vote <=2 only flags discussion (default) or blocks locking.
- D6. Locking stores a baseline snapshot of plans and dependencies. After lock a diff lists: epics added/dropped, rank moves, commitment and dependency status flips, capacity changes, each with reason.
- D7. A printable "plan of record" page shows commitments per team, dependencies, risks (ROAM), vote results, and diff vs baseline.

```gherkin
Feature: Quarterly planning session

  Scenario: Facilitator advances phase
    Given I am an admin and the quarter is in phase "negotiate"
    When I advance to "review"
    Then the phase stepper shows "review"
    And the history records the change by me

  Scenario: Only admins control phase
    Given I am a planner
    Then the phase controls are not available

  Scenario: Discussion queue drives the agenda
    Given three discussion items are open on epics ranked 2, 9 and 4
    When I open the Session screen
    Then the queue lists them in order rank 2, 4, 9
    When I resolve the first without an outcome
    Then it is rejected asking for an outcome

  Scenario: Low confidence needs a reason
    Given I am a planner of team "Platform"
    When I vote 2 without a reason
    Then the vote is rejected
    When I vote 2 with the reason "Two dependencies unanswered"
    Then the distribution shows one vote of 2
    And a discussion item is suggested for team "Platform"

  Scenario: Lock and baseline diff
    Given all teams have voted
    When an admin locks the quarter
    Then a baseline is stored
    When a planner later changes the commitment of "EP-0007" from "Committed" to "At risk" with a reason
    Then the Session diff lists EP-0007 with before, after and the reason
    And the epic card shows "changed since baseline"

  Scenario: Readiness list
    Given team "Data" has no capacity set and two unanswered asks
    Then the readiness list marks "Data" as not ready with those two reasons
```

## E. Overview (directors)

**Acceptance criteria**
- E1. One page, at most 6 KPI tiles: top-10 strategic epics committed (n/10), teams over capacity, regulatory epics at risk or not committed, asks without answer (count, oldest age), open impediments (count, oldest age), average team confidence.
- E2. Theme coverage: per theme the number of epics, committed weeks and a status; themes with no committed epic are flagged "uncovered"; epics with no theme counted as "unaligned".
- E3. Red-flag list shows only: top-ranked epics not committed, regulatory epics at risk (with days to deadline), asks declined or unresolved on top-ranked epics, impediments older than 7 days; each with owner and age.
- E4. "Data as of" timestamp and last update per team are shown; teams not updated for more than 14 days are marked stale.
- E5. Everything on the page is derived from the same data as the board; numbers match the board.
- E6. Readable on a laptop without scrolling horizontally; status carries icon and text.

```gherkin
Feature: Executive overview

  Scenario: Regulatory epic at risk surfaces
    Given epic "EP-0021" is regulatory with deadline in 40 days and commitment "At risk"
    When a director opens the Overview
    Then "EP-0021" is in the red-flag list with "40 days to deadline" and its owner

  Scenario: Uncovered theme
    Given theme "Customer experience" has no committed epic
    Then the theme coverage shows "Customer experience" as uncovered
    And the count of unaligned epics is visible

  Scenario: Numbers match the board
    Given the board shows 3 teams above 100%
    Then the KPI "Teams over capacity" shows 3

  Scenario: Stale team
    Given team "Data" has had no change or check-in for 20 days
    Then Overview marks "Data" as stale with its last update date
```

## F. In-quarter: check-ins, impediments, My attention

**Acceptance criteria**
- F1. Check-in is one control: confidence low/medium/high plus an optional one-line note; no RAG, nothing mandatory beyond confidence; author and date stored; latest check-in shows on the card and in the epic panel.
- F2. An epic without check-in for the configured cadence (default 14 days, admin-configurable) is flagged "stale" only while the quarter is `active`.
- F3. Impediments and risks: create with title, kind, linked epic and/or dependency, owner; risks carry a ROAM state; resolve with date; age shown; open items older than 7 days flagged.
- F4. "My attention" shows for the current user/team: unanswered asks to my team, answers/counters/declines on my asks since I last looked, stale epics of my team, aging impediments I own, discussion items I own. Empty state says "Nothing needs your attention".
- F5. No emails or push notifications in MVP.

```gherkin
Feature: In-quarter follow-up

  Scenario: Light check-in
    Given the quarter is "active" and I am a planner of the epic's team
    When I set confidence "low" and note "Waiting on API from Platform"
    Then the card shows the check-in with date and "low"

  Scenario: Stale epic
    Given cadence is 14 days and the last check-in was 20 days ago
    Then the epic is flagged "No check-in for 20 days" in My attention of its team

  Scenario: Impediment lifecycle
    When I raise an impediment on epic "EP-0004" owned by "J. de Vries"
    Then it is listed as open with age 0 days
    When it stays open for 8 days
    Then it is flagged as aging in Overview and in the owner's My attention
    When I resolve it
    Then it leaves the open list and keeps its resolved date

  Scenario: Answer arrives in My attention
    Given team "Platform" declined my ask yesterday
    When I open My attention
    Then I see the decline with its reason
```

## G. Azure DevOps import (read-only, mock first)

**Acceptance criteria**
- G1. Settings has "Import from Azure DevOps": by default uses the bundled mock response (clearly labelled "Demo data"); no credentials are requested or stored in the UI.
- G2. A pure mapper converts the ADO work-item response (epics + related links) into normalised external epics; the REST client takes credentials as arguments and is documented as server-side only (Edge Function); a PAT may be supplied only via env var for local experiments, never persisted.
- G3. The import preview lists new, updated and unmapped items; confirming creates epics with `external_*` fields or updates imported fields only (title, state, link); planning fields (rank, effort, commitment, dependencies) are never overwritten.
- G4. Imported fields are read-only in the epic panel with a link "Open in Azure DevOps".
- G5. ADO "related/predecessor/successor" links between imported epics from different teams create dependency suggestions (not dependencies) listed for the planner to confirm.
- G6. Not tested against a real ADO organisation in this iteration; stated in Settings and docs.

```gherkin
Feature: Azure DevOps read-only import

  Scenario: Import preview with mock data
    Given I am an admin
    When I open "Import from Azure DevOps" and choose "Use demo data"
    Then I see a preview with new epics, updated epics and items without a team

  Scenario: Planning fields survive a re-import
    Given epic "EP-0030" was imported and I set its rank to 2 and commitment to "Committed"
    When the source title changes and I import again
    Then the title is updated
    And rank 2 and commitment "Committed" are unchanged

  Scenario: Dependency suggestion from links
    Given imported epic A (team X) has a successor link to imported epic B (team Y)
    Then a suggested dependency "A needs B" is listed for a planner to confirm
    And it is not created automatically
```

## G2. Changes from validation round 2 (implemented)

- C9. A partial answer records the granted effort (0 < granted ≤ asked); only the granted effort counts in the provider's load.
- C10. The provider's capacity bar shows "+N pw if all open asks accepted"; the intake queue shows per ask whether it fits or falls below the cut line, and the remaining capacity after accepted asks.
- C11. The cut line ranks own epics and accepted asks together by the (requesting) epic's strategic rank.
- C12. An ask can be edited by the requesting team; changing text or effort resets an answered ask to Proposed and is logged; asks carry a needed-by date and the requester's contact; effort is not prefilled and must be > 0.
- C13. "Needs priority call" automatically puts the ask on the discussion queue.
- D8. Votes can be cast only in the Vote phase (re-vote while Locked); they stay hidden until the facilitator reveals them; a vote cast before the team's plan changed is flagged.
- D9. Readiness also checks over-capacity, unresolved declined / priority-call asks and open discussion items; locking with teams not ready requires an override reason, which is recorded; re-locking after a rewind takes a fresh baseline.
- D10. The repository enforces phase rules: in a locked quarter removing an epic, adding/editing/removing an ask and changing capacity all need a reason; the diff lists removed asks and capacity changes.
- E7. Red flags are one row per epic with all applicable tags, highest severity first; a regulatory register lists regulation, deadline date, rank, commitment and whether the epic fits capacity; the Overview can be printed.
- A8. Modals are accessible (dialog role, focus trap, Escape, focus return); type is at least 12px; rank badges and strike-through replace low-contrast styling.
- A9. Settings shows an organisation setup checklist (profile, planning units, people and roles, themes, quarters, capacity, epics) with completeness per step, an organisation profile with capacity defaults, and bulk capacity entry per quarter.
- A10. The current screen is in the URL hash; an error boundary replaces white screens with reload / reset options.

```gherkin
Feature: Round-2 behaviours

  Scenario: Partial answer counts only the granted effort
    Given Platform's load is 20 of 30 pw and an ask of 4 to 6 pw is open
    When Platform answers "Partial" granting 2 to 3 pw with a reason
    Then Platform's load becomes 22 to 23 pw
    And the requester sees "granted 2–3 pw of 4–6"

  Scenario: Hidden votes until reveal
    Given the quarter is in the Vote phase and two teams have voted
    When a planner of a third team opens the Session screen
    Then they see "2 votes cast, hidden" and only their own team's vote
    When the facilitator clicks "Reveal votes"
    Then the distribution and per-team votes are visible to everyone

  Scenario: Lock needs an override when teams are not ready
    Given team "Data" has an unanswered ask
    When the facilitator advances to "Locked" without a reason
    Then a prompt lists "Data (1 unanswered ask)" and asks for an override reason
    When the facilitator enters "Agreed in the room; Data answers by Friday"
    Then the quarter is locked and the reason is in the history
```

## G3. Changes from validation round 3 and the code review (implemented)

- C14. Open and priority-call asks in the intake queue and the answer dialog are judged by inserting them at the requesting epic's rank: "fits at rank N (cum. X)", "pushes EP-… below the cut line", or "lands below the cut line". The "+N pw if all accepted" figure includes priority-call asks.
- C15. The requesting team can acknowledge a declined / deferred / priority-call answer; acknowledged answers no longer count against the team's readiness.
- C16. Capacity formula: available = (headcount × weeks − absence weeks) × focus factor × (1 − reserve %).
- D11. Phases advance one step at a time (rewinds need a reason); the confidence average on the Overview and the votes in the Plan of record stay hidden until revealed or locked; rewinding to Vote or earlier hides votes again.
- E8. Regulatory epics whose deadline falls before the start of the selected quarter, and that are not planned in an earlier quarter, are flagged "deadline before quarter start" in the register and the red flags.
- F6. My attention is scoped to the selected quarter, remembers when you last looked (for "new since your last visit"), lists your own unanswered asks, and offers Answer / Acknowledge actions.
- A11. Demo mode runs with no Supabase environment variables at all; the app renders a "No quarter yet" notice instead of hanging when an organisation has no quarter.

## G4. Onboarding, demo tour, language (second iteration)

- A12. An admin of an organisation that is not set up (`setupComplete` false) sees the onboarding wizard; after "Open the board" the board shows the created quarter. Demo mode can start an empty organisation and return to the demo data.
- A13. The header offers a demo tour per role; each step switches the persona (demo mode) and the screen and shows an explanation; nothing in the data changes.
- A14. The UI language can be switched between Nederlands and English; with `nl` every screen reads in Dutch; data (names, ref codes) is never translated.

```gherkin
Feature: Onboarding and language

  Scenario: New organisation set-up
    Given I am an admin and the organisation has no teams or quarters
    When I open the app
    Then I see the wizard starting with the profile step
    When I add teams "Burgerzaken" and "IT Platform", a theme, quarter 2027 Q1 and capacity for both teams
    And I click "Open the board"
    Then the board shows 2027 Q1 with two empty team lanes and their capacity

  Scenario: Demo tour switches role and screen
    Given demo mode
    When I start the tour "Directeur" and click "Volgende" three times
    Then the persona is Ruud Visser and the screen is the Board
    And nothing in the demo data has changed

  Scenario: Dutch by default
    When I open the app in demo mode
    Then the navigation reads Overzicht, Bord, Afhankelijkheden, Sessie, In het kwartaal, Mijn aandacht, Instellingen
    When I switch the language to English
    Then the same navigation reads in English
```

## H. Out of scope (explicit)

Multi-tenant signup/billing, SSO, Jira/Trello, e-mail notifications, real-time presence, change-request workflow, cross-quarter heatmap, network graph, Program/Portfolio entities, Dutch UI text.

## I. Questions for the owner (answer with the sign-off)

1. English UI for now?
2. OK that `001_core.sql` drops the Feb tables (data loss; repopulate from JSON export)?
3. Name: "Kwartaalplan" or keep "Portfolio Dependency Manager" for now?
4. The old Feb views (Portfolios, Prioritization, Alignment, Portfolio Overview) are removed in build step 8 because the new model replaces them. OK?
