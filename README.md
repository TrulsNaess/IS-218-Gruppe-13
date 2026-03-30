# 218-Oppgave-1
Gruppe 13 sin repository for oppgave 1 i IS-218

## Prosjektnavn & TLDR
Kartet vi har laget viser skredfaresoner og fjelltopper i Agder. Det gir viktig informasjon om risiko og sikkerhet, og hjelper til med å unngå områder med skredfare.

## GIF av systemet
![Demonstrasjon av webkartet](webkartGIF.gif)

## Arkitektur
Applikasjonen består av tre hoveddeler: datakilder, klientlogikk, og presentasjon i nettleseren. Data hentes fra lokale filer og eksterne API-er, behandles i JavaScript, og visualiseres i Leaflet.

```mermaid
flowchart TD

    A["Datakilder
    - Lokale GeoJSON (fylker, skred)
    - Ekstern API (Kartverket)"] --> B["Datainnhenting
    fetch() i JavaScript"]

    B --> C["Databehandling
    - Parse GeoJSON
    - Filtrering
    - Fargevalg
    - Popup-data"]

    C --> D["Kartvisning (Leaflet)
    - Polygonlag
    - Punktlag
    - Interaksjon"]

    D --> E["Presentasjon i nettleseren
    HTML + CSS + JS"]
```

## Teknisk stack
1. Applikasjonen er utviklet med Leaflet v1.9.4 som kartbibliotek. Leaflet brukes til å opprette og vise det interaktive kartet, laste inn GeoJSON-filer, håndtere lagkontroll og vise popups. Biblioteket lastes inn via CDN fra unpkg.com med tilhørende CSS-fil.

2. OpenStreetMap (OSM) brukes som bakgrunnskart gjennom Leaflet sin `L.tileLayer()`-funksjon. OSM leverer kun kartgrunnlaget (kartfliser), mens det er Leaflet som står for selve kartfunksjonaliteten.

3. Kartet viser lokale GeoJSON-filer (`fylker_agder.geojson` og `skred.geojson`) som lastes inn med JavaScript Fetch API. Dataene vises med `L.geoJSON()` og er gjort interaktive med popups og datadrevet styling basert på attributtverdier.

4. Eksterne data hentes fra Kartverket/GeoNorge sitt Stedsnavn API (https://ws.geonorge.no/stedsnavn/v1/navn). Disse dataene behandles i JavaScript og legges til som egne lag i kartet.

5. Løsningen er bygget med HTML5, CSS3 og moderne JavaScript (ES6). Fetch API brukes til å hente data asynkront, og Leaflet håndterer kartvisning, lagstyring og romlig filtrering.

## Datakatalog

| Datasett | Kilde | Format | Bearbeiding |
|---------|--------|---------|--------------|
| **Fylker i Agder** | Lokal fil: `fylker_agder.geojson` | GeoJSON | Parsed i JavaScript. Polygoner styles basert på fylkesnavn. Brukes som bakgrunnslag for regioninndeling. |
| **Skredhendelser** | Lokal fil: `skred.geojson` | GeoJSON | Parsed og filtrert etter skredtype. Punktlag med popups og fargekoding basert på attributter. |
| **Stedsnavn / Fjelltopper** | Kartverket / GeoNorge API: `https://ws.geonorge.no/stedsnavn/v1/navn` | JSON (API-respons) | Hentes med Fetch API. Filtreres til relevante typer (f.eks. fjelltopper). Legges til som eget punktlag i Leaflet. |
| **Bakgrunnskart** | OpenStreetMap via Leaflet TileLayer | Rasterfliser | Ingen bearbeiding. Vises som standard bakgrunnskart. |

## Refleksjoner gjort

Vi kunne brukt mer tid på hva slags dataset vi valgte. Diskutert og engasjert oss mer på hva vi ville utforske med geonorge og utarbeidet en bedre plan med tidsfrister og møter. Ble en veldig inviduell oppgave for de fleste, ettersom vi hadde få møter til å snakke om og utføre prosjektet sammen. Arbeidskravene er utfylt, men samtidig sitter vi igjen med følelsen om at her kan vi legge inn ett bedre arbeid ved å kommunisere bedre. Dette tar vi med oss til neste prosjekt/oppgave.

## Oppgave 2 Del B: Romlig utvidelse

### Beskrivelse av utvidelsen
Vi har lagt til en funksjon i webkartet som lar brukeren finne alle punkter (f.eks. skredhendelser) innenfor en valgfri radius fra et valgt punkt. Radiusen kan endres av brukeren, for eksempel til 30 km, og resultatene oppdateres dynamisk i kartet. Dette gir mulighet for å utforske geografiske sammenhenger og risiko i et område.

### Demo av system
![Demonstrasjon av webkartet](webkartGIF.gif)

### SQL-snippet
Her er SQL-funksjonen som er lagret i Supabase og brukes til å hente alle punkter innenfor valgt radius (kan endres, f.eks. 30 000 meter):

```sql
create or replace function public.get_features_within(
    lat_in double precision,
    lon_in double precision,
    radius_m_in integer
)
returns jsonb
language sql stable as $$
    with q as (
        select
            to_jsonb(t) - 'geom' as props,
            ST_AsGeoJSON(t.geom)::jsonb as geometry,
            ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint(lon_in, lat_in), 4326)::geography) as distance_m
        from public.skred_zones t
        where ST_DWithin(
            t.geom::geography,
            ST_SetSRID(ST_MakePoint(lon_in, lat_in), 4326)::geography,
            radius_m_in
        )
    )
    select jsonb_build_object(
        'type','FeatureCollection',
        'features', coalesce(jsonb_agg(
            jsonb_build_object(
                'type','Feature',
                'properties', (q.props || jsonb_build_object('distance_m', round(q.distance_m::numeric,0))),
                'geometry', q.geometry
            )
        ), '[]'::jsonb)
    )
    from q;
$$;
```

### Notebook-guide
Først må du åpne Google colab linken vår:
https://colab.research.google.com/drive/1ey9-2yTEjBSCmVt0VilnBpcoaWCjtvnt?usp=sharing

Vi legger filen i repositoryet også, men du kommer nok til å få problemer til å kjøre det der, siden koden ble skrevet med å hente datasettene fra Google Disk.
Derfor er det viktig at man leser "Koble til Google Drive". Denne gir steg for steg hvordan du skal få tilgang til datasettene.