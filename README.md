# 218-Oppgave-1
Gruppe 13 sin repository for oppgave 1 i IS-218

**Prosjektnavn & TLDR**
Kartet vi har laget viser skredfaresoner og fjelltopper i Agder. Det gir viktig informasjon om risiko og sikkerhet, og hjelper til med å unngå områder med skredfare. 

**Arkitektur**
Applikasjonen består av tre hoveddeler: datakilder, klientlogikk, og presentasjon i nettleseren. Data hentes fra lokale filer og eksterne API-er, behandles i JavaScript, og visualiseres i Leaflet.

```mermaid
flowchart TD

    A[Datakilder<br><br>- Lokale GeoJSON (fylker, skred)<br>- Ekstern API (Kartverket)] --> B[Datainnhenting<br><br>fetch() i JavaScript]

    B --> C[Databehandling<br><br>- Parse GeoJSON<br>- Filtrering<br>- Fargevalg<br>- Popup-data]

    C --> D[Kartvisning (Leaflet)<br><br>- Polygonlag<br>- Punktlag<br>- Interaksjon]

    D --> E[Presentasjon i nettleseren<br><br>HTML + CSS + JS]
```



**Teknisk stack**
1.Applikasjonen er utviklet med Leaflet v1.9.4 som kartbibliotek. Leaflet brukes til å opprette og vise det interaktive kartet, laste inn GeoJSON-filer, håndtere lagkontroll og vise popups. Biblioteket lastes inn via CDN fra unpkg.com med tilhørende CSS-fil.

2.OpenStreetMap (OSM) brukes som bakgrunnskart gjennom Leaflet sin `L.tileLayer()`-funksjon. OSM leverer kun kartgrunnlaget (kartfliser), mens det er Leaflet som står for selve kartfunksjonaliteten.

3.Kartet viser lokale GeoJSON-filer (fylker_agder.geojson og skred.geojson) som lastes inn med JavaScript Fetch API. Dataene vises med `L.geoJSON()` og er gjort interaktive med popups og datadrevet styling basert på attributtverdier.

4.Eksterne data hentes fra Kartverket/GeoNorge sitt Stedsnavn API ([https://ws.geonorge.no/stedsnavn/v1/navn](https://ws.geonorge.no/stedsnavn/v1/navn)). Disse dataene behandles i JavaScript og legges til som egne lag i kartet.

5.Løsningen er bygget med HTML5, CSS3 og moderne JavaScript (ES6). Fetch API brukes til å hente data asynkront, og Leaflet håndterer kartvisning, lagstyring og romlig filtrering.

**Datakatalog**

| Datasett | Kilde | Format | Bearbeiding |
|---------|--------|---------|--------------|
| **Fylker i Agder** | Lokal fil: `fylker_agder.geojson` | GeoJSON | Parsed i JavaScript. Polygoner styles basert på fylkesnavn. Brukes som bakgrunnslag for regioninndeling. |
| **Skredhendelser** | Lokal fil: `skred.geojson` | GeoJSON | Parsed og filtrert etter skredtype. Punktlag med popups og fargekoding basert på attributter. |
| **Stedsnavn / Fjelltopper** | Kartverket / GeoNorge API: `https://ws.geonorge.no/stedsnavn/v1/navn` | JSON (API-respons) | Hentes med Fetch API. Filtreres til relevante typer (f.eks. fjelltopper). Legges til som eget punktlag i Leaflet. |
| **Bakgrunnskart** | OpenStreetMap via Leaflet TileLayer | Rasterfliser | Ingen bearbeiding. Vises som standard bakgrunnskart. |
