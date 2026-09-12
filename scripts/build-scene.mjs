// Préprocesseur : OSM brut + MNT → data/scene.json, prêt à charger dans le navigateur.
// Tout ce qui est coûteux (projection, MNT, creusement de la vallée, classement des
// bâtiments, teintes) est calculé ici une fois pour toutes.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeProjector, centroid, minAreaRect, polyArea, resample, smoothPath,
  chainWays, hash01, segLen, pointInRing, signedArea,
} from './lib/geo.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const osm = JSON.parse(readFileSync(join(ROOT, 'data', 'montfaucon-montigne.osm.json'), 'utf8'));
const dem = JSON.parse(readFileSync(join(ROOT, 'data', 'elevation.json'), 'utf8'));

const BBOX = dem.bbox;
const ORIGIN = { lat: (BBOX.south + BBOX.north) / 2, lon: (BBOX.west + BBOX.east) / 2 };
const project = makeProjector(ORIGIN.lat, ORIGIN.lon);
const [x0, z0] = project(BBOX.south, BBOX.west);
const [x1, z1] = project(BBOX.north, BBOX.east);
const WORLD = { w: Math.abs(x1 - x0), h: Math.abs(z1 - z0) };
console.log(`→ emprise : ${WORLD.w.toFixed(0)} × ${WORLD.h.toFixed(0)} m, origine ${ORIGIN.lat}, ${ORIGIN.lon}`);

/* ---------------------------------------------------------------- MNT ---- */
// Le relief réel va de 29 m à 106 m NGF sur 3,6 km : à l'échelle 1:1 la vallée
// s'aplatit à l'écran. On amplifie donc l'altitude — depuis le niveau de la mer,
// pas depuis un minimum local, pour que « deux fois plus haut » garde un sens.
// Les hauteurs bâties, elles, restent à l'échelle 1:1.
const EXAGERATION = 2.15;
const TN = 193;                                   // maille finale (~19 m)
const sampleDem = (x, z) => {                      // bilinéaire sur la grille brute 97²
  const n = dem.n;
  const u = ((x + WORLD.w / 2) / WORLD.w) * (n - 1);
  const v = ((WORLD.h / 2 - z) / WORLD.h) * (n - 1);   // v = index sud→nord
  const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
  const j = Math.min(n - 2, Math.max(0, Math.floor(v)));
  const fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j));
  const g = (ii, jj) => dem.values[jj * n + ii];
  return (
    g(i, j) * (1 - fu) * (1 - fv) + g(i + 1, j) * fu * (1 - fv) +
    g(i, j + 1) * (1 - fu) * fv + g(i + 1, j + 1) * fu * fv
  ) * EXAGERATION;
};

const H = new Float64Array(TN * TN);
const gx = (i) => -WORLD.w / 2 + (WORLD.w * i) / (TN - 1);
const gz = (j) => WORLD.h / 2 - (WORLD.h * j) / (TN - 1);
for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) H[j * TN + i] = sampleDem(gx(i), gz(j));

/* ------------------------------------------------- extraction OSM ---- */
const els = osm.elements;
const geo = (e) => (e.geometry || []).filter((p) => p && p.lat !== undefined).map((p) => project(p.lat, p.lon));
const byId = new Map(els.map((e) => [`${e.type}/${e.id}`, e]));
const closeRing = (r) => {
  const out = r.slice();
  if (out.length > 1) {
    const a = out[0], b = out[out.length - 1];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.2) out.pop();
  }
  return out;
};

/* ------------------------------------------------------- rivière ---- */
const moineWays = els.filter((e) => e.tags?.waterway === 'river' && e.tags?.name === 'La Moine').map(geo);
let moine = chainWays(moineWays, 12)[0] || [];
moine = smoothPath(resample(moine, 14), 3);
// orientation : la Moine descend vers l'aval, on ordonne du plus haut au plus bas
if (sampleDem(...moine[0]) < sampleDem(...moine[moine.length - 1])) moine.reverse();

// lit : minimum courant vers l'aval, puis lissage → profil strictement descendant
const bed = moine.map((p) => sampleDem(p[0], p[1]));
for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1]);
for (let k = 0; k < 8; k++) {
  for (let i = 1; i < bed.length - 1; i++) bed[i] = (bed[i - 1] + 2 * bed[i] + bed[i + 1]) / 4;
  for (let i = 1; i < bed.length; i++) bed[i] = Math.min(bed[i], bed[i - 1] - 0.004);
}
const bedFloor = bed.map((b) => b - 1.7 * EXAGERATION);
const waterLevel = bed.map((b) => b - 0.55 * EXAGERATION);

// index spatial pour retrouver vite le point de rivière le plus proche
const CELL = 120;
const buckets = new Map();
const key = (x, z) => `${Math.floor(x / CELL)}|${Math.floor(z / CELL)}`;
moine.forEach((p, i) => {
  const k = key(p[0], p[1]);
  if (!buckets.has(k)) buckets.set(k, []);
  buckets.get(k).push(i);
});
function nearestRiver(x, z) {
  const ci = Math.floor(x / CELL), cj = Math.floor(z / CELL);
  let best = -1, bd = Infinity;
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    const list = buckets.get(`${ci + a}|${cj + b}`);
    if (!list) continue;
    for (const i of list) {
      const d = (moine[i][0] - x) ** 2 + (moine[i][1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  }
  if (best < 0) {                                   // repli : balayage complet (rare)
    for (let i = 0; i < moine.length; i += 3) {
      const d = (moine[i][0] - x) ** 2 + (moine[i][1] - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  }
  return { i: best, d: Math.sqrt(bd) };
}

// creusement de la vallée : on abaisse, jamais on ne remonte
for (let j = 0; j < TN; j++) for (let i = 0; i < TN; i++) {
  const x = gx(i), z = gz(j);
  const { i: ri, d } = nearestRiver(x, z);
  if (ri < 0 || d > 95) continue;
  const t = Math.min(1, Math.max(0, (d - 10) / 72));
  const s = t * t * (3 - 2 * t);
  const floor = bedFloor[ri];
  const k = j * TN + i;
  H[k] = Math.min(H[k], floor + s * Math.max(0, H[k] - floor));
}

/* --------------------------------------------- aplanissement foire ---- */
// L'aire de la Prée Saint-Maurice : le pré de bord de Moine, juste en aval du pont
// de Moine — c'est là que se dresse la fête foraine de la Saint-Maurice.
// Le point est choisi pour son dégagement (~46 m sans bâti), à 60 m du lit et
// ~2 m au-dessus du fil de l'eau.
// IMPORTANT : on ne retouche pas le relief pour l'installer. Un aplanissement,
// même progressif, relèverait le fond de vallée et barrerait la Moine ; les
// manèges et les tréteaux se posent donc sur le pré tel qu'il est.
const FAIR = project(47.097882, -1.125858);

// lissage final léger (le MNT 25 m est un peu granuleux)
for (let pass = 0; pass < 2; pass++) {
  const C = H.slice();
  for (let j = 1; j < TN - 1; j++) for (let i = 1; i < TN - 1; i++) {
    H[j * TN + i] = (C[j * TN + i] * 4 + C[j * TN + i - 1] + C[j * TN + i + 1] +
      C[(j - 1) * TN + i] + C[(j + 1) * TN + i]) / 8;
  }
}

const terrainAt = (x, z) => {
  const u = ((x + WORLD.w / 2) / WORLD.w) * (TN - 1);
  const v = ((WORLD.h / 2 - z) / WORLD.h) * (TN - 1);
  const i = Math.min(TN - 2, Math.max(0, Math.floor(u)));
  const j = Math.min(TN - 2, Math.max(0, Math.floor(v)));
  const fu = Math.min(1, Math.max(0, u - i)), fv = Math.min(1, Math.max(0, v - j));
  const g = (ii, jj) => H[jj * TN + ii];
  return g(i, j) * (1 - fu) * (1 - fv) + g(i + 1, j) * fu * (1 - fv) +
    g(i, j + 1) * (1 - fu) * fv + g(i + 1, j + 1) * fu * fv;
};

console.log(`→ MNT ${TN}² prêt (${Math.min(...H).toFixed(1)} → ${Math.max(...H).toFixed(1)} m), vallée creusée sur ${moine.length} points`);

/* --------------------------------------------------- bâtiments ---- */
// Les deux noyaux anciens : c'est là que l'on met les teintes pierre de taille.
const CORES = [
  { c: project(47.10035, -1.12705), r: 330 },   // bourg de Montfaucon-sur-Moine
  { c: project(47.08487, -1.13766), r: 260 },   // bourg de Montigné-sur-Moine
];
const inCore = (x, z) => CORES.some((k) => Math.hypot(x - k.c[0], z - k.c[1]) < k.r);

// Pierre de taille / tuffeau du centre-bourg : crème chaud, à peine ambré.
const PIERRE = [0xf1e7d0, 0xece0c6, 0xf5eeda, 0xe8dcc0, 0xf0e5cb, 0xebdfc5, 0xf3ead6];
// Enduits des faubourgs : crème plus froid, très clair.
const ENDUIT = [0xf7f2e5, 0xf2ebdb, 0xefe8d7, 0xf9f4ea, 0xece5d3, 0xf4eddf];
// Granges et dépendances : crème patiné.
const FERME = [0xe9e0c9, 0xe1d7bf, 0xefe7d3, 0xe4dbc4];
const ARDOISE = [0x4b515a, 0x434a53, 0x555d67, 0x3f454e, 0x50575f];
const TUILE = [0x9d6a4e, 0xa87451, 0x925f44, 0xa26c4d];

const buildings = [];
for (const e of els) {
  const t = e.tags; if (!t?.building || t.building === 'no') continue;
  let ring = closeRing(geo(e));
  if (ring.length < 3) continue;
  if (signedArea(ring) < 0) ring = ring.reverse();
  const area = polyArea(ring);
  if (area < 6) continue;
  const c = centroid(ring);
  if (Math.abs(c[0]) > WORLD.w / 2 - 5 || Math.abs(c[1]) > WORLD.h / 2 - 5) continue;

  const rect = minAreaRect(ring);
  const rectangularity = area / Math.max(1, rect.area);
  const core = inCore(c[0], c[1]);
  const h01 = hash01(e.id);
  const b = t.building;
  const isChurch = b === 'church' || b === 'cathedral' || t.amenity === 'place_of_worship';
  const isChapel = b === 'chapel';
  const isOut = ['shed', 'garage', 'garages', 'carport', 'hut', 'roof', 'greenhouse'].includes(b);
  const isFarm = ['barn', 'farm_auxiliary', 'stable', 'cowshed', 'farm'].includes(b);
  const isBig = ['industrial', 'commercial', 'retail', 'warehouse', 'school', 'public', 'civic', 'sports_hall'].includes(b);

  let h;
  const lv = parseFloat(t['building:levels']);
  if (Number.isFinite(lv) && lv > 0) h = lv * 2.95 + 1.1;
  else if (isChurch) h = 12.5;
  else if (isChapel) h = 7.0;
  else if (isOut || area < 26) h = 2.5 + h01 * 0.5;
  else if (isFarm) h = 4.8 + h01 * 1.4;
  else if (isBig) h = 6.5 + h01 * 2.2;
  else if (area < 58) h = 3.3 + h01 * 0.8;
  else if (core) h = 6.1 + h01 * 1.9;
  else h = 4.7 + h01 * 1.5;

  // toiture : deux-pentes si le bâtiment est franchement rectangulaire, sinon croupe basse
  let rt = 0, rh = 0;
  const minSide = Math.min(rect.w, rect.d);
  if (isChurch || isChapel) { rt = 0; rh = Math.min(5.5, minSide * 0.6); }
  else if (rectangularity > 0.78) { rt = 0; rh = Math.min(4.4, minSide * 0.46); }
  else if (rectangularity > 0.58) { rt = 1; rh = Math.min(3.2, minSide * 0.34); }
  else { rt = 2; rh = 0.45; }
  if (isBig && !isChurch) { rt = rectangularity > 0.8 ? 1 : 2; rh = Math.min(2.6, minSide * 0.18); }

  const pal = isChurch || isChapel ? [0xf2e9d3, 0xece2c9] : isFarm || isOut ? FERME : core ? PIERRE : ENDUIT;
  const wc = pal[Math.floor(hash01(e.id * 7 + 1) * pal.length) % pal.length];
  const slate = core ? hash01(e.id * 13 + 5) < 0.94 : hash01(e.id * 13 + 5) < 0.83;
  const rc = slate ? ARDOISE[Math.floor(hash01(e.id * 3 + 9) * ARDOISE.length)]
    : TUILE[Math.floor(hash01(e.id * 3 + 9) * TUILE.length)];

  // assise : on prend le point le plus bas du contour et on prolonge les murs vers le bas
  let lo = Infinity, hi = -Infinity;
  for (const [px, pz] of ring) { const y = terrainAt(px, pz); if (y < lo) lo = y; if (y > hi) hi = y; }
  const yc = terrainAt(c[0], c[1]);
  lo = Math.min(lo, yc); hi = Math.max(hi, yc);

  buildings.push({
    r: ring.map(([px, pz]) => [+px.toFixed(2), +pz.toFixed(2)]),
    b: +lo.toFixed(2), sk: +(hi - lo + 2.2).toFixed(2), h: +h.toFixed(2),
    rt, rh: +rh.toFixed(2),
    o: [+rect.cx.toFixed(2), +rect.cz.toFixed(2), +rect.w.toFixed(2), +rect.d.toFixed(2), +rect.angle.toFixed(4)],
    wc, rc,
    f: (core ? 1 : 0) | (isChurch ? 2 : 0) | (isChapel ? 4 : 0) | (isOut || isFarm ? 8 : 0),
    n: t.name || undefined,
    id: e.id,
  });
}
console.log(`→ ${buildings.length} bâtiments (dont ${buildings.filter((b) => b.f & 1).length} en centre-bourg)`);

/* -------------------------------------------------------- voirie ---- */
const ROADW = {
  motorway: 10, trunk: 9, primary: 8.5, secondary: 7.4, tertiary: 6.2, unclassified: 5,
  residential: 4.8, living_street: 4.4, pedestrian: 4.2, service: 3.4, track: 3,
  footway: 1.7, path: 1.6, cycleway: 2, bridleway: 1.6,
};
const roads = [];
for (const e of els) {
  const t = e.tags; if (!t?.highway) continue;
  const w = ROADW[t.highway]; if (!w) continue;
  let pts = geo(e); if (pts.length < 2) continue;
  pts = resample(pts, 9);
  roads.push({
    p: pts.map(([px, pz]) => [+px.toFixed(2), +pz.toFixed(2)]),
    w, k: t.highway, n: t.name || undefined,
    br: t.bridge ? 1 : 0,
  });
}
console.log(`→ ${roads.length} tronçons de voirie`);

/* ---------------------------------------------------------- eau ---- */
const water = [];
for (const e of els) {
  const t = e.tags; if (!t) continue;
  const isWater = t.natural === 'water' || t.landuse === 'basin' || t.water;
  if (!isWater) continue;
  let ring = closeRing(geo(e));
  if (ring.length < 3) continue;
  if (signedArea(ring) < 0) ring = ring.reverse();
  if (polyArea(ring) < 25) continue;
  const c = centroid(ring);
  const near = nearestRiver(c[0], c[1]);
  const riverine = near.i >= 0 && near.d < 150;
  const ys = ring.map(([px, pz]) => {
    if (riverine) { const n = nearestRiver(px, pz); return waterLevel[n.i >= 0 ? n.i : near.i]; }
    return terrainAt(px, pz) - 0.35;
  });
  const flat = riverine ? null : Math.min(...ys);
  water.push({
    r: ring.map(([px, pz], k) => [+px.toFixed(2), +pz.toFixed(2), +(flat ?? ys[k]).toFixed(2)]),
    k: riverine ? 'river' : (t.water || t.landuse || 'pond'),
  });
}
console.log(`→ ${water.length} plans d'eau`);

/* --------------------------------------------------- occupation ---- */
const LAND_KEEP = new Set(['farmland', 'meadow', 'forest', 'vineyard', 'orchard', 'residential',
  'grass', 'cemetery', 'allotments', 'brownfield', 'village_green', 'greenhouse_horticulture']);
const land = [];
for (const e of els) {
  const t = e.tags; if (!t) continue;
  let k = null;
  if (t.landuse && LAND_KEEP.has(t.landuse)) k = t.landuse;
  else if (t.natural === 'wood') k = 'forest';
  else if (t.natural === 'scrub' || t.natural === 'heath') k = 'scrub';
  else if (t.leisure === 'pitch' || t.leisure === 'track') k = 'pitch';
  else if (t.leisure === 'garden' || t.leisure === 'park') k = 'grass';
  if (!k) continue;
  let ring = closeRing(geo(e));
  if (ring.length < 3) continue;
  if (signedArea(ring) < 0) ring = ring.reverse();
  if (polyArea(ring) < 120) continue;
  const rect = minAreaRect(ring);
  land.push({
    r: ring.map(([px, pz]) => [+px.toFixed(1), +pz.toFixed(1)]),
    k, a: +(rect.w >= rect.d ? rect.angle : rect.angle + Math.PI / 2).toFixed(3),
  });
}
console.log(`→ ${land.length} zones d'occupation du sol`);

/* ------------------------------------------------------- altitudes voirie ---- */
for (const r of roads) {
  const ys = r.p.map(([px, pz]) => terrainAt(px, pz));
  if (r.br) {
    const nr = r.p.map(([px, pz]) => nearestRiver(px, pz));
    const overWater = nr.some((n) => n.i >= 0 && n.d < 45);
    let deck = Math.max(ys[0], ys[ys.length - 1]);
    if (overWater) {
      const wl = Math.max(...nr.filter((n) => n.i >= 0).map((n) => waterLevel[n.i]));
      deck = Math.max(deck, wl + 4.3);
    }
    for (let i = 0; i < ys.length; i++) ys[i] = Math.max(ys[i], deck);
    r.deck = +deck.toFixed(2);
  }
  r.y = ys.map((v) => +(v + 0.14).toFixed(2));
}

/* ------------------------------------------------------------ arbres ---- */
const trees = [];
const rngSeeded = (s) => { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
const buildGrid = new Map();
for (const b of buildings) {
  const c = centroid(b.r);
  const k = `${Math.floor(c[0] / 60)}|${Math.floor(c[1] / 60)}`;
  if (!buildGrid.has(k)) buildGrid.set(k, []);
  buildGrid.get(k).push(c);
}
const nearBuilding = (x, z, d) => {
  const ci = Math.floor(x / 60), cj = Math.floor(z / 60);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    for (const c of buildGrid.get(`${ci + a}|${cj + b}`) || []) if (Math.hypot(c[0] - x, c[1] - z) < d) return true;
  }
  return false;
};

// 1. arbres cartographiés
for (const e of els) if (e.tags?.natural === 'tree' && e.lat) {
  const [x, z] = project(e.lat, e.lon);
  trees.push([x, z, 0, 1.15]);
}
// 2. boisements
for (const l of land) {
  if (!['forest', 'scrub'].includes(l.k)) continue;
  const a = polyArea(l.r);
  const rnd = rngSeeded(Math.round(a * 1000) + l.r.length);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of l.r) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const want = Math.min(1400, Math.floor(a / (l.k === 'scrub' ? 130 : 85)));
  for (let n = 0, guard = 0; n < want && guard < want * 9; guard++) {
    const x = minX + rnd() * (maxX - minX), z = minZ + rnd() * (maxZ - minZ);
    if (!pointInRing(x, z, l.r)) continue;
    n++;
    trees.push([x, z, l.k === 'scrub' ? 2 : (rnd() < 0.2 ? 1 : 0), 0.75 + rnd() * 0.6]);
  }
}
// 3. haies du bocage, le long des limites de parcelles
let hedges = 0;
for (const l of land) {
  if (!['farmland', 'meadow', 'vineyard', 'orchard'].includes(l.k)) continue;
  if (hedges > 5200) break;
  const ring = resample(l.r.concat([l.r[0]]), 15);
  const rnd = rngSeeded(ring.length * 977 + Math.round(Math.abs(ring[0][0])));
  for (const [x, z] of ring) {
    if (rnd() > 0.52) continue;
    if (Math.abs(x) > WORLD.w / 2 - 20 || Math.abs(z) > WORLD.h / 2 - 20) continue;
    if (nearBuilding(x, z, 16)) continue;
    const n = nearestRiver(x, z);
    if (n.i >= 0 && n.d < 14) continue;
    trees.push([x + (rnd() - 0.5) * 4, z + (rnd() - 0.5) * 4, rnd() < 0.25 ? 2 : 0, 0.6 + rnd() * 0.55]);
    hedges++;
  }
}
// 4. alignements de vigne / vergers → petits buissons réguliers
for (const l of land) {
  if (!['vineyard', 'orchard'].includes(l.k)) continue;
  const rnd = rngSeeded(l.r.length * 31 + 7);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of l.r) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  for (let x = minX; x < maxX; x += l.k === 'vineyard' ? 9 : 12) {
    for (let z = minZ; z < maxZ; z += l.k === 'vineyard' ? 3.4 : 12) {
      if (!pointInRing(x, z, l.r)) continue;
      trees.push([x, z, l.k === 'vineyard' ? 3 : 0, l.k === 'vineyard' ? 1 : 0.55 + rnd() * 0.2]);
    }
  }
}
const TREE_CAP = 16000;
if (trees.length > TREE_CAP) trees.length = TREE_CAP;
for (const t of trees) { t[0] = +t[0].toFixed(1); t[1] = +t[1].toFixed(1); t[3] = +t[3].toFixed(2); }
console.log(`→ ${trees.length} arbres / haies / ceps`);

/* -------------------------------------------------------- repères ---- */
const findWay = (id) => els.find((e) => e.type === 'way' && e.id === id);
const wayCentroid = (id) => { const w = findWay(id); return w ? centroid(closeRing(geo(w))) : null; };
const nodeAt = (id) => { const n = els.find((e) => e.type === 'node' && e.id === id); return n ? project(n.lat, n.lon) : null; };

// pont de Moine : la rue Louis Monnier franchit la Moine au pied du bourg
const bridgeWay = findWay(97416477);
const bp = geo(bridgeWay);
const bridgeRoad = roads.find((r) => r.br && r.n === 'Rue Louis Monnier');
const bridgeMidRiver = nearestRiver((bp[0][0] + bp[1][0]) / 2, (bp[0][1] + bp[1][1]) / 2);
const bridge = {
  a: bp[0].map((v) => +v.toFixed(2)),
  b: bp[bp.length - 1].map((v) => +v.toFixed(2)),
  deck: +(bridgeRoad?.deck ?? (waterLevel[bridgeMidRiver.i] + 4.3)).toFixed(2),
  water: +waterLevel[bridgeMidRiver.i].toFixed(2),
};

// moulins de Montigné : sur la Moine, au droit de la rue des Vieux Moulins
const millAnchor = project(47.09715, -1.12835);
const mi = nearestRiver(millAnchor[0], millAnchor[1]).i;
const mills = [];
for (const off of [0, -11]) {
  const i = Math.max(2, Math.min(moine.length - 3, mi + off));
  const p = moine[i], q = moine[i + 1] || moine[i - 1];
  const dx = q[0] - p[0], dz = q[1] - p[1];
  const L = Math.hypot(dx, dz) || 1;
  const nx = -dz / L, nz = dx / L;               // normale à la rivière
  const side = off === 0 ? 1 : -1;
  mills.push({
    x: +(p[0] + nx * 13 * side).toFixed(2),
    z: +(p[1] + nz * 13 * side).toFixed(2),
    a: +Math.atan2(dx, dz).toFixed(4),
    side,
    water: +waterLevel[i].toFixed(2),
    ground: +Math.max(terrainAt(p[0] + nx * 13 * side, p[1] + nz * 13 * side), waterLevel[i] + 0.4).toFixed(2),
    weir: off === 0,
  });
}

const chapel = wayCentroid(98496442) || project(47.1002928, -1.1229);
// la motte est cernée par le bâti ancien : on la recale sur le meilleur dégagement proche
const motteRaw = nodeAt(4011553256) || project(47.1009505, -1.1281552);
const motte = [motteRaw[0] - 5, motteRaw[1] - 5];
const motteClear = (() => {
  let m = 40;
  for (const b of buildings) { const c = centroid(b.r); m = Math.min(m, Math.hypot(c[0] - motte[0], c[1] - motte[1])); }
  return Math.max(13, Math.min(26, m - 2));
})();
const stJacques = wayCentroid(98496790);
const stMartin = wayCentroid(614947576);
const mairie = wayCentroid(614948110);

const L = (id, name, p, y, sub, view) => ({
  id, name, x: +p[0].toFixed(2), z: +p[1].toFixed(2), y: +y.toFixed(2), sub,
  view: view || { dist: 190, phi: 1.05, theta: 0.8 },
});
const landmarks = [
  L('chapelle-saint-jean', 'Chapelle Saint-Jean', chapel, terrainAt(...chapel),
    'Chapelle rurale du Bois Buteau, rue Basse Saint-Jean — clocher-mur et toit d’ardoise.',
    { dist: 120, phi: 1.15, theta: -0.6 }),
  L('pont-de-moine', 'Pont de Moine', [(bridge.a[0] + bridge.b[0]) / 2, (bridge.a[1] + bridge.b[1]) / 2],
    bridge.deck, 'Le franchissement de la Moine sous le bourg : arches de granit et halage.',
    { dist: 150, phi: 1.25, theta: 2.2 }),
  L('moulins-de-montigne', 'Moulins de Montigné', [mills[0].x, mills[0].z], mills[0].ground,
    'Les vieux moulins à eau de la Moine, roues à aubes et chaussée.',
    { dist: 140, phi: 1.2, theta: 1.4 }),
  L('motte-feodale', 'Motte féodale', motte, terrainAt(...motte),
    'La motte castrale de Montfaucon : tertre, palissade et tour de bois.',
    { dist: 170, phi: 1.0, theta: -2.3 }),
  L('foire-saint-maurice', 'Foire de la Saint-Maurice', FAIR, terrainAt(...FAIR),
    'La fête foraine dressée sur l’aire de la Prée Saint-Maurice, au pied du pont de Moine : manège, grande roue et tréteaux.',
    { dist: 155, phi: 1.16, theta: 1.1 }),
];
if (stJacques) landmarks.push(L('eglise-saint-jacques', 'Église Saint-Jacques', stJacques, terrainAt(...stJacques),
  'Le clocher du bourg de Montfaucon-sur-Moine.', { dist: 160, phi: 1.1, theta: -1.2 }));
if (stMartin) landmarks.push(L('eglise-saint-martin', 'Église Saint-Martin', stMartin, terrainAt(...stMartin),
  'Le clocher du bourg de Montigné-sur-Moine.', { dist: 160, phi: 1.1, theta: 2.6 }));

// clochers illuminés la nuit : églises + chapelle
const belfries = [];
for (const [p, kind, hgt] of [[stJacques, 'eglise', 28], [stMartin, 'eglise', 30], [chapel, 'chapelle', 12]]) {
  if (!p) continue;
  const b = buildings.find((bb) => Math.hypot(centroid(bb.r)[0] - p[0], centroid(bb.r)[1] - p[1]) < 12);
  belfries.push({ x: +p[0].toFixed(2), z: +p[1].toFixed(2), g: +(b ? b.b : terrainAt(...p)).toFixed(2), h: hgt, kind });
}

/* --------------------------------------------- parcours des barques ---- */
// On borne le circuit à la traversée du bourg — des moulins au pont de Moine,
// plus une marge de part et d'autre : les barques restent ainsi dans le décor.
const boatPath = [];
{
  const a = Math.min(mi, bridgeMidRiver.i), b = Math.max(mi, bridgeMidRiver.i);
  const i0 = Math.max(2, a - 26);
  const i1 = Math.min(moine.length - 3, b + 26);
  for (let i = i0; i <= i1; i++) {
    const [x, z] = moine[i];
    if (Math.abs(x) > WORLD.w / 2 - 120 || Math.abs(z) > WORLD.h / 2 - 120) continue;
    boatPath.push([+x.toFixed(2), +z.toFixed(2), +waterLevel[i].toFixed(2)]);
  }
}
console.log(`→ parcours des barques : ${boatPath.length} points (${segLen(boatPath).toFixed(0)} m)`);

/* --------------------------------------------------------- points ---- */
const POI_KIND = new Set(['townhall', 'place_of_worship', 'school', 'restaurant', 'cafe', 'bar',
  'pharmacy', 'library', 'fire_station', 'post_office', 'bank', 'fuel']);
const pois = [];
for (const e of els) {
  const t = e.tags; if (!t?.name) continue;
  const kind = t.amenity || t.historic || t.tourism;
  if (!kind || (!POI_KIND.has(kind) && !t.historic)) continue;
  let p = null;
  if (e.type === 'node' && e.lat) p = project(e.lat, e.lon);
  else if (e.geometry?.length) p = centroid(closeRing(geo(e)));
  if (!p) continue;
  pois.push({ n: t.name, k: kind, x: +p[0].toFixed(1), z: +p[1].toFixed(1), y: +terrainAt(...p).toFixed(1) });
}
const places = els.filter((e) => e.type === 'node' && e.tags?.place && e.tags?.name)
  .map((e) => { const p = project(e.lat, e.lon); return { n: e.tags.name, k: e.tags.place, x: +p[0].toFixed(1), z: +p[1].toFixed(1), y: +terrainAt(...p).toFixed(1) }; });

/* -------------------------------------------------------- sortie ---- */
const scene = {
  meta: {
    commune: 'Montfaucon-Montigné (49230)', origin: ORIGIN, bbox: BBOX,
    world: { w: +WORLD.w.toFixed(1), h: +WORLD.h.toFixed(1) },
    source_osm: '© les contributeurs OpenStreetMap (ODbL)',
    source_mnt: `${dem.source} — ${dem.dataset}`,
    exageration: EXAGERATION,
    altitude_reelle: { min: dem.min, max: dem.max },
    built_at: new Date().toISOString(),
  },
  terrain: { n: TN, min: +Math.min(...H).toFixed(2), max: +Math.max(...H).toFixed(2), h: Array.from(H, (v) => +v.toFixed(2)) },
  buildings, roads, water, land, trees, pois, places,
  river: { pts: moine.map(([x, z], i) => [+x.toFixed(2), +z.toFixed(2), +waterLevel[i].toFixed(2)]) },
  boatPath,
  landmarks, belfries, bridge, mills,
  motte: { x: +motte[0].toFixed(2), z: +motte[1].toFixed(2), g: +terrainAt(...motte).toFixed(2), r: +motteClear.toFixed(1) },
  fair: { x: +FAIR[0].toFixed(2), z: +FAIR[1].toFixed(2), g: +terrainAt(...FAIR).toFixed(2), r: 41 },
};
const out = join(ROOT, 'data', 'scene.json');
writeFileSync(out, JSON.stringify(scene));
const kb = (readFileSync(out).length / 1024).toFixed(0);
console.log(`✓ data/scene.json écrit (${kb} Ko)`);
