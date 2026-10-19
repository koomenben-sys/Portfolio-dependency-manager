# Backlog — Kwartaalplan

_Bijgewerkt 2026-10-17, na merge van PR #15 (MVP), #16 (wizard, rondleiding, Nederlandse UI) en #17 (Supabase live getest); P1-punten 1–3 gebouwd op `claude/p1-invites-rls-realtime`._
Achtergrond en beslissingen: `docs/design.md` (§16 build- en validatielog, §17 organisatie-inrichting). De oudere backlog van februari staat onderaan; de meeste punten daarvan zitten nu in de MVP.

Prioriteit: **P1** = nodig voor een pilot met 3–5 teams bij een echte klant, **P2** = maakt de pilot sterk / verkoopbaar, **P3** = later.

## Productkoers na de persona-interviews (18 oktober 2026)
Bron: `docs/research/persona-interviews-2026-10-18.md`. Kern blijft: drie schermen. Uitbreidingen moeten werk weghalen of één kolom/knop zijn, geen nieuw scherm.

**Volgende features (voorstel, in volgorde):**
1. Uitvoeringssignaal per epic/toezegging: op koers · in gevaar · gaat niet + één regel (5/5 persona's).
2. Eén capaciteitsgetal per team (beschikbaar pw, optioneel reserve); gevraagd/beschikbaar ook bij Prioriteren.
3. Wettelijk/deadline-vlag als chip in de lijst, met waarschuwing bij Kan niet.
4. Plan vastzetten + "wat is er veranderd" (met reden).
5. Print/export van de geordende lijst als boardrapport.
6. Meldingen (Teams/mail) in plaats van een inbox-scherm.
7. Twee-weg-koppeling Azure DevOps/Jira (grootste adoptiedrempel; groot werk, P2).

**Voorstel om te schrappen (vraagt akkoord eigenaar):** Overzicht-scherm, capaciteitsbord met formule, sessie met fasen/gereedheid/stemming, check-ins met laag/midden/hoog, impediments/ROAM, Mijn-aandacht-scherm, thema's, inspanningsbandbreedtes. De bruikbare kern ervan gaat op in de features hierboven.

## P1 — pilotklaar maken
| Item | Waarom | Bron |
|---|---|---|
| ~~Uitnodigen en rollen beheren in de app~~ — **gebouwd** (branch `claude/p1-invites-rls-realtime`, 007); 007 live gedraaid 2026-10-19; nog: redirect-URL in Supabase Auth, live test met een tweede account | Nu alleen via SQL; een klant kan zelf geen planners/kijkers toevoegen | §18.1 |
| ~~RLS-test voor niet-admins en tenant-scheiding~~ — **gebouwd** (`db/tests/rls_test.sql`, lokaal `npm run test:rls`); live gedraaid 2026-10-19 na 007-010: 101/101 geslaagd | Rechten voor niet-admins zijn nagelopen maar niet live beproefd; drie gaten gevonden en gedicht in 007 | §18.2 |
| ~~Realtime in plaats van 30 s pollen~~ — **gebouwd** (008, fallback naar 30 s); 008 live gedraaid 2026-10-19 (15 tabellen); nog: live controleren met twee schermen | Live sessie met 8–12 teams vraagt een actueel scherm | §18.3 |
| SSO (Entra ID / SAML) en EU-hosting vastleggen | Voorwaarde bij directie, security en OR; semi-overheid vraagt dit expliciet | directeur r1, §11 |
| Aparte test- en productieomgeving, front-end én back-end: tweede Supabase-project (test) naast het huidige (wordt prod), migraties eerst op test, dan prod; aparte front-end-deploy voor test (eigen URL, `VITE_*`-secrets per omgeving) | Nu is er één Supabase-project en één Pages-site; migraties en releases gaan direct live | eigenaar 2026-10-19 |
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
- Uitgenodigde mensen hebben geen wachtwoord: na uitloggen hebben ze een nieuwe link nodig ("stuur mij een inloglink" op het inlogscherm, §18.4).
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

## From the Release A re-test (2026-10-19, director + PMO)
- Kwartaalresultaat: decision owner + date per at-risk item ("who decides, by when").
- Kwartaalresultaat: capacity cut line once Release B capacity exists.
- Kwartaalresultaat: Moet deadline risk per programme in plain text.
- Demo seed: Dutch epic titles to match the Dutch UI.

## From the Release B concept review (2026-10-19)
- Director: one roll-up line per team (load band + asks in gevaar) for all teams on one screen.
- PMO: predictability per team per quarter as export with a trend over quarters.
- Team lead: a copyable session summary (what was agreed) for Teams / Slack.
- Owner to revisit: predictability % per team visible to all (works-council sensitivity).
