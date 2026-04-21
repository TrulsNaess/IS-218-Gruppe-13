# Oppgave 2 – GIScience og KI

## Endringer siden Canvas-innlevering
Ingen endringer. Mappestrukturen ble reorganisert for å strukturere semesteroppgaven bedre.

## Del A: Romlig analyse med GeoJSON

### Beskrivelse
Utvidelse av webkartet fra Oppgave 1 med funksjonalitet for romlig filtrering. Brukeren kan nå:
- **SHIFT+klikk** på kartet for å finne alle punkter (f.eks. skredhendelser) innenfor en 30 km radius
- Endre radiusen med slider-kontroll
- Se sirkel tegnet på kartet som visuell indikator for søkeområdet
- **Dobbelklikk** for å resette filteret

### Teknisk implementasjon
- Bruk av Turf.js bibliotek for geometriske beregninger på klientside
- Dynamisk lagfiltrering basert på avstand
- Responsiv UI med radius-slider

## Del B: Spatial Database (Supabase + PostGIS)

### Beskrivelse av romlig utvidelsen
Implementering av spatial queries i en PostgreSQL+PostGIS database via Supabase. Brukeren kan klikke på kartet for å hente alle features innenfor en valgfri radius fra en cloud-database.

### Demo av system
Se [GitHub releases](https://github.com/) for video-demo.

### SQL-funksjon
SQL-funksjonen lagret i Supabase for å hente alle punkter innenfor valgt radius:

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

### Innhold i mappen
- **`sql/Sql_spørringene.sql`** – SQL-scripts for database-setup
- **`scripts/import_skred.sh`** – GDAL/Ogr2Ogr script for dataimport
- **`scripts/test_rpc.sh`** – Test av Supabase RPC-funktioner
- **`Oppgave 2/`** – Notebooks for GIScience-analyse og KI-eksperimenter
- **`Oppgave2_218.ipynb`** – Python notebook med analyse

## Referanser
- Leaflet: https://leafletjs.com/
- Leaflet Draw: https://github.com/Leaflet/Leaflet.draw
- Turf.js: https://turfjs.org/
- Supabase: https://supabase.com/
- PostGIS: https://postgis.net/
