# Competitor research: quarterly / PI planning tools

Method: web search summaries only (no deep page fetches). Pricing is mostly from third-party sources and flagged. Items marked UNVERIFIED were not confirmed.

## SAFe PI planning artifacts (what we replace)
Sources: https://www.aha.io/roadmapping/guide/templates/create/piplanning, https://resources.rework.com/libraries/project-management/pi-planning, https://success.planview.com/Planview_AgilePlace/Methodology/Implementing_SAFe_in_AgilePlace/Managing_SAFe_Objectives_and_Risks (vendor/consultant descriptions; official scaledagileframework.com not checked)
- Two-day event; every team on the Agile Release Train builds a dependency-aware plan for the next increment (quarter).
- Planning board: teams x iterations, features/stories placed per sprint. Program board: features, milestones, cross-team dependencies (symbols/colours).
- Team PI objectives with business value; risks go on a shared board and are ROAMed: Resolved, Owned, Accepted, Mitigated.
- Confidence vote: fist-of-five per team and for the whole train; low votes trigger re-plan. Then team commitment and a retro.
- Known weakness: votes become rubber stamps (Rework). Risks keep surfacing during execution, so ROAM should continue in-quarter (Planview).

## Products

**Jira Align (Atlassian)** - https://atlassian.com/software/jira/align/pricing
- Program board is the core view; dependencies tracked with owner, committed sprint/quarter, status; ROAM risks; capacity mostly via backlog column views and program reviews; portfolio/strategy rollups.
- Strengths: full SAFe fidelity, enterprise rollups. Weakness: targets 500+ developers, sales-led, heavy implementation, Jira-centric. Capacity is not a first-class planning surface.
- Price: not published. Resellers cite about $27k/yr (Standard) and $46k/yr (Enterprise) for 30 full + 120 integrated users (third-party, unverified). One blog says it is now sold in a bundle (Strategy Collection) - UNVERIFIED.
- Copy: program board with dependency owner/committed quarter, ROAM states. Avoid: price and implementation weight.

**Planview (AgilePlace / Portfolios)** - https://success.planview.com/Planview_AgilePlace/Methodology/Implementing_SAFe_in_AgilePlace/Managing_SAFe_Objectives_and_Risks
- Kanban-based SAFe boards, objectives and risk handling; Portfolios adds enterprise PPM. Price: AgilePlace about $20/user/mo (third-party, Capterra); Portfolios/PI planning not published (quote). Weakness: PPM complexity, sales-led. Details of dependency/capacity depth not verified.

**Atlassian Jira Plan / Advanced Roadmaps (+ Focus)** - https://confluence.atlassian.com/sneaky/servicedeskcloud/jira-cloud-plans-1097175872.html
- Cross-project plans, dependencies, capacity per team, scenarios; included in Jira Premium/Enterprise only (not standalone). Premium roughly $13.5-17/user/mo (third-party figures disagree); Enterprise quote.
- Strength: cheap if already on Jira Premium. Weakness: Jira lock-in, planning is issue-hierarchy driven, no commitment/confidence ritual. Atlassian Focus and Rovo dependency maps: not found in searches - UNVERIFIED.

**Azure DevOps Delivery Plans / Dependency Tracker** - https://learn.microsoft.com/en-us/azure/devops/boards/plans/faqs?view=azure-devops
- Delivery Plans 2.0 (GA April 2021): timeline of up to 20 teams/backlogs, predecessor/successor dependency links with a red marker for problems. Microsoft recommends it over the Dependency Tracker extension, which is unsupported (https://learn.microsoft.com/is-is/previous-versions/azure/devops/boards/extensions/dependency-tracker?view=tfs-2018). Team Planner details not verified.
- Weakness: timeline only; no capacity-vs-demand, no commitment or confidence, ADO-only. Gap we can fill for ADO shops.

**Aha! Roadmaps** - https://www.aha.io/roadmaps/pricing
- Roadmaps, release Gantt with dependencies, PI planning templates and ROAM board (https://www.aha.io/roadmapping/guide/templates/create/ROAM-board), capacity planning in higher tiers. Enterprise+ about $149/user/mo (third-party; tier for capacity conflicting). Strength: strategy-to-roadmap rollups. Weakness: expensive per editor, product-management oriented, own data model.

**Easy Agile Programs** - https://www.easyagile.com/pricing
- Jira app: PI planning board, team planning, dependency mapping and reports. Free up to 10 users; paid by Jira user count (figures not published in results). Strength: low cost, Jira-native. Weakness: Jira-only, bound to Jira data.

**Cockpit** - verified as Agile Cockpit B.V. (Delft, NL; founded 2014; Waada group): https://marketplace.atlassian.com/vendors/1222181/agile-cockpit-b-v
- Jira Cloud portfolio management app: strategic goals to initiatives, configurable prioritisation, scenario comparison, PI planning with dependencies and risks. Atlassian Silver partner. Jira-only. Pricing not found. (Xeleron Cockpit is an unrelated Dutch PM tool.) Copy: prioritisation model + scenario comparison for top-down priority.

**Miro / Lucid boards** - https://help.miro.com/hc/articles/10648975837970, https://community.lucid.co/ideas/jira-dependency-and-parent-linking-5821
- Miro Planner for Jira: PI planning on canvas with two-way Jira sync; Business/Enterprise plan required. Limit: many Jira issues/dependency links drop out of view (community reply). Lucid: Jira integration, but in 2023 no parent/child or dependency links (may have changed - UNVERIFIED). Strength: familiar facilitation feel. Weakness: canvas, not structured data; no capacity maths, no rollup; still needs facilitator.

**ProductPlan** - https://www.productplan.com/get-started
- Visual roadmaps, free viewers; not PI planning/dependency/capacity focused. Old per-editor pricing $39-99/mo, now quote (unverified).

**Targetprocess (IBM/Apptio)** - https://www.apptio.com/solutions/remote-pi-planning/
- Dedicated PI planning workflow, used by Apptio for remote PI planning. No public price (third-party estimate about $40k/yr, unverified). Enterprise-heavy, configurable but complex.

## Takeaways
Copy: program-board view of dependencies with owner and committed quarter; ROAM states on risks that persist into the quarter; per-team confidence and commit status; top-down priority model with scenario compare; free viewers (ProductPlan, Aha!).
Avoid: SAFe-only vocabulary lock-in, per-editor pricing near $150, Jira-only data models, canvas-only boards with no structure, quote-only sales cycles.
Gap: affordable, tool-agnostic (Jira/ADO/Trello) tool combining capacity-vs-demand per team, dependency negotiation status, commitment/confidence, and light in-quarter check-ins. Competitors split these across boards (Miro), timelines (ADO), or enterprise suites (Jira Align, Planview).
