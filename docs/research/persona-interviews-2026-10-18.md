# Persona-interviews — 18 oktober 2026

Vijf fictieve maar realistische professionals, los van elkaar geïnterviewd over de "less is more"-versie (drie schermen: Prioriteren, Afhankelijkheden, Afstemmen) en de verborgen uitgebreide modules.

| Persona | Organisatie | Rol in het product |
|---|---|---|
| Marieke de Wit — directeur Dienstverlening & Digitalisering | gemeente, 1.200 fte, 9 teams | bepaalt de volgorde |
| Ingrid Hoekstra — portfoliomanager / PMO | provincie | rapporteert aan directie en Staten |
| Sander Vos — agile coach / RTE | bank, 8–12 teams | leidt het afstemoverleg |
| Lotte Meijer — product owner klantportaal | uitvoeringsorganisatie | vraagkant ("Wij vragen") |
| Ahmed Bouzid — teamlead Cloud Platform | verzekeraar, schaars team | aanbodkant ("Aan ons gevraagd") |

## 1. Kernproblemen (alle vijf herkennen alle drie)

| | Probleem | Typisch voorbeeld | Lost Kwartaalplan het op? |
|---|---|---|---|
| **Strategie** | "Alles is prio 1"; niemand kiest één volgorde, en daarom kiezen teams zelf | 14 "top"-epics; drie projecten "op 1" bij drie wethouders | **Ja** — Prioriteren dwingt één volgorde af, met reden en historie |
| **Planning** | Toezeggingen tussen teams zijn mondeling en worden te laat ontdekt; capaciteit is fictie | "waarschijnlijk" in de gang; "2 weken Platform" ingeboekt zonder te vragen | **Grotendeels** — verzoeken + antwoorden + afstemagenda. Capaciteit maar half (alleen op scherm 2) |
| **Uitvoering** | Wat glijdt, hoor je pas in de review of als de wethouder ernaar vraagt | groen-groen-rood vlak voor de portfolioboard; toezegging stil vervallen na herprioritering | **Nee** — na het afstemmen wordt niets meer gevolgd |

Mooiste zin (teamlead): *"Als een PO zegt 'Platform zei Kan niet omdat onze epic rang 10 heeft' in plaats van 'Ahmed blokkeerde ons', dan heeft de tool het gevecht van mensen naar prioriteiten verplaatst."*

## 2. Oordeel over de verborgen modules

| Module | Directeur | PMO | RTE | PO | Teamlead | Besluit-advies |
|---|---|---|---|---|---|---|
| A. Overzicht (6 KPI's, register, thema's) | schrappen | versimpelen | versimpelen | versimpelen | schrappen | **Schrappen als scherm.** Wat overblijft: een print/export van de geordende lijst met vlaggen (zie 3F) |
| B. Capaciteitsbord (formule, lanes, knipgrens) | 1 getal | schrappen | 1 getal | 1 getal | 1 getal + reserve | **Vervangen door één getal per team**: "beschikbaar pw" (handmatig, eventueel min reserve) tegenover "gevraagd" |
| C. Sessie (8 fasen, gereedheid, stemming) | schrappen | schrappen (lock nuttig) | lock + verschil | schrappen | schrappen | **Schrappen.** Alleen "plan vastzetten + wat is er veranderd" blijft (zie 3E) |
| D. In het kwartaal (check-ins, impediments/ROAM) | stoplicht | status + regel | RAG + regel | "toezegging in gevaar" | "nog haalbaar?" | **Versimpelen tot één signaal** (zie 3A); impediments/ROAM schrappen (5/5) |
| E. Mijn aandacht (inbox-scherm) | wekelijkse mail | achtervolglijst | lijst | teller | notificatie | **Geen scherm.** Teller + melding/mail (zie 3D) |
| Thema's | schrappen | schrappen | schrappen | schrappen | schrappen | **Schrappen** (5/5): strategie zit in de volgorde |
| Wettelijk/deadline-vlag | houden | houden | houden | houden | houden | **Houden** als één vinkje + datum, zichtbaar in de lijst (5/5) |
| Inspanning als bandbreedte | schrappen | 1 getal | schrappen | 1 getal | 1 getal | **Eén getal** (pw) per verzoek |

Niemand wil erbij: KPI-dashboards, thema-matrices, vertrouwensstemmingen (4/5), ROAM-workflow, Gantt/roadmaps, chat/opmerkingen, budget in euro's, planning per persoon.

## 3. Logische vervolgfeatures (gerangschikt op draagvlak en waarde)

| # | Feature | Probleem | Wie vraagt erom | Past bij "less is more" omdat… |
|---|---|---|---|---|
| A | **Uitvoeringssignaal**: één status per epic/toezegging (op koers · in gevaar · gaat niet + één regel); de leverende partij zet "Toezegging in gevaar" met één klik | Uitvoering is blind | 5/5 | Geen nieuw scherm: één kolom in Prioriteren, één knop op een toezegging |
| B | **Twee-weg-koppeling Azure DevOps/Jira**: epics in; rang en antwoorden (en verzoeken als werkitem bij het leverende team) terug | Dubbele invoer, twee lijsten | PO, RTE, teamlead (alle drie #1) | Haalt werk weg in plaats van toe te voegen. Grootste adoptiedrempel |
| C | **Eén capaciteitsgetal per team** ("beschikbaar pw", met optionele reserve voor beheer/storingen) en "gevraagd/beschikbaar" ook zichtbaar bij Prioriteren | Capaciteit is fictie | 4/5 | Eén veld in plaats van een formule en een bord |
| D | **Meldingen in plaats van een inbox**: nieuw verzoek, gewijzigd antwoord, rang van de vragende epic flink gedaald; optioneel weekmail | Stil verval; niemand logt in voor nieuws | teamlead, directeur, PO | Er komt niets bij in de interface |
| E | **Plan vastzetten + "wat is er veranderd"** sinds het vastzetten of vorig kwartaal, met reden | "Daar heb ik nooit ja tegen gezegd"; MT-vraag "waarom ligt dit stil?" | RTE, directeur, PMO | Eén knop en één lijst; de historie bestaat al |
| F | **Print/export van de geordende lijst** (met status, deadline-vlaggen en Kan-niet) als boardrapport | De Excel naast de tool blijft bestaan | PMO, PO, RTE | Alleen output, geen nieuw scherm |
| G | **"Ja, vanaf week X"** bij een toezegging | Timing van de ja is vaak belangrijker dan de ja | teamlead | Eén optioneel veld |

## 4. Wat het product nog niet oplost (en ook niet moet oplossen)
- Budget in euro's, personeelsplanning en vacatures: blijft in financiële en HR-systemen. Wel: het capaciteitsgetal per team mag die realiteit weerspiegelen (directeur: "2,3 fte en twee vacatures").
- Risicoregisters en ROAM: blijven in Jira/ADO of het risicoregister van de organisatie.
- Faciliteren van de sessie (agenda, timers, stemmingen): de facilitator heeft daar eigen tools voor; Afstemmen is genoeg als agenda.
