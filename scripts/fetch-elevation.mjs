// Télécharge un maillage d'altitudes réelles (EU-DEM 25 m via OpenTopoData) sur la bbox
// de Montfaucon-Montigné et le met en cache dans data/elevation.json.
// L'API publique tolère 100 points par appel et ~1 appel/seconde : on respecte ça.
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'elevation.json');
const BBOX = { south: 47.0765, west: -1.1545, north: 47.1085, east: -1.1065 };
const N = 97;                       // 97 x 97 ≈ 37 m de maille
const DATASET = 'eudem25m';
const FALLBACK = 'srtm30m';

if (existsSync(OUT) && JSON.parse(readFileSync(OUT, 'utf8')).n === N) {
  console.log('→ cache altitudes déjà présent : data/elevation.json');
  process.exit(0);
}
mkdirSync(join(ROOT, 'data'), { recursive: true });

const pts = [];
for (let j = 0; j < N; j++) {
  for (let i = 0; i < N; i++) {
    pts.push([
      BBOX.south + (BBOX.north - BBOX.south) * (j / (N - 1)),
      BBOX.west + (BBOX.east - BBOX.west) * (i / (N - 1)),
    ]);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const grid = new Array(pts.length).fill(null);
const CHUNK = 100;
let dataset = DATASET;

process.stdout.write(`→ altitudes réelles (${DATASET}), ${pts.length} points : `);
for (let s = 0; s < pts.length; s += CHUNK) {
  const slice = pts.slice(s, s + CHUNK);
  const locs = slice.map(([la, lo]) => `${la.toFixed(6)},${lo.toFixed(6)}`).join('|');
  let ok = false;
  for (let attempt = 0; attempt < 4 && !ok; attempt++) {
    try {
      const res = await fetch(`https://api.opentopodata.org/v1/${dataset}?locations=${locs}`);
      if (res.status === 429) { await sleep(2500); continue; }
      const json = await res.json();
      if (json.status !== 'OK') throw new Error(json.error || 'réponse invalide');
      json.results.forEach((r, k) => { grid[s + k] = r.elevation; });
      ok = true;
    } catch (err) {
      if (attempt === 1 && dataset !== FALLBACK) { dataset = FALLBACK; }
      await sleep(1500);
    }
  }
  if (!ok) { console.error(`\n✗ échec sur le lot ${s}`); process.exit(1); }
  process.stdout.write('.');
  await sleep(1100);
}

// Quelques trous possibles (mer/nodata) : on les rebouche par la moyenne des voisins connus.
const known = grid.filter((v) => typeof v === 'number');
const mean = known.reduce((a, b) => a + b, 0) / known.length;
for (let k = 0; k < grid.length; k++) if (typeof grid[k] !== 'number') grid[k] = mean;

writeFileSync(OUT, JSON.stringify({
  dataset, n: N, bbox: BBOX,
  source: 'OpenTopoData / EU-DEM — Copernicus',
  fetched_at: new Date().toISOString(),
  min: Math.min(...grid), max: Math.max(...grid),
  values: grid.map((v) => Math.round(v * 10) / 10),
}));
console.log(`\n✓ altitudes en cache : data/elevation.json (${Math.min(...grid).toFixed(1)} → ${Math.max(...grid).toFixed(1)} m)`);
