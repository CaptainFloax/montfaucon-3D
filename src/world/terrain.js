// Le relief : maillage régulier issu du MNT, teinté sommet par sommet d'après
// l'occupation du sol OSM, puis détaillé au pixel (sillons de labour orientés
// parcelle par parcelle, touffes de prairie, moutonnement des bois, courbes de
// niveau calées sur l'altitude réelle NGF).
import * as THREE from '../lib/three.js';
import { noise2, clamp } from '../lib/champ.js';
import { textureSol, normalesSol } from '../lib/textures.js';

const TEINTES = {
  farmland:   [0xc0b681, 0xaea86b],
  meadow:     [0x93a85f, 0x84995a],
  grass:      [0x8fae5c, 0x86a457],
  village_green: [0x8fae5c, 0x86a457],
  forest:     [0x4a6639, 0x3e5731],
  scrub:      [0x7c8b54, 0x6e7d4b],
  vineyard:   [0x93995b, 0x87905a],
  orchard:    [0x7f9a5a, 0x759050],
  residential:[0x9aa478, 0xa8a58c],
  cemetery:   [0x8c9a76, 0x808e6c],
  allotments: [0x9ba166, 0x8e9760],
  brownfield: [0x93a06a, 0x8a9161],
  pitch:      [0x76a05a, 0x6d9653],
  greenhouse_horticulture: [0xa3a68c, 0x969a80],
  _defaut:    [0x9dab6d, 0x8f9e63],
};
const CLES = Object.keys(TEINTES).filter((k) => k[0] !== '_');

// familles reconnues par le fragment shader
const FAMILLE = {
  farmland: 1,
  meadow: 2, grass: 2, village_green: 2, allotments: 2, pitch: 2,
  forest: 3, scrub: 3,
  vineyard: 4, orchard: 4,
  residential: 5, brownfield: 5, cemetery: 5, greenhouse_horticulture: 5,
};

/* ------------------------------------------------------------- shader --- */
const PREFIXE_SOMMET = /* glsl */`
attribute float aSol;
attribute float aRang;
varying float vSol;
varying float vRang;
varying vec3 vMonde;
`;

const PREFIXE_FRAGMENT = /* glsl */`
varying float vSol;
varying float vRang;
varying vec3 vMonde;
uniform float uCourbes;
uniform float uExageration;

float hache21(vec2 p) {
  p = fract(p * vec2(127.31, 311.7));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
float bruit2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hache21(i), hache21(i + vec2(1.0, 0.0)), f.x),
             mix(hache21(i + vec2(0.0, 1.0)), hache21(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Parcellaire de bocage : OpenStreetMap ne cadastre qu'une soixantaine de
// parcelles sur la commune ; partout ailleurs on en fabrique un, par cellules
// de Voronoï. Chaque « champ » reçoit son ton, son orientation de labour et sa
// bordure sombre — c'est ce qui donne au paysage sa trame de haies.
// Renvoie : x = ton, y = orientation, z = distance au bord, w = distance au centre.
vec4 parcelle(vec2 w, float taille) {
  vec2 g = floor(w / taille), f = fract(w / taille);
  vec2 meilleurP = vec2(0.5); vec2 meilleurC = g; float d1 = 9.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 c = g + o;
      vec2 p = o + vec2(hache21(c), hache21(c + 19.7));
      float d = length(p - f);
      if (d < d1) { d1 = d; meilleurP = p; meilleurC = c; }
    }
  }
  float d2 = 9.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 c = g + o;
      if (c == meilleurC) continue;
      vec2 p = o + vec2(hache21(c), hache21(c + 19.7));
      // distance au plan médiateur : donne des lisières nettes
      vec2 milieu = 0.5 * (meilleurP + p);
      vec2 axe = normalize(p - meilleurP);
      d2 = min(d2, dot(f - milieu, axe));
    }
  }
  return vec4(hache21(meilleurC), hache21(meilleurC + 5.3) * 3.14159, d2, d1);
}
`;

const MOTIF = /* glsl */`
{
  vec2 w = vMonde.xz;
  vec2 dir = vec2(cos(vRang), sin(vRang));
  vec2 perp = vec2(-dir.y, dir.x);
  float u = dot(w, perp);
  float m = 1.0;

  // Fondu du motif fin quand un pixel couvre plus qu'une période : sans ça,
  // les sillons moirent dès qu'on s'éloigne.
  float pasEcran = max(fwidth(u), fwidth(w.x + w.y)) + 1e-4;
  float net = 1.0 - smoothstep(0.35, 1.6, pasEcran);

  // grain commun : la terre n'est jamais unie
  m *= 0.86 + (bruit2(w * 1.35) * 0.55 + bruit2(w * 0.34) * 0.45) * 0.30;

  // parcellaire de bocage, ~105 m de côté
  vec4 par = parcelle(w, 105.0);
  bool libre = vSol < 0.5;                 // aucune parcelle OSM ici
  if (libre) {
    dir = vec2(cos(par.y), sin(par.y));
    perp = vec2(-dir.y, dir.x);
    u = dot(w, perp);
  }

  if (vSol > 0.5 && vSol < 1.5) {          // labours : sillons orientés parcelle
    float sillon = pow(sin(u * 1.42) * 0.5 + 0.5, 1.7);
    m *= mix(1.0, 0.80 + sillon * 0.52, net);
    m *= 0.95 + 0.10 * step(0.62, fract(u * 0.028));   // passages de roue
    m *= 0.94 + bruit2(w * 0.22) * 0.14;               // taches de terre nue
  } else if (vSol > 1.5 && vSol < 2.5) {   // prairie : touffes et andains
    m *= 0.86 + bruit2(w * 2.4) * 0.32;
    m *= mix(1.0, 0.95 + 0.10 * (sin(u * 0.42) * 0.5 + 0.5), net * 0.7);
  } else if (vSol > 2.5 && vSol < 3.5) {   // bois : moutonnement des houppiers
    m *= 0.62 + (bruit2(w * 0.8) * 0.6 + bruit2(w * 2.1) * 0.4) * 0.72;
  } else if (vSol > 3.5 && vSol < 4.5) {   // vigne et vergers : rangs serrés
    m *= mix(1.0, 0.82 + 0.40 * smoothstep(0.28, 0.72, fract(u / 2.7)), net);
    m *= 0.94 + bruit2(w * 1.1) * 0.12;
  } else if (vSol > 4.5) {                 // abords bâtis : cours et jardins
    m *= 0.90 + bruit2(w * 1.9) * 0.22;
  } else {                                  // bocage : la parcelle fabriquée
    float t = par.x;
    // un champ sur trois est en labour, les autres en herbe
    if (t > 0.66) {
      float sillon = pow(sin(u * 1.35) * 0.5 + 0.5, 1.8);
      m *= mix(1.0, 0.82 + 0.46 * sillon, net);
      m *= 0.95 + 0.10 * step(0.6, fract(u * 0.03));
    } else {
      m *= 0.88 + bruit2(w * 2.2) * 0.28;
      m *= mix(1.0, 0.95 + 0.11 * (sin(u * 0.36) * 0.5 + 0.5), net * 0.6);
    }
    m *= 0.93 + bruit2(w * 0.2) * 0.14;
  }

  // lisière : l'ombre portée des haies borde chaque champ
  float lisiere = 1.0 - smoothstep(0.0, 0.030, par.z);
  float herbeBord = 1.0 - smoothstep(0.02, 0.075, par.z);
  m *= 1.0 - lisiere * (libre ? 0.30 : 0.12);
  m *= 1.0 - herbeBord * 0.07;

  diffuseColor.rgb *= m;

  // chaque parcelle fabriquée a son propre vert : semis, regain, fauche, chaume
  if (libre) {
    float t = par.x;
    float t2 = fract(t * 7.31);
    diffuseColor.rgb *= vec3(0.88 + t * 0.28, 0.93 + t * 0.17, 0.84 + t * 0.22);
    diffuseColor.rgb *= 0.90 + t2 * 0.22;
    diffuseColor.rgb = mix(diffuseColor.rgb,
                           diffuseColor.rgb * vec3(1.26, 1.10, 0.72),
                           smoothstep(0.70, 0.97, t) * 0.85);   // chaumes et labours secs
  } else {
    diffuseColor.rgb *= 0.95 + par.x * 0.10;
  }

  if (uCourbes > 0.5) {
    float alt = vMonde.y / uExageration;               // altitude réelle, en m NGF
    float ep = max(fwidth(alt), 0.02) * 1.6 + 0.30;
    // équidistance 5 m, courbe maîtresse tous les 25 m — comme une carte IGN
    float d5 = abs(fract(alt / 5.0 + 0.5) - 0.5) * 5.0;
    float d25 = abs(fract(alt / 25.0 + 0.5) - 0.5) * 25.0;
    float trait = (1.0 - smoothstep(0.0, ep, d5)) * 0.34
                + (1.0 - smoothstep(0.0, ep * 2.2, d25)) * 0.52;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.16, 0.11, 0.07), clamp(trait, 0.0, 0.85));
  }
}
`;

export function construireTerrain(scene, data, terrain) {
  const n = terrain.n;
  const W = terrain.w, D = terrain.d;
  const exag = data.meta.exageration || 1;
  const gx = (i) => -W / 2 + (W * i) / (n - 1);
  const gz = (j) => D / 2 - (D * j) / (n - 1);

  /* --- rastérisation de l'occupation du sol sur la grille du MNT --- */
  const kind = new Uint8Array(n * n);          // 0 = bocage par défaut
  const rang = new Float32Array(n * n);        // orientation de la parcelle
  const variante = new Float32Array(n * n);    // teinte propre à chaque parcelle
  const ordre = new Float64Array(n * n).fill(Infinity);   // le plus petit polygone gagne
  const toIdx = (k) => CLES.indexOf(k) + 1;

  data.land.forEach((zone, iz) => {
    const code = toIdx(zone.k);
    if (code <= 0) return;
    // deux parcelles voisines ne sont jamais du même vert : semis, coupe, maturité…
    const teinte = ((Math.imul(iz + 1, 2654435761) >>> 0) % 1000) / 1000;
    const r = zone.r;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of r) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    const aire = (maxX - minX) * (maxZ - minZ);
    const i0 = Math.max(0, Math.floor(((minX + W / 2) / W) * (n - 1)));
    const i1 = Math.min(n - 1, Math.ceil(((maxX + W / 2) / W) * (n - 1)));
    const j0 = Math.max(0, Math.floor(((D / 2 - maxZ) / D) * (n - 1)));
    const j1 = Math.min(n - 1, Math.ceil(((D / 2 - minZ) / D) * (n - 1)));
    for (let j = j0; j <= j1; j++) {
      const z = gz(j);
      for (let i = i0; i <= i1; i++) {
        const x = gx(i);
        let dedans = false;
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
          const [xa, za] = r[a], [xb, zb] = r[b];
          if ((za > z) !== (zb > z) && x < ((xb - xa) * (z - za)) / (zb - za) + xa) dedans = !dedans;
        }
        const k = j * n + i;
        if (dedans && aire < ordre[k]) {
          kind[k] = code; ordre[k] = aire; rang[k] = zone.a ?? 0; variante[k] = teinte;
        }
      }
    }
  });

  /* --- géométrie, couleurs et attributs de motif --- */
  const count = n * n;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const aSol = new Float32Array(count);
  const aRang = new Float32Array(count);
  const c = new THREE.Color();
  const terre = new THREE.Color(0x8a7f66);
  const grasse = new THREE.Color(0x6f8f4e);

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const x = gx(i), z = gz(j), y = terrain.h[k];
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = (x + W / 2) / W; uv[k * 2 + 1] = (D / 2 - z) / D;

      const cle = CLES[kind[k] - 1];
      aSol[k] = FAMILLE[cle] ?? 0;
      // sans parcelle connue on prend une orientation douce, dérivée de la position :
      // le bocage garde ainsi une trame, sans quadrillage régulier
      aRang[k] = kind[k] ? rang[k] : noise2(x / 260, z / 260) * Math.PI;

      const paire = TEINTES[cle] || TEINTES._defaut;
      const m = clamp(noise2(x / 78, z / 78) * 0.7 + noise2(x / 23, z / 23) * 0.3, 0, 1);
      c.setHex(paire[0]).lerp(new THREE.Color(paire[1]), m);

      // pente : la terre affleure sur les talus raides
      const p = terrain.slope(x, z, 18);
      if (p > 0.22) c.lerp(terre, clamp((p - 0.22) * 2.0, 0, 0.55));
      // fond de vallée : herbe plus grasse (seuil en altitude réelle)
      const alt = y / exag;
      const humide = clamp((44 - alt) / 16, 0, 1);
      c.lerp(grasse, humide * 0.24);
      // chaque parcelle a son propre ton
      if (kind[k]) {
        const t = variante[k];
        c.offsetHSL((t - 0.5) * 0.035, (t - 0.5) * 0.14, (t - 0.5) * 0.11);
      }
      // variation fine
      const g = 0.94 + noise2(x / 9.5, z / 9.5) * 0.13;
      col[k * 3] = c.r * g; col[k * 3 + 1] = c.g * g; col[k * 3 + 2] = c.b * g;
    }
  }

  const idx = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, d = (j + 1) * n + i, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aSol', new THREE.BufferAttribute(aSol, 1));
  geo.setAttribute('aRang', new THREE.BufferAttribute(aRang, 1));
  geo.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const normalMap = normalesSol();
  normalMap.repeat.set(380, 380);
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0,
    map: textureSol(), normalMap, normalScale: new THREE.Vector2(0.95, 0.95),
    dithering: true, envMapIntensity: 0.45,
  });

  const uniforms = { uCourbes: { value: 0 }, uExageration: { value: exag } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${PREFIXE_SOMMET}`)
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  vSol = aSol;\n  vRang = aRang;\n  vMonde = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${PREFIXE_FRAGMENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MOTIF}`);
  };
  mat.customProgramCacheKey = () => 'terrain-motif-v5';

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  /* --- jupe périphérique : évite de voir « sous » la carte --- */
  const jupe = [];
  const bord = [];
  for (let i = 0; i < n; i++) bord.push([gx(i), gz(0)]);
  for (let j = 0; j < n; j++) bord.push([gx(n - 1), gz(j)]);
  for (let i = n - 1; i >= 0; i--) bord.push([gx(i), gz(n - 1)]);
  for (let j = n - 1; j >= 0; j--) bord.push([gx(0), gz(j)]);
  const bas = terrain.min - 60;
  for (let i = 0; i < bord.length - 1; i++) {
    const [x0, z0] = bord[i], [x1, z1] = bord[i + 1];
    const y0 = terrain.at(x0, z0), y1 = terrain.at(x1, z1);
    jupe.push(x0, y0, z0, x0, bas, z0, x1, y1, z1, x1, y1, z1, x0, bas, z0, x1, bas, z1);
  }
  const gj = new THREE.BufferGeometry();
  gj.setAttribute('position', new THREE.Float32BufferAttribute(jupe, 3));
  gj.computeVertexNormals();
  const mj = new THREE.Mesh(gj, new THREE.MeshStandardMaterial({ color: 0x6b6152, roughness: 1, side: THREE.DoubleSide }));
  mj.matrixAutoUpdate = false;
  scene.add(mj);

  return {
    mesh, materiau: mat, jupe: mj,
    courbes(actif) { uniforms.uCourbes.value = actif ? 1 : 0; },
  };
}
