# UX research: enterprise quarterly planning tool

Evidence quality: mostly vendor docs, design systems and one peer-reviewed study (matrix vs node-link). Rules marked (inference) are synthesis, not sourced findings. The "5-second rule" had no research basis in the sources found.

## 1. Planning boards (swimlanes by team, columns by quarter)
1. Keep lanes few and meaningful. Lanes = teams (a bounded set); do not add a second lane dimension (person, class of service) by default. Per-person lanes degrade into "a spreadsheet with endless rows". https://www.topleft.team/blog/2023/03/30/what-are-kanban-swimlanes
2. Keep one fixed card layout: ID, short title, owner avatar, size, status icon, dependency badge. Minimal text, high information per area. https://www.leanmanufacture.net/article/how-to-design-the-perfect-kanban-card/
3. Offer two density modes (overview vs detail) and test with real users before standardising. https://blog.jestor.com/mosaic-kanban-information-density-jestor/
4. Put limits on the lane/column cell (capacity per team per quarter) and make breaches warn, not block. Warn-only is the common default. https://pro.rv-grid.com/guides/kanban/swimlanes-wip-rules/
5. A lane that is persistently over capacity signals a bottleneck. Surface it in the lane header. (same source)

## 2. Dependency visualisation
1. Default to inline badges on the card ("blocked by 2 / blocks 1", with the other team's quarter). Draw lines only for the selected item (inference; supported by hairball findings below).
2. Use a team-by-team (or team-by-quarter) matrix for overview. For graphs over about 20 nodes, matrices beat node-link on most tasks; node-link wins only for path-finding. https://hal.archives-ouvertes.fr/hal-00343819
3. Reduce before drawing: filter to a neighbourhood, collapse by team, show direct dependencies only. https://eagereyes.org/blog/2012/graphs-hairball
4. Flag timing conflicts explicitly. A SAFe program-board "string" pointing backward in time (needs it in Q1, supplier delivers Q2) is a planning conflict that must be resolved. Colour internal vs external dependencies differently. https://miro.com/templates/pi-plannings/
5. Provide "show path A to B" as the only full-graph view, and make matrix ordering sortable. (inference from Fekete study)

## 3. Capacity heatmaps and load bars
1. Three bands: green under 75-80%, amber to 100%, red over 100%. Teams can use stricter bands than individuals because pooled capacity hides individual overload. Show thresholds in the legend. https://appfire.atlassian.net/wiki/spaces/SPM/pages/1918799470
2. Always print the number (e.g. "92%") in the cell or bar. WCAG 1.4.1 requires a second cue beyond colour. https://www.digitala11y.com/understanding-sc-1-4-1-use-of-color/
3. Use a sequential ramp that rises in lightness, not just hue. Avoid red/green pairs; test in greyscale. Viridis/Cividis are perceptually uniform options. https://www.getgalaxy.io/learn/glossary/accessible-color-palettes-in-data-visualization
4. Cells and bars should be at least 3:1 contrast against their background (WCAG 1.4.11; unconfirmed in source).
5. Tooltip or drill-down lists the epics that make up the load. Sort or filter teams by utilisation. (Appfire page; Meisterplan https://help.meisterplan.com/hc/en-us/articles/18020497797916)

## 4. Executive rollup dashboards
1. Three layers: summary tiles, supporting charts, detail table by click-through. Answer "is everything OK?" first. https://datapad.io/docs/guides/dashboard-best-practices
2. Limit to 5-7 KPIs per view. If a metric triggers no action, drop it. (same source)
3. Publish RAG definitions with explicit thresholds, and use several dimensions (schedule, capacity, scope, dependencies) rather than one status that can mask problems. https://deckary.com/blog/project-status-slide
4. Lead with the highest-impact Red items; order by impact. https://tessl.io/registry/skills/github/JaviMontano/mao-pm-apex/apex-executive-dashboard
5. Show "data as of" and a staleness warning on every rollup. (same source)

## 5. Status colour and accessibility
1. Never colour alone: pair every status with an icon or shape plus a text label, and add aria-labels to icon-only indicators. https://developer.dynatrace.com/design/patterns/status-and-health/
2. Use specific labels ("Pending approval") rather than generic "Status". https://designsystem.dehn.de/atoms/indicator/
3. One colour per meaning across the whole app; limit to 2-3 semantic colours plus neutral. (same source)
4. Trend arrows need a label or context, since colour alone cannot show good vs bad. (Dynatrace)
5. Distinguish "Commitment" from "Discussion" with an icon or fill style (solid vs outline), not only hue (inference).

## 6. Real-time collaborative planning
1. Show an avatar stack of online members only. Active first, others greyed. https://ably.com/blog/collaborative-ux-best-practices
2. Use member location (the card someone is editing) rather than full cursors. Where cursors are used, add a name label, not just colour. (same)
3. Lock a card while it is being edited, and release the lock when the user disconnects. (same)
4. Confidence vote (fist of five, 1-5): any vote of 2 or below prompts the voter to state their concern; the SAFe-derived rule is that the plan pauses until blockers are addressed. Sources disagree on whether a low vote is a hard stop or a discussion trigger, so make this configurable. Show the distribution, not just the average. https://miro.com/templates/pi-plannings/ and https://www.nimblework.com/blog/unravelling-pi-planning/
5. Use ROAM (Resolved, Owned, Accepted, Mitigated) as the risk status set. (Miro/Aha sources)

## 7. Check-ins and impediments
1. Make updating easier than avoiding it: one brief update, with a low/medium/high confidence field. https://appmaster.io/blog/okr-tracker-weekly-check-ins-confidence
2. Show "last check-in" date on every item, and an at-risk panel grouping low-confidence and stale items. (same)
3. Keep stale flags precise. Too many false alerts and people stop scoring honestly. (same)
4. Cadence is contested (weekly vs bi-weekly); make it configurable and use a light async update with a less frequent live review. https://www.profit.co/blog/okr-university/the-okr-check-in-dilemma-how-often-should-you-track-progress
5. Impediment as a one-click flag on the card with a single-line reason (inference; no source on pre-fill or inline-blocker UX was found).

## Anti-patterns in existing tools
1. Jira Plans (Advanced Roadmaps): dependency lines are inconsistent (missing across teams not in the plan), hidden behind click-only icons in newer views, and the tool is judged overwhelming for non-technical stakeholders. https://community.atlassian.com/forums/Jira-questions/Not-all-dependencies-line-are-shown/qaq-p/2497692 and https://titanapps.io/blog/jira-plans
2. Spreadsheets and per-person-lane boards: endless rows, with status carried by colour only, no staleness signal and no live capacity maths (inference; per-person lanes: Topleft source above).
3. Single-RAG rollups and node-link hairballs: one green hides underlying problems (Deckary above); big graphs occlude (eagereyes above).
