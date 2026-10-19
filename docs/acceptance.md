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
- C3. The provider planner can answer: Accept, Partial, Defer to quarter X, Decline, Needs priority call. Decline and Defer require a reason, Needs priority call takes an optional one (changed 2026-10-17, D29); Defer requires a target quarter. The answer and reason show on the requesting epic's card/panel. In the core screens only Toezeggen / Bespreken / Kan niet are offered (D31).
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

## J. Less is more reset (2026-10-17, docs/design.md section 19)

Supersedes the navigation parts of A12-A14 and the screen-level criteria of B/C/E for the default product; B, D, E, F remain valid for the extended modules (beta).

**Acceptance criteria**
- J1. The navigation shows exactly three numbered screens — 1 Prioriteren, 2 Afhankelijkheden, 3 Afstemmen — plus a quarter selector, a settings gear and an account menu (Bekijken als in demo, language, Rondleiding). The default route is `#prioriteren`. No demo banner; a small "Demo" chip.
- J2. With Instellingen › "Uitgebreide modules (beta)" on (default off), the group "Uitgebreid (beta)" adds Overzicht, Bord, Intake & capaciteit, Sessie, In het kwartaal and Mijn aandacht; off, those routes fall back to Prioriteren.
- J3. Prioriteren lists the quarter's ranked epics (# · Epic · Team · Afhankelijkheden). The Afhankelijkheden cell reads the worst ask with its team ("✕ Kan niet · Platform & Security", "? Bespreken · Team", "◷ 1 open", "✓ 2 toegezegd", "–"), plus "+n" for further asks; the tooltip lists them all. No epic codes in the row; one neutral rank badge style. A team filter ("Alle teams") sits next to search; while searching or filtering, reordering is paused. A user with rank permission reorders by drag & drop or with the row's arrow buttons (Alt+↑/↓); after a move an inline optional reason appears with Opslaan/Annuleren; saving assigns ranks 1..n and logs one `rank_changed` event with the reason. Users without rank permission see no drag handle or arrows. In a locked quarter the reason is required.
- J4. Unranked epics sit in a collapsed group "Nog niet geprioriteerd (n)"; "Rang" appends one to the end of the ranked list (through the same save flow).
- J5. Rows whose asks include Kan niet or Bespreken show a left marker (red / amber). Clicking a row opens the simplified epic panel; Escape closes it and focus returns to the row.
- J6. Afhankelijkheden: the team selector sits in the title row ("Afhankelijkheden · [team ▾]", default: the actor's team). Each tab opens with one line of count chips (✕ · ? · ◷ · ✓) that filter the list. "Wij vragen" lists the team's epics in rank order with their asks (team · what · status; reason in normal muted text; delete on hover / focus only; no effort text); epics without asks collapse into "n epics zonder verzoeken"; "+ Verzoek" opens an inline row (team · what · optional pw) — no modal. "Aan ons gevraagd" lists asks to the team ordered by the requesting epic's rank with a segmented Toezeggen / Bespreken / Kan niet control (only for planners of that team and admins, from the Negotiate phase); Kan niet requires an inline reason; Bespreken and Toezeggen are one click. When the team has capacity for the quarter the line reads "Gevraagd n pw · beschikbaar n pw" (requested = effortHigh of asks not declined), red when requested exceeds available. Partial / deferred answers are shown read-only.
- J7. Afstemmen shows four count tiles in the order Kan niet · Bespreken · Open · Toegezegd (the last two quieter) that filter the list, then one line "Top 5: n in gevaar (rang …)" computed from the five highest-ranked epics with a Kan niet / Bespreken ask; each rank number opens that epic's pair. "Te bespreken" lists team pairs with Bespreken / Kan niet asks first, then pairs with only Open asks in a quieter style, each sorted by the highest-ranked epic involved and carrying one worst-status chip; a pair expands to its asks (rank · epic · what · status · reason). The provider's planner or an admin answers inline with the same Toezeggen / Bespreken / Kan niet control (Kan niet asks a reason). Each pair has a "Besproken" check that is stored per browser for the quarter. "Matrix tonen" at the bottom reveals the team × team grid whose cells focus a pair.
- J8. The wizard has three steps (Organisatie · Teams · Kwartaal + eerste epics) and ends on Prioriteren with the typed epics ranked in order. An optional link leads to the Azure DevOps demo import.
- J9. Every new string has a Dutch text; Dutch is the default. Helper text is at most six words; empty states are one line plus one button.
- J10. The "Live" / "30 s" / "Offline" indicator is shown only in Supabase mode; demo mode shows the DEMO chip alone. In the epic panel, rank, effort, description and label are plain text for users without the rights.

```gherkin
Feature: Prioritise by dragging

  Scenario: Director moves an epic up
    Given I am Ruud Visser (can rank) on Prioriteren in 2027 Q1
    When I drag "Instant payouts" from #5 to #1
    Then the row is at #1 and the other rows read 2..14
    And an inline field "Waarom? (optioneel)" appears under the row
    When I click "Opslaan" without a reason
    Then the order is stored and the history shows "strategic rank 5 → 1" by Ruud Visser

  Scenario: Keyboard alternative
    Given the row "Pricing data mart" has focus
    When I press Alt+ArrowUp
    Then the row moves up one place and the inline reason field appears

  Scenario: Planner cannot reorder
    Given I am Joris Smit (planner, cannot rank)
    Then rows have no drag handle and no arrow buttons

Feature: Dependencies per team

  Scenario: Ask inline without effort
    Given I am Lotte Meijer on "Wij vragen" for Klantportaal
    When I click "+ Verzoek" on "Self-service policy changes", pick "Data Platform", type "Customer events feed" and send
    Then a row "Data Platform · Customer events feed · Open" appears under the epic

  Scenario: Can't needs one line
    Given I am Mark van Dijk on "Aan ons gevraagd" for Platform & Security
    When I click "Kan niet" on "Fraud rules for instant payouts"
    Then an inline reason field appears and "Opslaan" is disabled until I type
    When I type "Security engineers on DORA until March" and save
    Then the ask shows "Kan niet" with that reason, and Payments sees it on Afstemmen

  Scenario: Commit is one click
    When I click "Toezeggen" on an open ask
    Then it shows "Toegezegd" immediately, no dialog

Feature: Align

  Scenario: Agenda ordered by priority
    Given 2027 Q1 has Bespreken / Kan niet asks between four team pairs
    When I open Afstemmen
    Then the tiles read Kan niet 2 · Bespreken 3 · Open 2 · Toegezegd 6
    And the line reads "Top 5: 2 in gevaar (rang 2, 5)"
    And "Te bespreken (6)" lists Klantportaal → Polisadministratie first (its top epic is #2) and the two open-only pairs last
    When I click the tile "Kan niet"
    Then the list only shows pairs with Kan niet asks

  Scenario: Outcome recorded in the meeting
    Given I am Anouk de Jong (admin) on Afstemmen with Payments → Platform & Security expanded
    When I click "Toezeggen" on "Fraud rules for instant payouts"
    Then the ask shows "Toegezegd" and the tile Bespreken drops to 2
    When I tick "Besproken" on that pair
    Then the pair shows the check and keeps it after a reload of this browser

Feature: Prioriteren reads the worst issue

  Scenario: Director sees what and with whom
    Given I am Ruud Visser on Prioriteren in 2027 Q1
    Then the row "Policy admin migration to new core (wave 2)" reads "✕ Kan niet · Platform & Security"
    And the row "Self-service policy changes" reads "? Bespreken · Polisadministratie +1"
    When I choose "Klantportaal" in the team filter
    Then only Klantportaal epics are listed and the drag handles are hidden

Feature: Three-step wizard

  Scenario: First ranked list in three steps
    Given an empty organisation and I am admin
    When I enter "Gemeente Rivierenland", add teams "Burgerzaken" and "IT Platform", choose 2027 Q1
    And type "Burgerzaken: Digitaal verhuizen" and "IT Platform: Nieuwe zaakapplicatie"
    And click "Naar prioriteren"
    Then Prioriteren shows the two epics ranked #1 and #2
```

## G5. P1: invites, RLS tests, realtime (docs/design.md section 18)

- A15. An admin invites someone by e-mail with a role (admin / planner / viewer), a team (required for planners) and a rank flag. The invitation shows as a row with an "Invited" chip until it is accepted. A duplicate open invitation is refused; an invalid e-mail address is refused.
- A16. Signing in with an invited, confirmed e-mail address creates the membership automatically, with the invited role, team and rank flag. This happens once, after sign-in, before the plan loads.
- A17. An admin changes a member's role, team or rank flag inline, and removes a member after confirming. An admin cannot remove themselves or change their own role. The organisation always keeps one admin. Non-admins see the list read-only; the database refuses member writes from non-admins (RLS).
- A18. "Send link" e-mails a sign-in link only after an admin's click, only for invited addresses. Demo mode sends nothing and says so.
- A19. `db/tests/rls_test.sql` runs in the Supabase SQL editor without extensions and shows a PASS/FAIL grid. It leaves no test data behind and can run again. It covers:
  - team scope, rank permission and viewers;
  - tenant isolation on every table;
  - insert-only `plan_events`;
  - provider-only answers;
  - admin-only invitations and the member guards.

  `npm run test:rls` runs the same checks locally.
- A20. In Supabase mode a change by another user appears without reloading (Realtime). If the subscription fails, the screen refreshes every 30 s. The header shows "Live", "30 s" or "Offline". In demo mode two tabs of the same browser stay in sync.

```gherkin
Feature: Invitations and roles

  Scenario: Admin invites a planner
    Given I am an admin in Settings, People and roles
    When I click "Invite", enter "Pieter@Gemeente.nl", role Planner, team "Burgerzaken"
    Then the table shows "pieter@gemeente.nl" with the chip "Invited", role Planner, team Burgerzaken
    When I click "Send link" for that row
    Then a sign-in link is e-mailed to pieter@gemeente.nl
    And my own session is unchanged

  Scenario: Invitee signs in for the first time
    Given an open invitation for "pieter@gemeente.nl" as planner of "Burgerzaken"
    When Pieter opens the sign-in link
    Then he is a planner of Burgerzaken without anyone running SQL
    And the invitation is no longer shown as "Invited"

  Scenario: Guards on member changes
    Given I am the only admin
    Then I cannot change my own role or remove myself
    When I change Joris from Planner to Viewer
    Then Joris can no longer edit the epics of his former team

  Scenario: Demo mode invite
    Given demo mode as the facilitator
    When I invite "nieuw.lid@example.nl" as planner of Payments
    Then "Nieuw Lid" appears in the table and in "Viewing as"
    And the screen says that no e-mail was sent

Feature: RLS test script

  Scenario: Owner runs the test
    Given migrations 001-008 have been run
    When the owner pastes db/tests/rls_test.sql into the SQL editor and runs it
    Then the first row reads "n checks: n passed, 0 failed" with result PASS (80 checks after migration 009)
    And no organisation named "RLS test A" or user "rls-*@example.invalid" remains

  Scenario: A loosened policy is caught
    Given someone drops the dependencies_guard trigger
    When the test runs
    Then the check "requester team cannot answer its own ask" shows FAIL

Feature: Live updates

  Scenario: Two facilitators' screens
    Given two people have the board open in Supabase mode and the header shows "Live"
    When one of them moves an epic's rank with a reason
    Then the other screen shows the new rank within a few seconds without a reload

  Scenario: Realtime unavailable
    Given the Realtime subscription fails
    Then the header shows "30 s" and the screen refreshes every 30 seconds

  Scenario: Two demo tabs
    Given demo mode open in two tabs
    When I untick "can rank" for a member in the first tab
    Then the second tab shows the change without a reload

## K. Release A — Waarde & strategie (2026-10-18, docs/design.md section 21)

Everything lives inside the three core screens, the epic panel and Instellingen: no new nav item. Kwartaalresultaat is a printable view reached from a button on Afstemmen (`#kwartaalresultaat`, not in the nav).

**Acceptance criteria**
- K1. Instellingen › "Doelen & programma's" lists the organisation's goals (the `themes` table): name, type (Strategisch doel | Programma), "Moet" yes/no with a month deadline, and an "archiveren" action. Admins and users with rank permission edit; others read. Archived goals leave every picker and the strategy bar but keep their epics and history; they sit in a collapsed "Gearchiveerd (n)" group with "herstel".
- K2. An epic has at most one goal ("Doel" picker in the epic panel, "– geen –" allowed). An epic of a "Moet" programme shows the chip "Moet · <maand>" (inherited) unless the epic carries its own regulatory deadline, which wins.
- K3. Prioriteren shows one strategy line above the table: "Top 10 per doel: Klantcontact digitaal 5 · DORA 3 · Datagedreven sturen 1 · Kernmigratie 1   geen: Efficiënte operatie" counted over the ten highest-ranked epics per active goal, highest count first; goals with zero are grouped at the end in muted text after "geen:". Clicking a goal filters the table (aria-pressed); the same goals appear as a second group in the existing filter select ("Alle" · Teams · Doelen · "Zonder doel"), so there is one select. Reordering pauses while a filter is active (as with the team filter).
- K4. Instellingen › Organisatie has "Waardemodel": Geen (default) | Eenvoudig (Hoog / Midden / Laag) | WSJF | RICE (admin only; `settings.valueModel`, `org_settings.profile` in Supabase). With Geen nothing about value is shown anywhere.
- K5. With a model on, the epic panel shows "Waarde": Eenvoudig = three-button Hoog / Midden / Laag; WSJF / RICE = the computed score with the inputs one click deeper (Disclosure "Invoer"): WSJF = (business value + time criticality + risk reduction) / job size, each 1/2/3/5/8/13/20; RICE = reach × impact (0.25/0.5/1/2/3) × confidence % / effort (effort defaults to the plan's high estimate in pw). An optional one-line "Toelichting" (valueNote). Inputs are stored in `epics.value` (jsonb) in the same column for every model; the score is computed, never stored.
- K6. Prioriteren shows a narrow "Waarde" column only when a model is on: a plain letter H / M / L (no chip border) (with full label for assistive tech) for Eenvoudig, the number for WSJF / RICE, "–" when empty. No value-order arrow (dropped by owner decision).
- K7. The epic panel has two tabs, "Epic" and "OnePager". OnePager holds a URL field "Link naar document" (opens in a new tab) and a light template with exactly three short fields — shown directly when any field has content, otherwise one quiet "+ Sjabloon invullen" link —: "Probleem en gevolg" (placeholder: Wat gaat mis als we dit niet doen, en voor wie?), "Gewenst resultaat" (Wat is aantoonbaar anders aan het eind van het kwartaal?), "Buiten scope / risico" (Wat doen we expliciet niet, of wat kan dit laten mislukken?). Below them at most four lines of auto-filled facts: rang, doel / programma, Moet + deadline (only when set), verzoeken (one line per ask: team — status); "laatste wijzigingen" only when there are any. The printed sheet keeps the full facts (also waarde and inspanning). The team's planner or an admin edits; others read. Stored in `epics.one_pager` ({problem, outcome, outOfScope}) and `epics.one_pager_url`.
- K8. "Afdrukken" (below the facts) on the OnePager tab prints one clean A4 page (header: titel · team · rang; the three fields; the facts) through a print stylesheet; the app itself does not print. Lists show no OnePager icon (iteration 1: at most two signals per row — the Moet chip and the dependency cell; no coloured left bar, no "+n" suffix, the tooltip keeps the full ask list).
- K9. Afstemmen has a "Kwartaalresultaat" button (every role, including viewers) opening `#kwartaalresultaat` titled "Wat gaat door en wat niet" with the sub-line "Kwartaalresultaat · 2027 Q1 · <today>" and a small back link; one line "Van de top 10: n toegezegd, m in gevaar", then one row per goal / programme (Moet programmes first with "Moet · <maand>" on the row, then goals and programmes in their order, a muted "Zonder doel" last and only when it has epics) with toegezegd / gepland (committed = every ask in the quarter answered Toegezegd or no asks) and "niet toegezegd" (at most five titles, each with its Moet chip when set and the reason in plain words on a second line: "Kan niet — <reden>", "Bespreken — <reden of 'nog in gesprek'>", "Open — wacht op <team>", plus the blocking team). "Afdrukken / PDF" prints one A4 landscape page. No CSV export (iteration 1: boards print).
- K10. Non-imported epics get an editable "Link" (externalUrl) in the panel's "Meer"; imported epics keep the source link read-only.
- K11. The header shows the cycle phase next to the quarter selector as one muted word: Voorbereiden (prep … review), Event (vote), Uitvoeren (locked, active), Afsluiten (closed). Read-only in this release.
- K12. Both adapters apply the same checks: goals need rank permission; type must be goal or program; a deadline needs Moet; a name is required. Epic value / OnePager fields follow the epic's team permission. Migration `009_value_strategy.sql` is additive and re-runnable; `db/tests/rls_test.sql` covers the new columns and `npm run test:rls` passes.
- K13. Every new string has a Dutch text; helper text ≤ 6 words; controls ≥ 24 px; keyboard operable (buttons, selects, tabs with arrow keys); WCAG 2.2 AA contrast with the existing tokens.

```gherkin
Feature: Goals and programmes

  Scenario: Facilitator adds a Moet programme
    Given I am Anouk de Jong in Instellingen › Doelen & programma's
    When I add "Woo" as Programma, tick Moet and choose 2027-06
    Then the row reads Woo · Programma · Moet · jun 2027
    And "Woo" appears in the Doel picker of every epic panel and in the strategy line with count 0

  Scenario: Inherited Moet chip
    Given "DORA" is a programme with Moet and deadline mrt 2027
    When I open the epic "DORA incident reporting to DNB"
    Then the panel shows the chip "Moet · mrt 2027"

  Scenario: Archive keeps history
    Given "Kernmigratie" has two epics
    When I click "archiveren" on Kernmigratie
    Then it leaves the Doel picker and the strategy line
    And both epics still show Kernmigratie as their goal in the panel

  Scenario: Planner cannot edit goals
    Given I am Joris Smit (planner, cannot rank)
    Then the goal rows are read-only and there is no add row

Feature: Strategy line on Prioriteren

  Scenario: Director reads the top-10 spread
    Given 2027 Q1 with the demo seed
    When I open Prioriteren
    Then the line reads "Top 10 per doel: Klantcontact digitaal 5 · DORA 3 · Datagedreven sturen 1 · Kernmigratie 1"
    And "geen: Efficiënte operatie" follows in muted text
    When I click "DORA"
    Then only the DORA epics are listed and the drag handles are hidden
    And the filter select shows "DORA"

Feature: Value

  Scenario: Simple model in the list
    Given the value model is Eenvoudig
    When I open Prioriteren
    Then a narrow column "Waarde" shows H / M / L
    When I open "Instant payouts" and click "Laag"
    Then the row shows "L"

  Scenario: WSJF one click deeper
    Given the admin set the value model to WSJF
    When I open an epic and expand "Invoer"
    And choose business value 8, time criticality 5, risk reduction 3, job size 8
    Then "Waarde" reads 2
    And Prioriteren shows 2 in the Waarde column

  Scenario: No model, nothing shown
    Given the value model is Geen
    Then Prioriteren has no Waarde column and the panel has no Waarde row

Feature: OnePager

  Scenario: Link only
    Given I am Mark van Dijk on the OnePager tab of "DORA ICT register and resilience testing"
    When I paste "https://intranet.example/dora-onepager" in "Link naar document"
    Then the tab shows the link with an external-link icon
    And the template shows only "+ Sjabloon invullen"

  Scenario: Template and print
    Given I am Sanne Bakker on the OnePager tab of "Digital claims intake"
    When I click "+ Sjabloon invullen" and fill the three fields
    And click "Afdrukken"
    Then the print preview is one A4 page with title, team, rank, the three fields and the facts (goal, Moet, value, pw, asks, last changes)

  Scenario: Viewer reads
    Given I am Guest viewer
    Then the OnePager tab shows the link and the three fields as text, no inputs

Feature: Kwartaalresultaat

  Scenario: Open from Afstemmen
    Given I am Ruud Visser on Afstemmen in 2027 Q1
    When I click "Kwartaalresultaat"
    Then the title reads "Wat gaat door en wat niet"
    And the top line reads "Van de top 10: 4 toegezegd, 5 in gevaar"
    And the first row is "DORA · Programma" with the chip "Moet · mrt 2027" and 2 / 4 toegezegd
    And under niet toegezegd "AVG retention and erasure automation" reads "Open — wacht op Claims"
    And "Zonder doel" is the last row, muted
    And the row "Klantcontact digitaal" lists "Self-service policy changes" with "Bespreken — <reden> · Polisadministratie"
    And there is no CSV button

  Scenario: Print
    When I click "Afdrukken / PDF"
    Then the print preview is one landscape A4 page without the app header
```

## H. Out of scope (explicit)

Multi-tenant signup/billing, SSO, Jira/Trello, e-mail notifications, real-time presence, change-request workflow, cross-quarter heatmap, network graph, Program/Portfolio entities, Dutch UI text.

## I. Questions for the owner (answer with the sign-off)

1. English UI for now?
2. OK that `001_core.sql` drops the Feb tables (data loss; repopulate from JSON export)?
3. Name: "Kwartaalplan" or keep "Portfolio Dependency Manager" for now?
4. The old Feb views (Portfolios, Prioritization, Alignment, Portfolio Overview) are removed in build step 8 because the new model replaces them. OK?

## L. Release B — Capaciteit & ritme (2026-10-19, docs/design.md section 22)

Same rule as K: no new main-nav item. New things are one field, one chip, one line or one dialog inside the three core screens; the only new view, Afsluiten (`#afsluiten`), is reached from the cycle-phase word in the header. Capacity is team-level only: no per-person or per-slot data anywhere (AVG / OR).

**Acceptance criteria**
- L1. Jobsize. Instellingen › Organisatie has "Jobgroottes" with the person-week range per T-shirt size (defaults S 1–2, M 2–4, L 4–8, XL 8–13; admin; `org_settings.profile.sizeMap`). Epic plans (epic panel) and asks (ask form) get a size picker S / M / L / XL instead of typing pw; picking a size stores the size and writes the mapped range into effort low / high, so every capacity sum keeps working. Records without a size keep their numbers and show "6–8 pw"; WSJF job size and RICE effort default to the high end of the size range.
- L2. Team capacity. Per team per quarter four numbers: "FTE ingevuld", "FTE vacant", "Verlofweken" (team total) and "Run %" (org default 20). Entered in one small dialog opened from the team's capacity line on Afhankelijkheden by the team's planner or an admin; everyone else reads. Working days come from the quarter's calendar minus Dutch public holidays on weekdays (Nieuwjaar, Pasen 1+2, Koningsdag 27/4 — 26/4 when 27/4 is a Sunday, Hemelvaart, Pinksteren 1+2, Kerst 1+2; fixed set, no toggles). Beschikbaar = max(0, FTE ingevuld × werkdagen / 5 − verlofweken) × (1 − run%), one decimal. Vacancies add "+Y pw als gevuld" with the same formula for FTE vacant (no leave).
- L3. The capacity line reads "Beschikbaar 31 pw · run 20% · 1,5 vacant (+8 pw als gevuld)" followed by the load band "Gevraagd 26 pw · 84% · krap" (ruimte ≤ 80%, krap 80–100%, overvraagd > 100%, never colour alone). It shows on Afhankelijkheden for the selected team and, when Prioriteren is filtered to one team, as one compact line above the table. A team without capacity shows "Capaciteit invullen" (planner/admin) or "–".
- L4. Certainty on the ask only: Laag / Midden / Hoog (default Midden), set by the requesting team in the ask form next to the size. Not on epics.
- L5. Bottlenecks on Afstemmen are automatic: an ask that is accepted or open gets at most one reason chip, first match wins — "Boven capaciteit" (provider load > 100%), "Grote job" (size L / XL, or high estimate ≥ 8 pw without a size), "Lage zekerheid". Pairs with a bottleneck count in "Te bespreken" and sort after the pairs with Kan niet / Bespreken. No new screen, no manual flag.
- L6. Plan vastzetten. Admins see "Plan vastzetten" on Afstemmen while the cycle phase is Voorbereiden or Event. A confirm dialog takes an optional reason; confirming stores the baseline and sets the quarter to locked in one step (one `plan_events` row) and the cycle word becomes "Uitvoeren". After that, Prioriteren rows whose rank, commitment, size or asks differ from the baseline show a small muted "gewijzigd" marker; its tooltip says what changed and the last reason.
- L7. Commitment signal. On every accepted ask the providing team (planner or admin) can set: Op koers (default, shows nothing) · In gevaar · Gaat niet halen, with an optional one-line note, from "Aan ons gevraagd". Each change leaves a `plan_events` row. Only the provider team may change it (both adapters and the database guard).
- L8. The requesting team sees the signal in "Wij vragen" next to the answer. Prioriteren's dependency cell shows the worst signal when it is worse than Op koers ("In gevaar · Platform & Security"), taking precedence over Toegezegd. During Uitvoeren Afstemmen shows one top line "Top 5: n in gevaar" (asks of the five highest-ranked epics with In gevaar or Gaat niet halen).
- L9. Sturen setting (Instellingen › Organisatie, admin): "Op uitzondering" (default) | "Sprintkadans" with N weeks (1–4, default 2). In Sprintkadans, during Uitvoeren, an accepted ask whose signal or last confirmation is older than the start of the current sprint (counted from the quarter start) shows a quiet "Bevestigen" link for the provider team; one click records "Nog op koers" (confirmed_at) without a form. In Op uitzondering nothing prompts.
- L10. Afsluiten view (`#afsluiten`). The cycle-phase word in the header is a button for admins (menu: "Plan vastzetten" when Voorbereiden / Event, "Kwartaal afsluiten" when Uitvoeren, "Afsluiten openen" when Afsluiten) and a link to Afsluiten for everyone once the quarter is closed. "Kwartaal afsluiten" asks for confirmation and sets the phase to closed. The view lists per team the epics committed at the baseline (or now when there is none) with a "Geleverd" checkbox (team planner or admin; others read) and per team "Voorspelbaarheid 75% (3 van 4)". "Doorschuiven" on each undelivered epic adds it unranked to the next quarter (creates the next quarter's plan when missing, never duplicates) with one `plan_events` row. A link opens Kwartaalresultaat.
- L11. Data: migration `010_capacity_rhythm.sql`, additive and re-runnable: `team_capacity.fte_vacant`, `epic_plans.size`, `epic_plans.delivered`, `dependencies.size`, `dependencies.certainty`, `dependencies.signal`, `dependencies.signal_note`, `dependencies.signal_at`, `dependencies.confirmed_at`, with checks; the dependency guard gives size / certainty to the requester and the signal fields to the provider. `db/tests/rls_test.sql` covers them and `npm run test:rls` passes. Mock and Supabase adapters behave the same (same error texts).
- L12. Every new string has Dutch in `nl.js`; helper text ≤ 6 words; controls ≥ 24 px; keyboard operable; WCAG 2.2 AA; the calm visual language of the core screens is unchanged.

```gherkin
Feature: Job size

  Scenario: Planner sizes an ask
    Given I am Sanne Bakker (Klantportaal planner) adding an ask to Platform & Security
    When I pick size "L" and certainty "Laag"
    Then the ask stores L and 4–8 pw
    And Platform & Security's "Gevraagd" grows by 8 pw once the ask is accepted

  Scenario: Organisation mapping
    Given I am the admin in Instellingen › Organisatie
    When I set M to 3–5 pw
    Then a newly sized M epic stores 3–5 pw and existing records keep their numbers

Feature: Team capacity

  Scenario: Team lead enters capacity
    Given I am the Payments planner on Afhankelijkheden for 2027 Q1
    When I click "Capaciteit invullen" and enter FTE ingevuld 6, FTE vacant 1, verlofweken 4, run 20
    Then the line reads "Beschikbaar" with the pw from 6 × (werkdagen − feestdagen) / 5 − 4, × 0,8
    And "1 vacant (+… pw als gevuld)" follows
    And no names or per-person fields exist anywhere

  Scenario: Holidays are automatic
    Given 2027 Q2 (Koningsdag 27/4 is a Tuesday, Hemelvaart 6/5, Pinkstermaandag 17/5)
    Then three weekdays are subtracted from the quarter's working days

  Scenario: Read-only for others
    Given I am the Claims planner looking at Payments
    Then I see the capacity line but no edit action

Feature: Bottlenecks

  Scenario: Over capacity
    Given Platform & Security is at 112% after accepting asks
    When I open Afstemmen
    Then each pair asking Platform & Security shows the chip "Boven capaciteit"
    And those pairs are listed after the pairs with Kan niet or Bespreken

Feature: Plan vastzetten

  Scenario: Admin locks the plan
    Given I am Anouk de Jong (admin) on Afstemmen in 2027 Q1 (Voorbereiden)
    When I click "Plan vastzetten", type "Uitkomst kwartaalsessie" and confirm
    Then the header shows "Uitvoeren"
    When a planner later moves "Pricing data mart" from 9 to 4 with reason "DNB vraag"
    Then the row shows "gewijzigd" with the tooltip "Rang 9 → 4 · DNB vraag"

Feature: Commitment signals

  Scenario: Provider flags risk
    Given 2026 Q4 is in Uitvoeren and Platform & Security accepted an ask of Claims
    When the Platform & Security planner sets "In gevaar" with "Pentest schuift"
    Then Claims sees "In gevaar · Pentest schuift" in Wij vragen
    And Prioriteren shows "In gevaar · Platform & Security" for that epic
    And Afstemmen shows "Top 5: 1 in gevaar" when the epic is in the top 5

  Scenario: Requester cannot change a signal
    Given I am the Claims planner
    Then the signal is text, not a control

  Scenario: Sprint cadence prompt
    Given the setting is Sprintkadans 2 weeks and week 3 of the quarter has started
    And an accepted Payments ask has no signal or confirmation since week 3
    Then the Payments planner sees "Bevestigen" on it
    When they click it
    Then the prompt disappears until the next sprint

Feature: Afsluiten

  Scenario: Close and measure
    Given I am the admin and 2026 Q4 is in Uitvoeren
    When I choose "Kwartaal afsluiten" from the phase word and confirm
    Then the header shows "Afsluiten" and Afsluiten opens
    When the Claims planner ticks "Geleverd" on 3 of 4 committed epics
    Then Claims shows "Voorspelbaarheid 75% (3 van 4)"

  Scenario: Doorschuiven
    When I click "Doorschuiven" on the undelivered Claims epic
    Then it appears under "Nog niet geprioriteerd" in 2027 Q1
    And clicking it again does nothing new
```
