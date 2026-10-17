# Demo-script Kwartaalplan (per rol)

Dit script hoort bij de ingebouwde rondleiding ("Rondleiding" in de koptekst, demomodus). Gebruik het om de demo live te geven of om een prospect zelf te laten klikken. Alle data is fictief ("Oranje Verzekeringen"); met "Instellingen › Start with an empty organisation" begint de inrichtingswizard voor een nieuwe organisatie.

Start: open de app, kies kwartaal **2027 Q1 (Onderhandelen)**. Wissel van rol via **Bekijken als**.

## 1. Directeur (Ruud Visser) — 2 minuten per kwartaal
Vraag die hij stelt: *"Komen onze strategische en wettelijke prioriteiten er dit kwartaal door, en waar moet ik een knoop doorhakken?"*
1. **Overzicht**: zes cijfers. Wijs op "Data per" (versheid) en dat alles van het bord is afgeleid.
2. **Rode vlaggen**: één regel per epic, hoogste ernst eerst, met eigenaar. Toon EP-0019 (DORA): regulatoir, deadline vóór de kwartaalstart, verzoek onopgelost.
3. **Regulatoir register**: per regeling deadline, rang, commitment, "past in capaciteit". *"Dit is de tabel voor de toezichthouder."*
4. **Bord › epic-paneel**: verander een strategische rang; de reden is verplicht en komt in de historie. *"Besluiten zijn uitlegbaar."*
5. **Sessie**: stemmen blijven verborgen tot de facilitator onthult; ook voor de directeur. *"Geen beïnvloeding."*

## 2. Hoofd Platform / engineering manager (Mark van Dijk) — het schaarse team
Vraag: *"Hoe laat ik zien wat past, en zeg ik eerlijk nee zonder gezichtsverlies?"*
1. **Bord**, filter "Mijn team + teams die wij vragen / die ons vragen". Capaciteitsbalk: formule zichtbaar via "Capaciteitsaannames".
2. **Knipgrens**: eigen epics en geaccepteerde verzoeken samen op rang. *"Het gesprek wordt: wat valt eronder."*
3. **Afhankelijkheden › intakewachtrij**: per verzoek "past op rang N (cum. X)" of "duwt EP-… onder de knipgrens"; openstaande verzoeken als "als alles geaccepteerd".
4. **Beantwoorden**: gedeeltelijk met toegekende weken, uitstellen naar kwartaal, weigeren met reden; "prioriteitsbesluit nodig" komt automatisch op de discussieagenda.
5. **Mijn aandacht**: wat wacht op jouw team.

## 3. Product owner (Lotte Meijer) — mijn epic op andermans bord
Vraag: *"Krijg ik de hulp die mijn epic nodig heeft, en hoor ik dat zonder te bellen?"*
1. **Bord**, kolom Klantportaal: één label voor de slechtste stand van de verzoeken.
2. **Epic-paneel › Vraag een team**: team, kwartaal, laag-hoog schatting, wat als nee. Geen vooringevulde schatting.
3. **Mijn aandacht**: "Jouw verzoeken zonder antwoord" (met leeftijd) en "Antwoorden op jouw verzoeken" (met reden); weigering bevestigen met "Gezien".
4. **Matrix team × team**: geen spaghetti; klik een cel.
5. **In het kwartaal**: check-in = vertrouwen + één regel; impediments met eigenaar en leeftijd.

## 4. Facilitator / agile coach (Anouk de Jong) — de sessie zonder tweedaagse
Vraag: *"Kan ik acht teams asynchroon laten plannen en de live tijd beperken tot de echte discussie?"*
1. **Sessie › fasen**: één stap per keer; terug kan met reden. De fase bepaalt wat kan.
2. **Gereedheid per team**: epics, capaciteit, open verzoeken, over capaciteit, geweigerde verzoeken, open discussiepunten, stem.
3. **Discussieagenda**: op strategische rang, met timebox-totaal. *"Dit is de live agenda."*
4. **Stemmen › Onthullen › Vergrendelen**: override-reden bij open punten; basislijn; daarna verschil met reden per wijziging.
5. **Plan van record**: printbare afsluiting.
6. **Instellingen**: inrichtingschecklist, bulkcapaciteit, Azure DevOps-import (demo).

## 5. Teamlid / stakeholder / OR — alleen kijken
1. **Bord**: dezelfde waarheid voor iedereen, velden uitgeschakeld.
2. **In het kwartaal**: geen individuele productiviteitsdata; afwezigheid is een teamtotaal.

## 6. Nieuwe organisatie inrichten (wizard)
Instellingen › "Start with an empty organisation" (demomodus) of een verse database met een admin-lidmaatschap:
profiel (taal, naam, wat heet een planningseenheid, capaciteitseenheid, boekjaar) → teams → strategische thema's → eerste kwartaal → capaciteit per team → waar epics vandaan komen → klaar. Alles blijft achteraf aanpasbaar in Instellingen; de checklist toont de volledigheid.

## Veelgestelde vragen tijdens demo's
- *Vervangt dit Jira/Azure DevOps?* Nee. Epics blijven daar; Kwartaalplan importeert alleen-lezen en bewaart rang, schatting, commitment en verzoeken. Geen dubbele invoer van backlog-items.
- *Waarom geen uren per persoon?* Capaciteit per team per kwartaal houdt het eerlijk en uitlegbaar; per persoon plannen wordt resourcemanagement en raakt privacy (afwezigheid is een teamtotaal).
- *Wat als een team over capaciteit staat?* De knipgrens waarschuwt en maakt het gesprek concreet; het blokkeert nooit. Besluiten liggen bij rang-houders en de sessie.
- *Multi-tenant / SSO / Nederlandse hosting?* Het datamodel is organisatie-gescheiden (org_id + RLS). SSO (Entra ID), EU-regio en meerdere gelijktijdige sessies staan op de roadmap (docs/design.md §11, §17.4).
