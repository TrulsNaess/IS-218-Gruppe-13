#!/usr/bin/env bash
set -euo pipefail

# Test script for calling Supabase RPC get_features_within via REST.
# Usage:
#   export SUPABASE_URL='https://<project-ref>.supabase.co'
#   export SUPABASE_ANON_KEY='your-anon-key'
#   ./scripts/test_rpc.sh <lat> <lon> <radius_m>

if [ "$#" -ne 3 ]; then
  echo "Usage: $0 <lat> <lon> <radius_m>"
  exit 2
fi

LAT=$1
LON=$2
RADIUS=$3

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_ANON_KEY:-}" ]; then
  echo "Export SUPABASE_URL and SUPABASE_ANON_KEY before running."
  exit 3
fi

ENDPOINT="$SUPABASE_URL/rest/v1/rpc/get_features_within"

curl -s -X POST "$ENDPOINT" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{ \"lat_in\": $LAT, \"lon_in\": $LON, \"radius_m_in\": $RADIUS }"

echo
