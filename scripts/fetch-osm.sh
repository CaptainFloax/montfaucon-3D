#!/usr/bin/env bash
# Télécharge les données OpenStreetMap de Montfaucon-Montigné (49230) via l'API Overpass
# et les met en cache dans ./data. Rien n'est retéléchargé si le cache est déjà là.
# Les requêtes sont découpées par thème : un gros "tout-en-un" fait tomber Overpass en 504.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/data"
OUT="$DATA/montfaucon-montigne.osm.json"
RAW="$DATA/raw"
BBOX="47.0765,-1.1545,47.1085,-1.1065"   # sud,ouest,nord,est — ~3.6 km autour du bourg

mkdir -p "$RAW"

if [ -s "$OUT" ]; then
  echo "→ cache OSM déjà présent : data/$(basename "$OUT") ($(wc -c <"$OUT" | tr -d ' ') octets)"
  exit 0
fi

ENDPOINTS=(
  "https://overpass-api.de/api/interpreter"
  "https://overpass.kumi.systems/api/interpreter"
  "https://overpass.osm.ch/api/interpreter"
)

fetch() {  # fetch <nom> <corps de requête>
  local name="$1"
  local body="$2"
  local dest="$RAW/$name.json"
  local tmp="$dest.part"
  if [ -s "$dest" ]; then echo "   · $name (cache)"; return 0; fi
  local q="[out:json][timeout:180];($body);out body geom;"
  for ep in "${ENDPOINTS[@]}"; do
    if curl -sS --fail --max-time 240 -A "MontfauconMontigne3D/1.0 (carte 3D locale)" \
         --data-urlencode "data=$q" -o "$tmp" "$ep" \
       && [ -s "$tmp" ] && grep -q '"elements"' "$tmp"; then
      mv "$tmp" "$dest"
      echo "   · $name ✓ ($(wc -c <"$dest" | tr -d ' ') octets)"
      return 0
    fi
    rm -f "$tmp"
    sleep 2
  done
  echo "   · $name ✗" >&2
  return 1
}

echo "→ téléchargement OSM (Overpass), bbox $BBOX :"

fetch batiments "way[\"building\"]($BBOX);relation[\"building\"]($BBOX);"
fetch voirie    "way[\"highway\"]($BBOX);"
fetch eau       "way[\"waterway\"]($BBOX);way[\"natural\"=\"water\"]($BBOX);relation[\"natural\"=\"water\"]($BBOX);"
fetch paysage   "way[\"landuse\"]($BBOX);way[\"leisure\"]($BBOX);way[\"natural\"~\"^(wood|scrub|heath|grassland|wetland)$\"]($BBOX);"
fetch ouvrages  "way[\"man_made\"]($BBOX);way[\"historic\"]($BBOX);way[\"barrier\"]($BBOX);way[\"amenity\"]($BBOX);"
fetch points    "node[\"historic\"]($BBOX);node[\"amenity\"]($BBOX);node[\"man_made\"]($BBOX);node[\"place\"]($BBOX);node[\"tourism\"]($BBOX);node[\"natural\"=\"tree\"]($BBOX);"

echo "→ fusion des lots…"
jq -s '{
  generator: "overpass (fusion locale)",
  bbox: {south: 47.0765, west: -1.1545, north: 47.1085, east: -1.1065},
  fetched_at: "'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'",
  copyright: "© les contributeurs OpenStreetMap — ODbL",
  elements: (map(.elements) | add | unique_by((.type) + "/" + (.id|tostring)))
}' "$RAW"/*.json > "$OUT"

echo "✓ OSM en cache : data/$(basename "$OUT") — $(jq '.elements|length' "$OUT") éléments"
