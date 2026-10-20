# Dependency refinement — Feb build (10fe602) vs today (claude/release-b-trim)

Read-only research, 2026-10-19. Feb files read via `git show 10fe602:<path>`.

## A. Side-by-side per step

| Step | Feb 2026 (10fe602) | Today |
|---|---|---|
| **Create** | `DependenciesView.jsx` › Outgoing: every initiative is a card (`InitiativeCard.jsx`) with a "Dependencies (n)" section and an **Add** button. Add inserts an empty row at once (`useDependencies.addDependency`); the row (`DependencyItem.jsx`) is two fields, **Team ▾ · What?**, plus Q1-Q4 toggles. Every keystroke autosaves; no Send/Cancel. Effort is *not* asked of the requester. | `src/views/DependenciesView.jsx` › Wij vragen: epic header with **+ Verzoek** opens `NewAskRow`: team ▾ · what · SizePicker S/M/L/XL · pw field · Zekerheid ▾ · (reason when locked) · **Versturen** · Annuleren. Seven controls, explicit submit. |
| **See (requester)** | Same card: deps listed inside the initiative, each with a status badge. Prioritization table had per-status count chips ("2 committed · 1 blocked"). Portfolio Overview rolled up per initiative: Blocked / Discussion / Pending / Committed. | Wij vragen rows: team · what · SizeText · "lage zekerheid" · SignalChip · StatusChip · hover-bin. Prioriteren: one `WorstIssue` cell (iteration 1 chose this over Feb's count chips, rightly). `SimpleEpicPanel.jsx` lists asks **read-only** with a link "Beheer verzoeken in Afhankelijkheden". |
| **Answer (provider)** | Incoming tab: one card per ask — "Team X needs: …", "For: initiative", Needed Qx, an **Effort select the provider fills**, three buttons Commit / Can't / Discussion (active one filled). No reason. | Aan ons gevraagd: `IncomingRow` — rank · team · what · size · certainty · "voor epic" · hidden Signaal button · `AnswerControl` (Toezeggen / Bespreken / Kan niet) · inline reason for Kan niet (D29) · `SignalControl` + note + Bevestigen on committed asks · CapacityLine above. Provider **cannot** set size (RLS 010: requester only). |
| **Align** | `AlignmentView.jsx`: Portfolio Health, "Teams Requiring Alignment" (unordered pair cards, counts of can't/discussion), four status counts, `DependencyMatrix.jsx` = **initiatives × teams**, cell = status + effort + quarters, always visible. | `AlignView.jsx`: four tiles, "Top 5: n in gevaar", pairs (directed req → prov) sorted by highest rank with inline answers and Besproken check, collapsed "Knelpunten", matrix **team × team** behind "Matrix tonen". |
| **Vocabulary / colour** | Pending · Committed · Under Discussion · Can't Commit; grey / green / yellow / red, glyph + text (`constants/design.js`). | Open · Toegezegd · Bespreken · Kan niet (`ASK_META`); same four, calmer tones, lucide icons. Equivalent. |

## B. What was likely nicer in Feb, and why

1. **A dependency was two fields.** Team + what, created in place, autosaved. Today's form asks size, pw, certainty and a Send — the requester has to decide things they often do not know yet. Release B (D50/D52) put estimation on the asking side.
2. **The provider estimated.** Feb's incoming card had the Effort select next to the answer buttons: the team that does the work sizes it, in the same gesture as committing. That is the natural owner and it kept the requester's side empty.
3. **One object, one place.** The initiative card held its deps (see + create + edit); you never left the epic to work on its asks. Today the epic panel is read-only for asks and sends you to screen 2.
4. **The incoming card said exactly five things**: who, what, for which initiative, when, effort → answer. Today's `IncomingRow` can show rank, team, what, size, certainty, epic, signal button, answer control, reason, signal control, note, Bevestigen, bottleneck. The *vocabulary* did not get worse; the **row density** did — the Release B additions landed on the dependency rows.
5. **Matrix by initiative.** Feb's matrix rows were initiatives (what is at stake), columns teams, so the whole picture read top-down; today's team × team matrix answers "who asks whom", not "which epic is blocked".

What is better today and should stay: rank ordering everywhere, `WorstIssue` cell, "Te bespreken" pairs by rank with inline answers, reason on Kan niet, matrix behind a link.

## C. Proposals

| # | Change | Screen | Effort | Risk to calm UI | Feb element |
|---|---|---|---|---|---|
| **1 ★ Top** | **Two-field ask form.** `NewAskRow` becomes team ▾ · what · Versturen (Enter submits, Esc cancels). Size, pw and certainty move behind one quiet "meer" toggle, defaults unchanged (certainty Midden, no size). No data or adapter change. | 2 Wij vragen | S | None — removes four controls | Two-field `DependencyItem` |
| 2 | **Provider sizes the ask.** Allow the provider team (and admin) to set `size` on an ask; show `SizePicker` (compact) in `IncomingRow` next to the answer control, requester's value as default. Needs migration 011 (policy + `log_dependency` guard), both adapters, RLS test rows. Keep requester's size as "indicatie" if set. | 2 Aan ons gevraagd | M | Low — one small picker where Feb had a select | Effort select on incoming card |
| 3 | **Asks editable in the epic panel.** Asks section in `SimpleEpicPanel.jsx` gets "+ Verzoek" (reuse `NewAskRow`) and hover-delete for the epic's own team; drop the "Beheer verzoeken…" link. Works from Prioriteren and Afstemmen. | Panel (1/2/3) | S–M | Low-medium — panel gains one row-form; keep the Asks block as is otherwise | Deps inside `InitiativeCard` |
| 4 | **Quiet incoming row.** Before Uitvoeren hide signal UI, bottleneck chip and "lage zekerheid" text on `IncomingRow` (they appear from `locked`/`active` only); keep rank · team · what · for epic · AnswerControl · reason. Same for Wij vragen rows. Pure JSX conditions. | 2 | S | None — removes | Five-item incoming card |
| 5 | **Matrix per epic.** Behind the existing "Matrix tonen" link add a two-way toggle "Teams / Epics": rows = ranked epics with asks, columns = teams, cell = status glyph (+ size). Cell click opens the pair as today. | 3 | M | Medium — a longer table, but opt-in and hidden by default | `DependencyMatrix.jsx` |

Suggested order: 1 + 4 together (one PR, only removals), then 3, then 2 (schema), 5 last or not at all.

## D. Open questions for Ben

1. Who owns the estimate of an ask: the requester (today, D50/D52), the provider (Feb), or both with the provider's winning? Decides proposal 2.
2. Is the Release B layer on dependency rows (signal, certainty, bottleneck) part of what feels worse, or do you want it kept but only visible during Uitvoeren (proposal 4)?
3. Should asks be creatable from the epic panel too (proposal 3), or must screen 2 stay the single place where asks are made?
