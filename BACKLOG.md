# Backlog — Kwartaalplan

_Bijgewerkt 2026-10-17, na merge van PR #15 (MVP), #16 (wizard, rondleiding, Nederlandse UI) en #17 (Supabase live getest)._
Achtergrond en beslissingen: `docs/design.md` (§16 build- en validatielog, §17 organisatie-inrichting). De oudere backlog van februari staat onderaan; de meeste punten daarvan zitten nu in de MVP.

Prioriteit: **P1** = nodig voor een pilot met 3–5 teams bij een echte klant, **P2** = maakt de pilot sterk / verkoopbaar, **P3** = later.

## P1 — pilotklaar maken
| Item | Waarom | Bron |
|---|---|---|
| Uitnodigen en rollen beheren in de app (invite-UI op `memberships`, magic link) | Nu alleen via SQL; een klant kan zelf geen planners/kijkers toevoegen | §17.4, rolreview |
| RLS-test met een tweede account (planner + viewer) en pgTAP-tests voor tenant-scheiding | Rechten voor niet-admins zijn nagelopen maar niet live beproefd | PR #17, architect |
| Realtime in plaats van 30 s pollen (Supabase Realtime op plan-tabellen) | Live sessie met 8–12 teams vraagt een actueel scherm | coach r2 |
| SSO (Entra ID / SAML) en EU-hosting vastleggen | Voorwaarde bij directie, security en OR; semi-overheid vraagt dit expliciet | directeur r1, §11 |
| Hosting buiten GitHub Pages (eigen domein, CSP, verwerkersovereenkomst) | Pages is een demo-plek, geen productie voor klantdata | §11 |
| Geautomatiseerde tests (Vitest voor `src/domain` en beide repositories; contracttests) | Regressies voorkomen nu er twee adapters zijn | code-review |

## P2 — waarde en verkoopbaarheid
| Item | Waarom | Bron |
|---|---|---|
| Echte Azure DevOps-koppeling via Edge Function (PAT/OAuth in Vault), import-mapping opslaan | Geen dubbele invoer; nu alleen mock en lokaal | D21–D22 |
| Verzoek koppelen aan werkitem van het leverende team (en optioneel child-item aanmaken in ADO) | Anders wordt een geaccepteerd verzoek alsnog overgetypt | PO r2 |
| Meerdere gelijktijdige sessies per tribe/ART (`scope_label` op kwartaal) | Organisaties boven ~10 teams plannen in clusters | directeur r3, §17.4 |
| Regelingen als beheerde lijst met tweede-lijns-eigenaar en audit-export per regeling | Verdedigbaar richting toezichthouder (DORA, AVG, Woo, BIO) | directeur r3 |
| E-mail/Teams-samenvatting ("digest") van Mijn aandacht | Mensen komen anders niet terug in de tool | PO r1 |
| Export naar Excel/CSV en PDF van het plan van record | Stuurgroep- en besluitvormingsstukken | directeur r2, PO r2 |
| Terminologie per organisatie aanpasbaar (epic → opgave, verzoek → afhankelijkheid, …) | Semi-overheid gebruikt eigen taal | §17.4 |
| Jira- en Trello-adapters achter hetzelfde `ExternalEpic`-contract | Bredere markt | D19 |

## P3 — later
| Item | Bron |
|---|---|
| Wat-als-scenario's (verzoek in/uit slepen, effect op knipgrens) | EM r2 |
| Kwartaal-over-kwartaal: betrouwbaarheid van commitments, gepland vs. gerealiseerd (focusfactor kalibreert zichzelf) | EM r1, directeur r2 |
| Ketens zichtbaar maken (A heeft B nodig, B heeft C nodig) | PO r2 |
| Capaciteit per vaardigheid (meerdere pools per team) — bewust afgewezen voor MVP (D23) | EM r2 |
| Timer en gesprekscript voor de facilitator, aanwezigheidslijst | coach r2 |
| Toegankelijkheid: toetsenbordbediening van rang op het bord, projectormodus | UX r2 |
| Opmerkingen-thread per verzoek | PO r2 |

## Bekende kleine punten
- Datum- en getalnotatie volgt nu `nl-NL`; Engelstalige weergave gebruikt nog dezelfde notatie op enkele plekken.
- Inlogscherm (`LoginView.jsx`) en foutscherm zijn nog Engels.
- Tour-teksten staan inline tweetalig in `tourScenarios.js`; bij een derde taal naar `i18n` verplaatsen.

---

## Oudere backlog (februari 2026) — status
| Idee | Status |
|---|---|
| Kwartaalfilter over alle views | Gedaan (kwartaalkiezer) |
| Timing-conflictdetectie | Gedaan (verzoek na het geplande kwartaal of uitgesteld) |
| At-risk badge op initiatief | Gedaan (commitment "Risico", rode vlaggen) |
| Portfolio-risicoscore | Vervangen door Overzicht-KPI's |
| Teamcapaciteit per kwartaal, overbelasting | Gedaan (afgeleide capaciteit, knipgrens) |
| Verzoek-workflow voor afhankelijkheden | Gedaan (intakewachtrij, antwoorden met reden) |
| Notificaties e-mail/Slack | Open → P2 digest |
| Opmerkingen bij afhankelijkheid | Deels (reden bij antwoord); thread → P3 |
| Signaal voor oude "in bespreking" | Gedaan ("geen antwoord sinds N dagen") |
| PDF/PNG-export | Deels (printen); echte export → P2 |
| Roadmap-swimlane | Open → P3 |
| Cross-portfolio afhankelijkheid | Vervalt (portfolio is alleen een label) |
| Jira/Linear-sync | Open → P2 |
