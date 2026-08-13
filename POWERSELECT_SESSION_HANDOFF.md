# Powerselect Werkplanner — sessie-overdracht

Gebruik dit document als context voor een nieuwe Codex-sessie. Ga verder met de bestaande applicatie en maak geen nieuwe site of Notion-databases aan.

## Voorgestelde startprompt

> Ga verder met de Powerselect Werkplanner op basis van `POWERSELECT_SESSION_HANDOFF.md`. Controleer eerst of de taken van de actieve epic na een refresh zichtbaar zijn in productie. Behoud bestaande Notion-data en deploymentconfiguratie. Vraag me daarna welke verbetering we als eerste oppakken.

## Doel en voorkeuren

We bouwen een gebruiksvriendelijke, Nederlandstalige persoonlijke werkplanner boven op Notion:

- Merknaam altijd **Powerselect**, zonder hoofdletter S.
- Notion blijft de backend en bron van waarheid voor roadmap, epics en tickets.
- De frontend moet dagelijkse planning, timers en roadmapoverzicht eenvoudiger maken dan Notion.
- Epics hebben een eigenaar; individuele taken kunnen een andere eigenaar hebben.
- Taken uit actieve epics moeten naar de dagplanning gesleept kunnen worden.
- De gewenste dagweergave toont gisteren, vandaag en morgen.
- Werkstatus moet via Start, Pauze en Klaar beheerd kunnen worden.

## Productie en project

- Vaste lokale projectmap: `C:\Users\nino.van.paridon\Documents\GitHub\mypws-headquarters`
- Live site: <https://powerselect-werkplanner.nino-van-paridon.chatgpt.site/>
- Sites-project-ID: `appgprj_6a68b19af5348191ab58c03d6e200735`
- De bestaande Sites-configuratie staat in `.openai/hosting.json`; hergebruik altijd dit project.
- Laatst succesvol uitgerolde versie: **versie 8**
- Laatste Sites-versie-ID: `appgprj_6a68b19af5348191ab58c03d6e200735~appgver_835e8145f6d88191b5e6fa56421779eb`
- Laatste deployment-ID: `appgdep_6a69dd2014a0819186aa05ec069df55a`
- Laatste uitgerolde commit: `05c71bb09b8890db9dcd36e4d9b51c663dc6cd28`

De productieomgeving heeft deze variabelen al:

- `NOTION_TOKEN` als geheim
- `NOTION_ROADMAP_DATA_SOURCE_ID`
- `NOTION_WORKBLOCKS_DATA_SOURCE_ID`

Neem nooit tokens, API-sleutels of de inhoud van `.env.local` op in output, commits of documentatie.

## Notion-bronnen

- Powerselect Roadmap-pagina: <https://app.notion.com/p/accuselect/639312492ba24df3b3ee5943af5b34e1?v=39641e9d4d5281a48c0f000cd5aa5253&source=copy_link>
- Roadmap data source-ID: `dbe06fab-cee1-42c4-80a3-5757a6c11030`
- Workblocks-database: <https://app.notion.com/p/90cc433d8d8f4b708b3c86686f642b8c?pvs=1>
- Workblocks data source-ID: `5130cdd2-c742-4cc7-8417-37832fa90b48`

### Relevante Roadmap-eigenschappen

- `Task`: titel
- `Task type`: Feature, Subtask, Epic of Template
- `Status`: Backlog, Todo, In Progress, Needs Input of Done
- `Priority`: Critical, High, Medium of Low
- `Owner`: persoon
- `Notes`: tekst; in de interface gebruikt voor “Mijn stappen”
- `Next action`: tekst
- `Estimate hours`
- `Planned today hours`
- `Work date`
- `Parent task`: relatie
- Epics hebben onder andere `Planned start`, `Planned end` en `Progress %`

### Relevante Workblocks-eigenschappen

- `Werkblok`
- `Roadmap task`: relatie
- `Work start`
- `Work end`
- `Actual hours`
- `Planned hours`
- `Werkstatus`
- `Next action`

De verbinding heeft lees-, invoeg- en bijwerkrechten op de gedeelde databases. De gebruiker heeft de Roadmap- en Workblocks-databases met de verbinding gedeeld.

## Belangrijke roadmapcontext

- De roadmap heet **Powerselect Roadmap**.
- De huidige actieve epic is **Refactor Datafetcher service**.
- De database-schema-refactor binnen Datafetcher had de hoogste prioriteit.
- De epic **Prepare for IChooser pilot** bestaat en bevat:
  - Test with FlexMeasures prediction
  - Integrate PV prediction
- Prepare for IChooser pilot komt na Control API en Datafetcher.
- De gebruiker is eigenaar van deze epic.
- Schatting: circa 60 uur bij ongeveer 20–25 uur per week.
- Er is eerder gesproken over een terugkerende controle op maandag om 08:30. Controleer eerst of die automatisering al bestaat voordat je hem wijzigt of opnieuw aanmaakt; het precieze automatiserings-ID staat niet in deze overdracht.

## Wat momenteel werkt

### Mijn dag

- Dynamische kolommen voor gisteren, vandaag en morgen.
- Taken naar een datum slepen; `Work date` wordt in Notion opgeslagen.
- Start, Pauze en Klaar zijn gekoppeld aan Roadmap en Workblocks.
- Pauze sluit het huidige werkblok en schrijft verstreken tijd en status weg.
- Opnieuw starten maakt een volgend werkblok en behoudt de cumulatieve timer.
- Klaar sluit het werkblok en zet de Roadmap-ticketstatus op Done.
- Een taak kan via een knop of dubbelklik worden geopend.
- De standaardtijd is gecorrigeerd naar 09:00 en een bestaande tijd blijft behouden.

### Taken en tickets

- Filteren op alle epics, actieve epics of een specifieke epic.
- Ondersteuning voor meerdere actieve epics.
- De zijbalk is bedoeld voor open, nog niet ingeplande subtasks van actieve epics.
- Sortering gebeurt op prioriteit en daarna epic/titel.
- Nieuwe tickets kunnen via de plusknop worden aangemaakt.
- Tickets kunnen worden aangepast met:
  - titel
  - epic
  - type
  - prioriteit
  - eigenaar
  - schatting
  - planning
  - Next action
  - Mijn stappen
- Eigenaren worden via Notion `/v1/users` opgehaald.

### Overige weergaven

- Roadmapweergave met een eenvoudige frontend-tijdlijn.
- Weekweergave voor weekdoelen en reflectie.
- Weekdoelen en reflectie staan momenteel alleen in de browseropslag, niet in Notion.

## Laatste opgeloste problemen

### Taken verdwenen uit de zijbalk

Notion bevatte de taken nog. De frontend gaf echter een lege lijst wanneer het ophalen van actieve epics tijdelijk faalde.

Versie 8 bevat hiervoor:

- terugvallen op beschikbare taken als geen actieve epics geladen zijn;
- ook subtasks tonen in de fallback;
- de Notion-statusknop laat de gegevens werkelijk opnieuw ophalen;
- een lege staat met de knop **Toon alle epics**.

Dit is succesvol uitgerold, maar de gebruiker moet nog bevestigen dat de taken na een harde refresh werkelijk weer zichtbaar zijn.

### Tijd begon om 16:00

De oorzaak was een hardgecodeerde starttijd. De planner:

- behoudt nu een bestaande tijd;
- gebruikt anders 09:00;
- initialiseert de demo-timer op nul.

### Pauze en hervatten

Eerder begon de timer na Pauze → Start opnieuw op nul. Dit is aangepast zodat eerdere afgesloten Workblocks worden opgeteld bij de huidige sessie.

## Laatste gecontroleerde Notion-data

Een directe servercontrole leverde op:

- 73 taken
- 12 epics
- 1 actieve epic
- 3 beschikbare personen

Actieve epic:

- ID: `39641e9d-4d52-8104-a73a-ff053b6c5c4c`
- Titel: Refactor Datafetcher service

Open, nog niet ingeplande taken die bij de actieve epic werden gevonden:

- Design the multi-asset telemetry domain model
- Test migration and roll out the refactored Datafetcher
- Implement reliable polling, retries and idempotent writes
- Add telemetry validation, observability and data-quality checks
- Create and migrate OEM telemetry adapters
- Define the Datafetcher ingestion and repository architecture

Al ingepland:

- Inventory current Datafetcher flows and data contracts — morgen, gepauzeerd
- Test test — gisteren

Een bredere telling in Notion gaf 88 niet-template-items, één actieve epic en 58 open subtasks. Het verschil met de apprespons kan samenhangen met filtering en lege statussen.

## Bekende aandachtspunten en aanbevolen volgorde

1. **Controleer versie 8 in productie**
   - Doe een harde refresh.
   - Klik indien nodig op de Notion-statusknop om opnieuw te synchroniseren.
   - Bevestig dat de zes open Datafetcher-taken weer in de zijbalk staan.

2. ~~**Maak de taakhiërarchie robuuster**~~ — afgerond. De bovenliggende epic
   wordt via de volledige ancestor-keten opgelost (`lib/notion-tasks.ts`), en
   het bewerken van een geneste subtask behoudt de directe parent.

3. ~~**Voeg paginering toe**~~ — afgerond. `queryDataSource` en `listUsers`
   volgen `has_more` / `next_cursor` volledig.

4. **Beslis wat de timer precies moet optellen**
   - Nu worden alle historische `Actual hours` per taak opgeteld.
   - Beslis samen met de gebruiker of de timer levenslang per ticket of alleen per dag moet cumuleren.

5. **Roadmap verder bewerkbaar maken**
   - De tijdlijn is nu vooral een benadering en grotendeels alleen-lezen.
   - Gewenst is later planning en updates vanuit de roadmapweergave te kunnen wijzigen.

6. **Weekplanning eventueel naar Notion**
   - Weekdoelen en reflectie staan nu in `localStorage`.
   - Maak hiervoor pas een Notion-model nadat de gebruiker de gewenste structuur bevestigt.

7. **Dagplanning verfijnen**
   - Er is nog geen vrije positionering of nauwkeurig tijdslot op basis van de drop-locatie.

## Technische structuur

- `app/page.tsx`: hoofdinterface en client-state
- `app/globals.css`: vormgeving
- `app/api/notion/tasks/route.ts`: Roadmap-taken ophalen, aanmaken en aanpassen
- `app/api/notion/workblocks/route.ts`: timers en werkblokken
- `lib/notion-tasks.ts`: Notion REST-integratie, mapping, validatie en Workblocks
- `tests/notion-workblocks.test.mjs`: integratielogica; 12 tests, geen build nodig
- `tests/rendered-html.test.mjs`: 2 tests op de server-rendered HTML; vereist een build
- `.env.example`: configuratievoorbeeld
- `.env.local`: lokale geheimen; nooit tonen of committen
- `.openai/hosting.json`: bestaand Sites-project

Deze nieuwe projectmap heeft een gewone `.git` in de projectroot met de volledige bestaande deploymentgeschiedenis. Normale Git-commando's kunnen daarom rechtstreeks vanuit deze map worden uitgevoerd.

## Testen

De meest recente stand:

- 12 van 12 unit-tests geslaagd
- 2 van 2 HTML-tests geslaagd
- `tsc --noEmit` geslaagd
- ESLint geslaagd
- productiebuild geslaagd

Zie de README voor de commando's (`npm run check`, `npm run test:build`).

Let op: er staat op deze machine geen Node.js in `PATH`. De eerder
gedocumenteerde Codex-runtime bestaat niet meer. Docker is wel aanwezig, dus
de checks kunnen in een container:

```powershell
docker run --rm -v "${PWD}:/src" -w /src node:22 sh -c "npm ci && npm run check"
```

## Recente deploymentcommits

```text
05c71bb Restore tasks when Notion sync needs retry
c1806c9 Show active epic subtasks and task details
1d7ae55 Fix default task planning time
ad8cf9 Add ticket editing and dynamic day planning
d6a32a6 Add roadmap week planning and ticket creation
3f161a0 Keep task timer cumulative across sessions
2b13367 Fix work timer state without Workblocks access
1530f43 Connect Powerselect planner actions to Notion
e386868 Build Powerselect work planner with Notion sync
```

## Publiceren

Omdat `.openai/hosting.json` bestaat, moeten de Sites building- en hostinginstructies volledig worden gelezen en gevolgd.

Veilige volgorde:

1. Draai tests, lint en build.
2. Commit alleen bedoelde wijzigingen in de gewone Git-repository van deze projectmap.
3. Push exact die commit naar de door Sites opgegeven bronbranch.
4. Sla een Sites-versie op met de exacte commit-SHA.
5. Deploy alleen die opgeslagen versie.
6. Controleer de deploymentstatus tot deze definitief geslaagd of mislukt is.

Op Windows was bij een eerdere push `http.sslBackend=openssl` nodig vanwege een `schannel SEC_E_NO_CREDENTIALS`-fout. Een tijdelijke Sites-broncredential is alleen voor de deploymentpush gebruikt en daarna verwijderd. Sla zo’n credential nergens op en toon hem nooit.

Elke Sites-deployment is productie. Maak geen nieuw Sites-project aan.

## Beperkingen bij verificatie

- Een niet-ingelogde browser kreeg bij de productiesite een aanmeldscherm. Daardoor kon de laatste versie niet volledig visueel worden getest vanuit de geautomatiseerde browser.
- De deployment zelf is geslaagd.
- De directe serverfunctie leverde geldige Notion-data.
- Een lokale `vinext start`-controle gaf eerder een API 500, terwijl de directe functie en clouddeployment wel werkten. Onderzoek dit alleen verder als het probleem ook in productie reproduceerbaar is.

## Werkwijze voor de volgende sessie

- Begin met verificatie van de zichtbare taken; herschrijf niet direct de datalaag.
- Bewaar bestaande Notion-data en bestaande gebruikerswijzigingen.
- Maak kleine, controleerbare wijzigingen.
- Draai tests, lint en build voor iedere deployment.
- Vraag alleen om nieuwe rechten wanneer een concrete actie die echt nodig heeft.
- Zet nooit geheime waarden in chat, logs, Markdown, screenshots of commits.
- Overleg met de gebruiker voordat het Notion-datamodel of timerbetekenis fundamenteel wordt veranderd.
