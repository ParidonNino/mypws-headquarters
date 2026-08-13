# My Powerselect Headquarters

Een Nederlandstalige persoonlijke werkplanner boven op Notion. De planner
combineert open tickets uit actieve epics met een driedaagse agenda,
tijdregistratie, roadmapoverzicht en weekdoelen.

## Belangrijkste functies

- tickets uit de Powerselect Roadmap ophalen, openen, maken, bewerken en
  verwijderen;
- subtasks aan hun bovenliggende epic koppelen, ook via geneste features;
- taken naar een dag slepen, terugzetten naar de lijst, en de planning
  terugschrijven naar Notion;
- werk starten, pauzeren en afronden via Workblocks, en geregistreerde tijd
  achteraf corrigeren;
- gisteren, vandaag en morgen bekijken en per periode navigeren;
- de week als bord van vijf dagen plannen, met weekdoelen per week;
- roadmapepics en voortgang per ticket tonen.

## Lokaal starten

Vereist Node.js 22.18 of nieuwer. De testsuite importeert `.ts`-bestanden
direct en leunt op type stripping, dat pas vanaf 22.18 zonder vlag werkt.

Maak eerst je eigen omgevingsbestand aan:

```bash
cp .env.example .env.local
```

Vul daarin je eigen Notion-sleutel en data source-ID's in. `.env.local` staat
in `.gitignore` en hoort nooit in een commit of in documentatie.

Daarna:

```bash
npm install
npm run dev
```

### Met Docker

`docker-compose.yml` start dezelfde dev-server in een container. Vereist een
bestaande `.env.local` (zie hierboven) — zonder dat bestand stopt Docker
Compose voordat de container start.

```bash
docker compose up --build
```

De planner staat dan op http://127.0.0.1:3000. De poort is bewust alleen aan
loopback gebonden, zodat de planner en de Notion-sleutel erachter niet
bereikbaar zijn voor anderen in hetzelfde netwerk.

## Aanmelden via Notion

De planner is afgeschermd met Notion OAuth. Wie zich niet kan aanmelden bij de
Powerselect-workspace, komt er niet in — en de Notion-sleutel erachter dus ook
niet bij.

Hoe het werkt: je wordt doorgestuurd naar Notion, Notion stuurt je terug met
een code, de server wisselt die om voor een token, leest daarmee éénmalig je
gecontroleerde e-mailadres via `GET /v1/users/me`, en gooit het token daarna
weg. Wat overblijft is een ondertekende sessiecookie. Het lezen en schrijven
van de roadmap blijft via de vaste `NOTION_TOKEN` lopen, zodat iedereen
dezelfde roadmap ziet en niemand handmatig pagina's hoeft te delen.

Let op: dit is een **andere** integratie dan `NOTION_TOKEN`. Eén integratie is
óf internal óf public, dus je houdt er twee naast elkaar: de bestaande internal
integration voor de data, en een nieuwe public connection voor het inloggen.

Eenmalige opzet in de Notion Developer portal (Build → Public connections →
Create new connection):

1. Kies bij **installation scope** de optie *Selected workspaces only* en
   selecteer de Powerselect-workspace. Dit is **niet meer te wijzigen na het
   aanmaken** — kies je hier verkeerd, dan moet je een nieuwe connection maken.
2. Zet bij **capabilities** het lezen van gebruikersinformatie **inclusief
   e-mailadressen** aan. Zonder die capability levert `GET /v1/users/me` geen
   e-mailadres en mislukt het inloggen.
3. Zet als **redirect URI** exact
   `http://127.0.0.1:3000/api/auth/notion/callback` — hetzelfde origin als
   `APP_ORIGIN`.
4. Haal in de **Configuration**-tab de OAuth client ID en client secret op en
   zet die met een verse `SESSION_SECRET` in `.env.local`.
5. Vul `ALLOWED_EMAILS` met je eigen e-mailadres. Meld daarna één keer aan: de
   server logt dan je `workspace_id`. Zet dat in `NOTION_WORKSPACE_ID` en maak
   `ALLOWED_EMAILS` eventueel leeg om de hele workspace toe te laten.

Minstens één van `NOTION_WORKSPACE_ID` en `ALLOWED_EMAILS` is verplicht: Notion
OAuth laat élk Notion-account in élke workspace inloggen, dus zonder beperking
bewijst een geslaagde login niets. Ontbreekt er configuratie, dan weigert de app
álle verzoeken met een uitleg — dat is opzet. Voor werken aan de interface vóór
de connection bestaat, kun je `AUTH_DISABLED=true` zetten; gebruik dat nooit op
iets dat van buiten je eigen machine bereikbaar is.

Met een sessie krijg je ook **Alleen mijn taken** in de zijbalk: dat filtert op
de `Owner`-eigenschap via je Notion-gebruikers-ID.

## Controleren

```bash
npm run check
```

Dat is `typecheck` + `lint` + de unit-tests, en duurt enkele seconden.
Losse onderdelen:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:build
```

`test:unit` heeft geen productie-opbouw nodig en blijft dus werken als de
build om een andere reden faalt. `test:build` bouwt eerst en controleert
daarna de server-rendered HTML. `npm test` doet beide.

De productie-opbouw gebruikt `npm run build`. Publicatie verloopt via het
bestaande Sites-project in `.openai/hosting.json`.
