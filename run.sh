#!/usr/bin/env bash
# Montfaucon-Montigné en 3D — une seule commande.
#   1. récupère les données OpenStreetMap (Overpass) et le relief, en cache dans ./data
#   2. prépare la scène
#   3. sert la carte sur http://localhost:3002
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-3002}"

command -v node >/dev/null 2>&1 || { echo "✗ Node.js est requis (https://nodejs.org)." >&2; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo "✗ jq est requis (brew install jq / apt install jq)." >&2; exit 1; }

echo "── Données ───────────────────────────────────────────────"
./scripts/fetch-osm.sh
node scripts/fetch-elevation.mjs

if [ ! -s data/scene.json ] \
   || [ scripts/build-scene.mjs -nt data/scene.json ] \
   || [ data/montfaucon-montigne.osm.json -nt data/scene.json ] \
   || [ data/elevation.json -nt data/scene.json ]; then
  echo "── Scène ─────────────────────────────────────────────────"
  node scripts/build-scene.mjs
else
  echo "→ data/scene.json à jour"
fi

echo "── Serveur ───────────────────────────────────────────────"
PORT="$PORT" exec node scripts/serve.mjs
