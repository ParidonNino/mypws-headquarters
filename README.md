# Powerselect Werkplanner

Een Nederlandstalige persoonlijke werkplanner boven op Notion. De planner
combineert open tickets uit actieve epics met een driedaagse agenda,
tijdregistratie, roadmapoverzicht en weekdoelen.

## Belangrijkste functies

- tickets uit de Powerselect Roadmap ophalen, openen, maken en bewerken;
- subtasks aan hun bovenliggende epic koppelen, ook via geneste features;
- taken naar een dag slepen en de planning terugschrijven naar Notion;
- werk starten, pauzeren en afronden via Workblocks;
- gisteren, vandaag en morgen bekijken en per periode navigeren;
- roadmapepics en lokale weekdoelen tonen.

## Lokaal starten

Vereist Node.js 22.13 of nieuwer.

```bash
npm install
npm run dev
```

De Notion-koppeling gebruikt de variabelen uit `.env.local`. Neem geheimen
nooit op in commits of documentatie.

## Controleren

```bash
npm test
npm run lint
```

De productie-opbouw gebruikt `npm run build`. Publicatie verloopt via het
bestaande Sites-project in `.openai/hosting.json`.
