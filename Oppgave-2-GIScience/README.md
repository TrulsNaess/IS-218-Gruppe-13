# Oppgave 2 – GIScience og KI

> ## Endringer siden Canvas-innlevering
> - Notebook-guiden er samlet i denne README-filen.
> - Separat `README-OPPGAVE2.md` er fjernet for å holde alt samlet i én fil.
> - Video/demo er ikke inkludert i denne README.

## Innhold i mappen
- `Oppgave 2/Oppgave2_218.ipynb` – Python-notebook for GIScience-analyse
- `sql/Sql_spørringene.sql` – SQL-scripts for database-setup
- `scripts/import_skred.sh` – Importscript for skreddatasett
- `scripts/test_rpc.sh` – Test av Supabase RPC-funksjoner

## Del A: Romlig analyse med GeoJSON

### Beskrivelse
Utvidelse av webkartet fra Oppgave 1 med funksjonalitet for romlig filtrering. Brukeren kan nå:
- **SHIFT+klikk** på kartet for å finne alle punkter (f.eks. skredhendelser) innenfor en 30 km radius
- Endre radius med slider-kontroll
- Se sirkel tegnet på kartet som visuell indikator for søkeområdet
- **Dobbelklikk** for å resette filteret

### Teknisk implementasjon
- Bruk av Turf.js for geometriske beregninger på klientside
- Dynamisk lagfiltrering basert på avstand
- Responsiv UI med radius-slider

## Del B: Spatial Database (Supabase + PostGIS)

### Beskrivelse
Implementering av spatial queries i Supabase/PostGIS. Brukeren kan klikke på kartet for å hente alle features innenfor en valgfri radius fra en database.

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

## Notebook-guide

Først må du åpne Google Colab-lenken vår:

https://colab.research.google.com/drive/1ey9-2yTEjBSCmVt0VilnBpcoaWCjtvnt?usp=sharing

### Viktig
Notebooks og data er skrevet for å hente datasettene fra Google Drive. Les delen "Koble til Google Drive" i notebooken for steg-for-steg veiledning.

## Referanser
- Leaflet: https://leafletjs.com/
- Leaflet Draw: https://github.com/Leaflet/Leaflet.draw
- Turf.js: https://turfjs.org/
- Supabase: https://supabase.com/
- PostGIS: https://postgis.net/
