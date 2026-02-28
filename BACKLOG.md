# Feature Backlog

## Target Personas

### 1. Portfolio / Program Manager (primary user)
Owns the portfolio view, tracks dependencies across teams, runs the quarterly planning cycle.

**Problems:**
- Doesn't know a dependency is at risk until a team raises it in standup — too late
- Has to manually chase teams for status updates
- Can't easily show leadership which portfolios are healthy vs. at risk
- Planning conflicts discovered late (initiative needs Q1, dependency team is booked until Q2)

### 2. Engineering / Tech Lead or VP Eng
Uses the tool to understand cross-team load and prioritise their team's commitments.

**Problems:**
- No visibility into what other teams are depending on them for
- Can't communicate capacity constraints without a manual spreadsheet
- Hard to say "we can commit to A but not B" without a shared view

### 3. Initiative Owner (Product Manager or Squad Lead)
Owns one or more initiatives, wants their dependencies resolved.

**Problems:**
- No clear way to formally request a dependency from another team
- Can't tell if a stale "Under Discussion" is being actively worked or forgotten
- No notification when their dependency status changes

### 4. Executive / Director (occasional viewer)
Needs a one-page summary for planning forums or steering committees.

**Problems:**
- Portfolio health is buried in tool detail
- Can't quickly see which initiatives are at risk due to dependency issues
- No export for slides or reports

---

## Feature Ideas

### Visibility & Detection
| Feature | Persona | Problem it solves |
|---|---|---|
| Quarter filter across all views | PM | See only Q1 dependencies |
| Timing conflict detection | PM | Flag initiative in Q1 where dep team can't deliver until Q2 |
| At-risk initiative badge | PM | Initiative has 1+ unresolved / can't-commit dependencies |
| Portfolio risk score | PM + Exec | Aggregate health metric — % of deps committed |

### Capacity Planning
| Feature | Persona | Problem it solves |
|---|---|---|
| Team capacity per quarter (sum effort per team per quarter) | VP Eng | See team's dependency load before committing |
| Overload indicator | VP Eng + PM | Flag teams with >N effort points in a quarter |

### Workflow & Collaboration
| Feature | Persona | Problem it solves |
|---|---|---|
| Dependency request workflow | Initiative Owner | Formally request a dep; receiving team gets an action item |
| Status change notifications (email / Slack) | Initiative Owner + PM | Stop chasing; teams notified when deps need attention |
| Comments on a dependency | All | Async discussion instead of Slack context-switching |
| Stale dependency alert | PM | Flag deps "Under Discussion" for >N days |

### Reporting & Export
| Feature | Persona | Problem it solves |
|---|---|---|
| PDF / PNG export of portfolio health | Exec + PM | Paste into slides for planning forum |
| Quarterly roadmap swimlane view | Exec | Executive-friendly timeline of initiatives by team |

### Scale / Multi-team
| Feature | Persona | Problem it solves |
|---|---|---|
| Cross-portfolio dependency | PM | Dependency on an initiative in a different portfolio |
| Jira / Linear sync | PM | Pull initiatives from the source of truth; avoid double entry |

---

## Suggested Priority Order

**First tranche (v1.1):**
1. At-risk initiative badge — high visual impact, low complexity
2. Timing conflict detection — unique differentiator; hard to do in a spreadsheet
3. Stale dependency alert — reduces chasing; solves a daily pain point
4. Team capacity per quarter — makes the tool useful to Eng Leads; increases adoption

**Later (v2+):**
- Dependency request workflow + notifications — needs email/notification infrastructure
- Jira / Linear sync — external integration complexity
- Roadmap swimlane view — significant new UI surface
