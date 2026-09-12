// Extrusion des emprises OSM : murs, pignons, toitures à deux pentes ou en croupe.
// Tout est fusionné dans trois maillages pour tenir 60 fps avec ~2 600 bâtiments.
import * as THREE from '../lib/three.js';
import { triangulate } from '../lib/triangulate.js';
import { texturesFacade, textureArdoise, normalesArdoise } from '../lib/textures.js';

const TRAVEE = 3.2, NIVEAU = 2.95, TUILE_U = TRAVEE * 4, TUILE_V = NIVEAU * 4;
const ARD = 2.4;              // 1 tuile d'ardoises ≈ 2,4 m → rangs de ~15 cm
const DEBORD = 0.42;          // débord de toiture

class Tampon {
  constructor() { this.p = []; this.c = []; this.u = []; }
  // Les contours OSM tournent dans le sens horaire vu du ciel : on inverse
  // l'ordre des sommets pour que toutes les normales pointent vers l'extérieur.
  tri(a, b, c, col, uva, uvb, uvc) {
    this.p.push(c[0], c[1], c[2], b[0], b[1], b[2], a[0], a[1], a[2]);
    for (let i = 0; i < 3; i++) this.c.push(col.r, col.g, col.b);
    this.u.push(uvc[0], uvc[1], uvb[0], uvb[1], uva[0], uva[1]);
  }
  quad(a, b, c, d, col, uva, uvb, uvc, uvd) {
    this.tri(a, b, c, col, uva, uvb, uvc);
    this.tri(a, c, d, col, uva, uvc, uvd);
  }
  geometrie() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.computeVertexNormals();
    return g;
  }
  get vide() { return this.p.length === 0; }
}

export function construireBatiments(scene, data) {
  const facades = new Tampon();     // murs avec fenêtres
  const bruts = new Tampon();       // granges, chapelles, églises : murs pleins
  const toits = new Tampon();
  const col = new THREE.Color();

  for (const b of data.buildings) {
    const simple = (b.f & 8) || (b.f & 2) || (b.f & 4);
    const cible = simple ? bruts : facades;
    col.setHex(b.wc);
    const yBas = b.b - b.sk;
    const yHaut = b.b + b.h;
    const decal = ((b.id % 97) / 97) * 4;            // décalage de tuile par bâtiment

    /* --- murs --- */
    let s = 0;
    const r = b.r, n = r.length;
    for (let i = 0; i < n; i++) {
      const [x0, z0] = r[i];
      const [x1, z1] = r[(i + 1) % n];
      const L = Math.hypot(x1 - x0, z1 - z0);
      if (L < 0.05) continue;
      const u0 = (s + decal) / TUILE_U, u1 = (s + L + decal) / TUILE_U;
      const v0 = (yBas - b.b) / TUILE_V, v1 = (yHaut - b.b) / TUILE_V;
      cible.quad(
        [x0, yBas, z0], [x1, yBas, z1], [x1, yHaut, z1], [x0, yHaut, z0],
        col, [u0, v0], [u1, v0], [u1, v1], [u0, v1],
      );
      s += L;
    }

    /* --- plafond (visible depuis le ciel sous une toiture plate) --- */
    const idx = triangulate(r);
    for (let i = 0; i < idx.length; i += 3) {
      const a = r[idx[i]], c2 = r[idx[i + 1]], d = r[idx[i + 2]];
      toits.tri(
        [a[0], yHaut, a[1]], [c2[0], yHaut, c2[1]], [d[0], yHaut, d[1]],
        new THREE.Color(b.rc).multiplyScalar(0.82),
        [a[0] / ARD, a[1] / ARD], [c2[0] / ARD, c2[1] / ARD], [d[0] / ARD, d[1] / ARD],
      );
    }

    /* --- toiture --- */
    const [ox, oz, ow, od, oa] = b.o;
    const ca = Math.cos(oa), sa = Math.sin(oa);
    const P = (u, v, y) => [ox + u * ca - v * sa, y, oz + u * sa + v * ca];
    const faite = ow >= od;                          // le faîtage suit le grand côté
    const hw = (faite ? ow : od) / 2 + DEBORD;       // demi-longueur du faîtage
    const hd = (faite ? od : ow) / 2 + DEBORD;       // demi-largeur (sens de la pente)
    const rot = faite ? 0 : Math.PI / 2;
    const c2a = Math.cos(oa + rot), s2a = Math.sin(oa + rot);
    const Q = (u, v, y) => [ox + u * c2a - v * s2a, y, oz + u * s2a + v * c2a];
    const cToit = col.clone().setHex(b.rc);
    const cPignon = col.clone().setHex(b.wc).multiplyScalar(0.97);
    const yE = yHaut, yF = yHaut + b.rh;
    const pente = Math.hypot(hd, b.rh);

    if (b.rt === 2) {
      // toit-terrasse : simple acrotère
      const A = Q(-hw, -hd, yE), B = Q(hw, -hd, yE), C = Q(hw, hd, yE), D = Q(-hw, hd, yE);
      const A2 = Q(-hw, -hd, yF), B2 = Q(hw, -hd, yF), C2 = Q(hw, hd, yF), D2 = Q(-hw, hd, yF);
      toits.quad(A2, B2, C2, D2, cToit, [0, 0], [hw / ARD, 0], [hw / ARD, hd / ARD], [0, hd / ARD]);
      for (const [p, q, p2, q2] of [[A, B, A2, B2], [B, C, B2, C2], [C, D, C2, D2], [D, A, D2, A2]]) {
        toits.quad(p, q, q2, p2, cToit.clone().multiplyScalar(0.9), [0, 0], [1, 0], [1, 0.3], [0, 0.3]);
      }
    } else if (b.rt === 0) {
      // deux pentes + pignons
      const l = hw, e = hd;
      const A = Q(-l, -e, yE), B = Q(l, -e, yE), C = Q(l, e, yE), D = Q(-l, e, yE);
      const F1 = Q(-l, 0, yF), F2 = Q(l, 0, yF);
      toits.quad(A, B, F2, F1, cToit, [0, 0], [2 * l / ARD, 0], [2 * l / ARD, pente / ARD], [0, pente / ARD]);
      toits.quad(C, D, F1, F2, cToit, [0, 0], [2 * l / ARD, 0], [2 * l / ARD, pente / ARD], [0, pente / ARD]);
      cible.tri(A, F1, D, cPignon, [0, 0], [hd / TUILE_U, b.rh / TUILE_V], [2 * hd / TUILE_U, 0]);
      cible.tri(B, C, F2, cPignon, [0, 0], [2 * hd / TUILE_U, 0], [hd / TUILE_U, b.rh / TUILE_V]);
    } else {
      // croupe : faîtage raccourci
      const l = hw, e = hd, fl = Math.max(0.6, l - e * 0.85);
      const A = Q(-l, -e, yE), B = Q(l, -e, yE), C = Q(l, e, yE), D = Q(-l, e, yE);
      const F1 = Q(-fl, 0, yF), F2 = Q(fl, 0, yF);
      toits.quad(A, B, F2, F1, cToit, [0, 0], [2 * l / ARD, 0], [2 * l / ARD, pente / ARD], [0, pente / ARD]);
      toits.quad(C, D, F1, F2, cToit, [0, 0], [2 * l / ARD, 0], [2 * l / ARD, pente / ARD], [0, pente / ARD]);
      toits.tri(B, C, F2, cToit, [0, 0], [2 * e / ARD, 0], [e / ARD, pente / ARD]);
      toits.tri(D, A, F1, cToit, [0, 0], [2 * e / ARD, 0], [e / ARD, pente / ARD]);
    }
  }

  const { map, emissive, normal } = texturesFacade();
  const matFacade = new THREE.MeshStandardMaterial({
    vertexColors: true, map, roughness: 0.86, metalness: 0, envMapIntensity: 0.55,
    normalMap: normal, normalScale: new THREE.Vector2(0.75, 0.75),
    emissiveMap: emissive, emissive: new THREE.Color(0xffd59a), emissiveIntensity: 0,
  });
  const matBrut = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.5 });
  const matToit = new THREE.MeshStandardMaterial({
    vertexColors: true, map: textureArdoise(), roughness: 0.62, metalness: 0.06, envMapIntensity: 0.8,
    normalMap: normalesArdoise(), normalScale: new THREE.Vector2(0.85, 0.85),
  });

  const meshes = [];
  for (const [t, m, nom] of [[facades, matFacade, 'facades'], [bruts, matBrut, 'murs'], [toits, matToit, 'toits']]) {
    if (t.vide) continue;
    const mesh = new THREE.Mesh(t.geometrie(), m);
    mesh.name = nom;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  return { meshes, matFacade, matBrut, matToit };
}
