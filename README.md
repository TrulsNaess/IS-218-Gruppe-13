# 218-Oppgave-1
Gruppe 13 sin repository for oppgave 1 i IS-218
Prosjektnavn & TLDR 
Kartet vi har laget viser skredfaresoner og fjelltopper i Agder. Det gir viktig informasjon om risiko og sikkerhet, og hjelper til med å unngå områder med skredfare. 

Arkitekturskisse
1. Kilde - Data kommer fra lokale GeoJSON-filer(fylker og skred) eller fra ekstern API (Kartverket)
2. Henting av data - Javascript bruker fetch() til å laste ned GeoJSON-filene og API-dataene
3. Behandling av data - Når dataene er hentet, blir de gjort klare for kartet:
   - GeoJSON-objekter parses
   - Egenskaper brukes til farger, popups og filtrering
   - Fjelltopper filtreres etter type
4. Visning i kartet - Leaflet mottar ferdig behandlet data og legger de inn som kartlag (punkt, polygon osv.).
5. Presentasjon i nettleseren - Kartet rendres i HTML-siden, og brukeren kan zoome, klikke og se popup-informasjon. 


Teknisk stack
1.Applikasjonen er utviklet med Leaflet v1.9.4 som kartbibliotek. Leaflet brukes til å opprette og vise det interaktive kartet, laste inn GeoJSON-filer, håndtere lagkontroll og vise popups. Biblioteket lastes inn via CDN fra unpkg.com med tilhørende CSS-fil.

2.OpenStreetMap (OSM) brukes som bakgrunnskart gjennom Leaflet sin `L.tileLayer()`-funksjon. OSM leverer kun kartgrunnlaget (kartfliser), mens det er Leaflet som står for selve kartfunksjonaliteten.

3.Kartet viser lokale GeoJSON-filer (fylker_agder.geojson og skred.geojson) som lastes inn med JavaScript Fetch API. Dataene vises med `L.geoJSON()` og er gjort interaktive med popups og datadrevet styling basert på attributtverdier.

4.Eksterne data hentes fra Kartverket/GeoNorge sitt Stedsnavn API ([https://ws.geonorge.no/stedsnavn/v1/navn](https://ws.geonorge.no/stedsnavn/v1/navn)). Disse dataene behandles i JavaScript og legges til som egne lag i kartet.

5.Løsningen er bygget med HTML5, CSS3 og moderne JavaScript (ES6). Fetch API brukes til å hente data asynkront, og Leaflet håndterer kartvisning, lagstyring og romlig filtrering.
