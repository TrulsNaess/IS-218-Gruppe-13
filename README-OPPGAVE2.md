## Oppgave 2: Romlig utvidelse

### Beskrivelse av utvidelsen
Vi har lagt til en funksjon i webkartet som lar brukeren finne alle punkter (f.eks. skredhendelser) innenfor en valgfri radius fra et valgt punkt. Radiusen kan endres av brukeren, for eksempel til 30 km, og resultatene oppdateres dynamisk i kartet. Dette gir mulighet for å utforske geografiske sammenhenger og risiko i et område.

### Demo av system
![Demonstrasjon av webkartet](webkartGIF.gif)

### SQL-snippet
Her er SQL-funksjonen som er lagret i Supabase og brukes til å hente alle punkter innenfor valgt radius (kan endres, f.eks. 30 000 meter):

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


### Notebook-guide
*Legg inn link til notebook her når den er klar.*
