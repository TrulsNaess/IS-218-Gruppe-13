#!/usr/bin/env bash
set -euo pipefail

# Import skred.geojson into Supabase/PostGIS using ogr2ogr (GDAL)
# Usage:
#   export PG_CONN='host=<host> user=<user> dbname=<db> password=<pw> port=5432 sslmode=require'
#   ./scripts/import_skred.sh
#
# Alternatively set PG_CONN as a libpq URI (with sslmode=require):
#   export PG_CONN='postgres://user:password@host:5432/dbname?sslmode=require'

GEOJSON_PATH="webkart-IS218/data/skred.geojson"
TABLE_NAME="public.skred_zones"

if [ -z "${PG_CONN:-}" ]; then
  echo "ERROR: PG_CONN not set. Export PG_CONN before running. See header in this script for examples."
  exit 2
fi

echo "Importing $GEOJSON_PATH into $TABLE_NAME"

# Use PROMOTE_TO_MULTI to avoid geometry type conflicts; assign source SRS and
# ensure destination SRS is EPSG:4326.
# -a_srs sets/assigns the SRS of the source data (if missing). -t_srs forces
# reprojection to the destination SRS in the database.
ogr2ogr -f "PostgreSQL" PG:"$PG_CONN" "$GEOJSON_PATH" \
  -nln "$TABLE_NAME" -nlt PROMOTE_TO_MULTI -lco GEOMETRY_NAME=geom -s_srs EPSG:4326 -t_srs EPSG:4326

echo "Import finished. Run the following in Supabase SQL Editor to create an index and verify:"
echo "  CREATE INDEX IF NOT EXISTS skred_geom_idx ON public.skred_zones USING GIST (geom);"
echo "  SELECT count(*) FROM public.skred_zones;"
echo "  SELECT distinct ST_SRID(geom) FROM public.skred_zones;"
