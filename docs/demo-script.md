# Kwartaalplan — de flow en de wizard, in gewone woorden

_Bijgewerkt 18 oktober 2026, na de "less is more"-reset._

## Wat het product doet, in één zin
De top bepaalt de volgorde van de epics; daarna stemmen teams hun afhankelijkheden af, hoogste prioriteit eerst.

Kwartaalplan is bewust een dunne laag bovenop wat teams al gebruiken (Azure DevOps, Jira, Excel). Er zijn drie schermen, genummerd in de volgorde waarin je ze gebruikt.

## De drie schermen

### 1. Prioriteren — "Wat is het belangrijkst?"
- Eén lijst met alle epics van het kwartaal, van belangrijk naar minder belangrijk.
- **Volgorde wijzigen:** slepen aan het handvat links, of de pijltjes (Alt+↑/↓). Daarna verschijnt één regel "Waarom? (optioneel)" en Opslaan. De wijziging komt in de historie.
- **De rechterkolom** toont per epic het belangrijkste afhankelijkheidssignaal: bijvoorbeeld "✕ Kan niet · Platform & Security" of "✓ 2 toegezegd". Een rode of oranje streep links betekent: hier speelt iets.
- Klik op een rij voor het zijpaneel (team, rang, inspanning, verzoeken). Esc sluit.
- Wie mag ordenen: beheerders en mensen met rangrecht (bijvoorbeeld de directie). Anderen zien de volgorde, zonder handvat.

### 2. Afhankelijkheden — "Wat vragen wij, en wat wordt ons gevraagd?"
- Kies bovenaan het team (standaard je eigen team).
- **Wij vragen:** onze epics op volgorde van prioriteit, met per epic wat we van andere teams nodig hebben en de stand (Open, Toegezegd, Bespreken, Kan niet). "+ Verzoek" voegt er direct één toe: team en wat. Epics zonder verzoeken staan ingeklapt.
- **Aan ons gevraagd:** alles wat andere teams van ons vragen, op volgorde van hún prioriteit. Per verzoek drie knoppen: **Toezeggen**, **Bespreken** of **Kan niet** (alleen bij "Kan niet" vraagt hij om een korte reden). Bovenaan staat "Gevraagd X pw · beschikbaar Y pw" als de capaciteit van het team is ingevuld; rood als het niet past.

### 3. Afstemmen — "Wie moet met wie praten?"
- Vier tellers: Kan niet · Bespreken · Open · Toegezegd. De eerste twee vallen op, want daar zit het werk.
- Eén regel: "Top 5: n in gevaar (rang …)". Daaronder de teamparen die moeten praten, gesorteerd op de hoogste prioriteit die op het spel staat.
- Klap een paar open: je ziet de concrete verzoeken en kunt tijdens het overleg direct antwoorden (Toezeggen / Bespreken / Kan niet). Met "Besproken" vink je een paar af.
- Dit scherm is de agenda van het afstemmingsoverleg. De matrix (team × team) staat onderaan achter "Matrix tonen".

### Instellingen (tandwiel)
Organisatie en taal, teams, kwartalen, mensen en rollen (uitnodigen), import uit Azure DevOps (demo), demo-reset. Onder "Uitgebreide modules (beta)" staan de eerdere uitbreidingen (overzicht, capaciteitsbord, sessie met stemming, check-ins); standaard uit.

## De wizard (drie stappen)
Je komt in de wizard als beheerder van een organisatie die nog niet is ingericht. In de demo: Instellingen › Demo › "Beginnen met een lege organisatie".

1. **Jouw organisatie** — naam (bijvoorbeeld "Gemeente Rivierenland") en taal. → Volgende.
2. **Welke teams plannen hier?** — één team per regel (minimaal twee). → Volgende.
3. **Kwartaal en eerste epics** — kies jaar en kwartaal; zet epics neer als "Team: titel", één per regel. Of klik "Importeer uit Azure DevOps (demo)". → **Naar prioriteren**.

Daarna sta je op Prioriteren, met je eerste epics in de lijst. Slepen om te ordenen, en de flow begint. Wil je terug naar de voorbeelddata: "Laad in plaats daarvan de demo-organisatie".

## Een demo van 5 minuten
1. **Prioriteren** (als directeur, Ruud Visser): sleep "Policy admin migration" naar plek 3, reden "Kernmigratie eerst". Laat zien dat de rechterkolom vertelt wat er speelt.
2. **Afhankelijkheden** (als teamlead, Pieter Mulder · Polisadministratie): tab "Aan ons gevraagd"; laat de volgorde op prioriteit zien en klik Toezeggen bij één verzoek.
3. **Afstemmen** (als facilitator, Anouk de Jong): "Top 5: 2 in gevaar". Klap het bovenste paar open en beantwoord een verzoek in het overleg; vink "Besproken" aan.
4. Optioneel: Instellingen › lege organisatie › de wizard in drie stappen.

Wisselen van rol gaat via het accountmenu rechtsboven ("Bekijken als"). Daar staat ook de **Rondleiding**: drie korte rondleidingen (Directeur: prioriteren · Teamlead: aan ons gevraagd · Facilitator: afstemmen).
