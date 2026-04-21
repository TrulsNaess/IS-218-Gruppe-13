# Oppgave 3 – Prosjektskisse for Semesterprosjekt

## Problemstilling
**Hvordan kan en kartløsning visualisere kriseområder og veilede innbyggere til trygge tilfluktsrom?**

## Kontekst
Vi har valgt å beholde vårt innspissede tema fra oppgave 2 inn i semesteroppgaven. Temaet faller under *totalforsvaret*, nærmere bestemt: **Sivil beredskap og evakuering**.

## Kort prosjektbeskrivelse
Idéen er basert på verdens usikre fremtid knyttet til krig og problemer som kan komme av akutte kriser. Vi skal lage en webapplikasjon hvor:

1. Brukeren markerer et område som et **kriseområde** (polygon eller sirkel)
2. Systemet **genererer ruter** fra utkantene av kriseområdet til nærmeste tilfluktsrom
3. Visning av **kapasitets-data** for tilfluktsrommene

## Datasett og kilder
De fleste datasettene er allerede brukt i oppgave 1 og 2, lokalisert til Agder:

- `vegnett_agder.geojson.gpkg` – Vegnett for ruting
- `Samfunnssikkerhet_42_Agder_25832_TilfluktsromOffentlige_GML.gml` – Offentlige tilfluktsrom
- Befolkningsdata (valgfritt)
- GeoJSON-datasett fra tidligere oppgaver

## Teknologi og verktøy

| Verktøy | Formål |
|---------|--------|
| **Leaflet Webkart** | Interaktiv kartvisning |
| **Supabase/PostgreSQL** | Database med PostGIS extension |
| **GeoJSON, GML** | Dataformat |
| **HTML, CSS, JS** | Frontend |
| **GitHub** | Versjonskontroll |
| **VSCode** | Utviklingsmiljø |
| **Python** | Lokal webserver, analyse (Pandas, GeoPandas) |
| **GDAL/Ogr2Ogr** | Dataimport til database |
| **OSRM / Mapbox Directions** | Routingberegninger |

## Forventet resultat
En enkel, men funksjonell webapplikasjon som:

✅ Visualiserer kriseområder og tilfluktsrom på interaktivt kart  
✅ Lar brukeren markere et område som en krisesone  
✅ Beregner og viser ruter til nærmeste tilgjengelige tilfluktsrom  
✅ Presenterer informasjon som: kapasitet, avstand, alternative tilfluktsrom  
✅ Bruker popups og kartmarkeringer for intuitiv navigasjon  

## Gruppedeltagere
- Emil André Johansen Haraldsø
- Herman Berge Hansen
- Herman Lonkemoen Haraldsen
- Preben Jensen
- Truls Næss
