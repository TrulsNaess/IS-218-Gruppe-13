-- SQL helper for Supabase / PostGIS
-- Paste the contents of this file into Supabase SQL Editor (or run with psql)
-- Adjust table name if you imported your GeoJSON into a different table.

-- 1) Create FeatureCollection-returning RPC function
-- This returns a jsonb FeatureCollection which is convenient to add
-- directly to a Leaflet L.geoJSON layer on the client.
-- Returns a GeoJSON FeatureCollection and includes a computed
-- distance (meters) in each feature's properties as `distance_m`.
create or replace function public.get_features_within(
  lat_in double precision,
  lon_in double precision,
  radius_m_in integer
)
returns jsonb
language sql stable as $$
  with q as (
    select
      -- do not assume a particular id column exists; keep properties generic
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

-- 2) Optional: row-returning RPC if you prefer to handle geometry on client
create or replace function public.get_features_within_rows(
  lat_in double precision,
  lon_in double precision,
  radius_m_in integer
)
returns table (properties jsonb, geometry jsonb, distance_m double precision)
language sql stable as $$
  select
    to_jsonb(t) - 'geom' as properties,
    ST_AsGeoJSON(t.geom)::jsonb as geometry,
    ST_Distance(t.geom::geography, ST_SetSRID(ST_MakePoint(lon_in, lat_in), 4326)::geography) as distance_m
  from public.skred_zones t
  where ST_DWithin(
    t.geom::geography,
    ST_SetSRID(ST_MakePoint(lon_in, lat_in), 4326)::geography,
    radius_m_in
  );
$$;

-- 3) Spatial index (run once after import)
-- Creates a GiST index on geom to speed up ST_DWithin queries
create index if not exists skred_geom_idx on public.skred_zones using gist (geom);

-- 4) Quick checks
-- Verify there are rows
-- select count(*) from public.skred_zones;

-- Verify SRID is 4326 for geometries
-- select distinct ST_SRID(geom) from public.skred_zones;

-- Example test call (replace with coordinates near your data):
-- select public.get_features_within(59.2, 9.6, 30000);
-- Example: include distance
-- select public.get_features_within_rows(59.2, 9.6, 30000);

-- 5) Convenience overload: accept numeric inputs (avoids need for casts from some clients)
create or replace function public.get_features_within(
  lat_in numeric,
  lon_in numeric,
  radius_m_in integer
)
returns jsonb
language sql stable as $$
  select public.get_features_within(lat_in::double precision, lon_in::double precision, radius_m_in);
$$;
