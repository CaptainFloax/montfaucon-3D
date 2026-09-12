// Les cinq repères mis en scène à la main : le pont de Moine, les moulins,
// la motte féodale, la chapelle Saint-Jean et les clochers illuminés.
import * as THREE from '../lib/three.js';
import { rng } from '../lib/champ.js';

const PIERRE = 0xcbbfa6, PIERRE_S = 0xb3a58a, BOIS = 0x6b5236, BOIS_S = 0x53402b;
const ARDOISE = 0x4a515a, HERBE = 0x7e9455;

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.88, metalness: 0, ...o });

/* ------------------------------------------------------------- le pont --- */
function pontDeMoine(b) {
  const g = new THREE.Group();
  const dx = b.b[0] - b.a[0], dz = b.b[1] - b.a[1];
  const L = Math.hypot(dx, dz) + 7;
  const larg = 7.4;
  const yEau = b.water, yTab = b.deck;
  const hauteur = yTab - yEau + 2.6;

  const forme = new THREE.Shape();
  forme.moveTo(-L / 2, -2.6);
  forme.lineTo(L / 2, -2.6);
  forme.lineTo(L / 2, hauteur - 2.6);
  forme.lineTo(-L / 2, hauteur - 2.6);
  forme.closePath();

  const arches = 3, pas = L / arches, r = pas * 0.41;
  for (let i = 0; i < arches; i++) {
    const cx = -L / 2 + pas * (i + 0.5);
    const trou = new THREE.Path();
    trou.moveTo(cx - r, -2.4);
    trou.lineTo(cx - r, 0.15);
    trou.absarc(cx, 0.15, r, Math.PI, 0, true);
    trou.lineTo(cx + r, -2.4);
    trou.closePath();
    forme.holes.push(trou);
  }

  const geo = new THREE.ExtrudeGeometry(forme, { depth: larg, bevelEnabled: false, curveSegments: 18 });
  geo.translate(0, 0, -larg / 2);
  const corps = new THREE.Mesh(geo, mat(PIERRE, { roughness: 0.95 }));
  corps.castShadow = corps.receiveShadow = true;
  g.add(corps);

  // bandeau et avant-becs
  const bandeau = new THREE.Mesh(new THREE.BoxGeometry(L + 0.6, 0.5, larg + 0.9), mat(PIERRE_S));
  bandeau.position.y = hauteur - 2.85;
  bandeau.castShadow = true;
  g.add(bandeau);
  for (let i = 1; i < arches; i++) {
    for (const s of [1, -1]) {
      const bec = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.35, hauteur - 2.2, 3), mat(PIERRE_S));
      bec.position.set(-L / 2 + pas * i, (hauteur - 2.2) / 2 - 2.6, s * (larg / 2 + 0.6));
      bec.rotation.y = s > 0 ? Math.PI : 0;
      bec.castShadow = true;
      g.add(bec);
    }
  }

  g.position.set((b.a[0] + b.b[0]) / 2, yEau, (b.a[1] + b.b[1]) / 2);
  g.rotation.y = Math.atan2(-dz, dx);
  return g;
}

/* ----------------------------------------------------------- les moulins --- */
function roueAAubes() {
  const g = new THREE.Group();
  const R = 2.7, larg = 1.7, aubes = 14;
  const matBois = mat(BOIS, { roughness: 1 });
  for (const s of [-1, 1]) {
    const jante = new THREE.Mesh(new THREE.TorusGeometry(R, 0.13, 6, 30), matBois);
    jante.position.x = s * larg / 2;
    jante.rotation.y = Math.PI / 2;
    g.add(jante);
  }
  for (let i = 0; i < aubes; i++) {
    const a = (i / aubes) * Math.PI * 2;
    const aube = new THREE.Mesh(new THREE.BoxGeometry(larg, 0.85, 0.11), mat(0x7c6244, { roughness: 1 }));
    aube.position.set(0, Math.cos(a) * (R - 0.35), Math.sin(a) * (R - 0.35));
    aube.rotation.x = -a;
    aube.castShadow = true;
    g.add(aube);
    const rayon = new THREE.Mesh(new THREE.BoxGeometry(larg * 0.9, 0.1, R * 2 - 0.4), matBois);
    rayon.rotation.x = -a;
    g.add(rayon);
  }
  const axe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, larg + 1.4, 8), mat(0x4d3d2a));
  axe.rotation.z = Math.PI / 2;
  g.add(axe);
  return g;
}

function moulin(m, i) {
  // Repère local : le groupe est tourné selon le fil de l'eau, l'axe +X pointe
  // vers la rivière quand `side` vaut +1 (l'ancrage est à 13 m de l'axe du lit).
  const g = new THREE.Group();
  const c = m.side;                       // sens de la rivière par rapport au moulin
  const sol = m.ground;
  const dEau = m.water - sol;             // négatif : l'eau est sous le seuil du moulin
  const larg = 8, lng = 12, haut = 6.4;

  // soubassement maçonné qui descend sous l'eau
  const socle = new THREE.Mesh(new THREE.BoxGeometry(larg + 2.6, 6, lng + 1.6), mat(0xb3a68a, { roughness: 1 }));
  socle.position.set(c * 0.6, -3 + 0.35, 0);
  socle.receiveShadow = true;
  g.add(socle);

  const murs = new THREE.Mesh(new THREE.BoxGeometry(larg, haut, lng), mat(0xe6dcc2, { roughness: 0.95 }));
  murs.position.set(-c * 2.6, haut / 2 + 0.35, 0);
  murs.castShadow = murs.receiveShadow = true;
  g.add(murs);

  const toit = new THREE.Mesh(new THREE.CylinderGeometry(0.01, larg * 0.76, 3.6, 4, 1), mat(ARDOISE, { roughness: 0.68 }));
  toit.position.set(-c * 2.6, haut + 2.15, 0);
  toit.rotation.y = Math.PI / 4;
  toit.scale.set(1, 1, (lng / larg) * 1.04);
  toit.castShadow = true;
  g.add(toit);

  // lucarne du treuil, côté rivière
  const lucarne = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.6, 1.4), mat(0xe6dcc2, { roughness: 0.95 }));
  lucarne.position.set(-c * 2.6 + c * larg * 0.34, haut + 1.5, 0);
  lucarne.castShadow = true;
  g.add(lucarne);

  // la roue, plaquée contre le pignon, le bas des aubes dans l'eau
  const roue = roueAAubes();
  roue.position.set(c * 3.4, dEau + 2.1, i === 0 ? 2.6 : -2.6);
  g.add(roue);

  // le coursier qui amène l'eau à la roue
  const coursier = new THREE.Mesh(new THREE.BoxGeometry(7, 0.4, 2.6), mat(0x8a745a, { roughness: 1 }));
  coursier.position.set(c * 7.5, dEau + 1.1, roue.position.z);
  coursier.rotation.z = c * 0.08;
  coursier.castShadow = true;
  g.add(coursier);
  for (const sz of [-1, 1]) {
    const bord = new THREE.Mesh(new THREE.BoxGeometry(7, 0.9, 0.22), mat(0x7a6650, { roughness: 1 }));
    bord.position.set(c * 7.5, dEau + 1.5, roue.position.z + sz * 1.3);
    g.add(bord);
  }

  // quai et garde-corps
  const quai = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, lng), mat(0xbdb094, { roughness: 1 }));
  quai.position.set(-c * (larg / 2 + 4.2), 0.55, 0);
  quai.receiveShadow = true;
  g.add(quai);

  g.position.set(m.x, sol, m.z);
  g.rotation.y = m.a;
  return { groupe: g, roue, sens: c };
}

function chaussee(m) {                      // la chaussée (seuil) en travers de la Moine
  const g = new THREE.Group();
  const mur = new THREE.Mesh(new THREE.BoxGeometry(34, 1.5, 1.7), mat(0xb0a488, { roughness: 1 }));
  mur.position.y = -0.35;
  mur.castShadow = mur.receiveShadow = true;
  g.add(mur);
  const nappe = new THREE.Mesh(new THREE.PlaneGeometry(34, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xd8e8ea, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.7 }));
  nappe.rotation.x = -Math.PI / 2.25;
  nappe.position.set(0, -0.1, 1.5);
  g.add(nappe);
  g.position.set(m.x - Math.cos(m.a) * m.side * 13, m.water + 0.35, m.z + Math.sin(m.a) * m.side * 13);
  g.rotation.y = m.a;
  return g;
}

/* --------------------------------------------------------- la motte --- */
function motteFeodale(mo) {
  const g = new THREE.Group();
  const R = mo.r, H = 9.5, Rt = R * 0.42;

  const tertre = new THREE.Mesh(new THREE.CylinderGeometry(Rt, R, H, 28, 3), mat(HERBE, { roughness: 1 }));
  tertre.position.y = H / 2;
  tertre.castShadow = tertre.receiveShadow = true;
  g.add(tertre);

  // fossé : anneau légèrement creusé
  const fosse = new THREE.Mesh(new THREE.RingGeometry(R, R + 5.5, 34), mat(0x6d7c4c, { roughness: 1, side: THREE.DoubleSide }));
  fosse.rotation.x = -Math.PI / 2;
  fosse.position.y = 0.12;
  fosse.receiveShadow = true;
  g.add(fosse);

  // palissade
  const n = 34;
  const pieu = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.21, 2.5, 5), mat(BOIS_S, { roughness: 1 }), n);
  const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    d.position.set(Math.cos(a) * (Rt - 0.5), H + 1.15, Math.sin(a) * (Rt - 0.5));
    d.rotation.set(0, a, 0);
    d.updateMatrix();
    pieu.setMatrixAt(i, d.matrix);
  }
  pieu.castShadow = true;
  g.add(pieu);

  // tour de bois
  const tour = new THREE.Group();
  const fut = new THREE.Mesh(new THREE.BoxGeometry(6.4, 8.5, 6.4), mat(BOIS, { roughness: 1 }));
  fut.position.y = 4.25;
  fut.castShadow = fut.receiveShadow = true;
  tour.add(fut);
  const hourd = new THREE.Mesh(new THREE.BoxGeometry(7.8, 1.5, 7.8), mat(BOIS_S, { roughness: 1 }));
  hourd.position.y = 8.6;
  hourd.castShadow = true;
  tour.add(hourd);
  const toit = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 5.8, 4.2, 4), mat(0x5b4a33, { roughness: 0.9 }));
  toit.position.y = 11.5;
  toit.rotation.y = Math.PI / 4;
  toit.castShadow = true;
  tour.add(toit);
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.45, 9.5, 0.45), mat(BOIS_S));
    p.position.set(((i & 1) ? 1 : -1) * 3.1, 4.75, ((i & 2) ? 1 : -1) * 3.1);
    tour.add(p);
  }
  tour.position.y = H;
  g.add(tour);

  // rampe d'accès
  const rampe = new THREE.Mesh(new THREE.BoxGeometry(4, 0.5, R * 1.35), mat(0x8a7a5c, { roughness: 1 }));
  rampe.position.set(0, H * 0.52, R * 0.72);
  rampe.rotation.x = Math.atan2(H, R * 1.2);
  rampe.receiveShadow = true;
  g.add(rampe);

  g.position.set(mo.x, mo.g - 0.4, mo.z);
  return g;
}

/* -------------------------------------------------- clochers & chapelle --- */
function clocher(b, scene) {
  const g = new THREE.Group();
  const eglise = b.kind === 'eglise';
  const cote = eglise ? 5.4 : 2.4;
  const hFut = b.h;
  const matPierre = new THREE.MeshStandardMaterial({
    color: 0xd6cbb2, roughness: 0.9, metalness: 0,
    emissive: new THREE.Color(0xffdca8), emissiveIntensity: 0,
  });

  if (eglise) {
    const fut = new THREE.Mesh(new THREE.BoxGeometry(cote, hFut, cote), matPierre);
    fut.position.y = hFut / 2;
    fut.castShadow = fut.receiveShadow = true;
    g.add(fut);
    const corniche = new THREE.Mesh(new THREE.BoxGeometry(cote + 1, 0.7, cote + 1), matPierre);
    corniche.position.y = hFut - 0.2;
    corniche.castShadow = true;
    g.add(corniche);
    const fleche = new THREE.Mesh(new THREE.ConeGeometry(cote * 0.78, hFut * 0.62, 8), mat(ARDOISE, { roughness: 0.6 }));
    fleche.position.y = hFut + hFut * 0.31;
    fleche.castShadow = true;
    g.add(fleche);
    for (const s of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {          // abat-sons
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 3, 0.25), mat(0x2f3138));
      b2.position.set(s[0] * (cote / 2 + 0.02), hFut - 3.2, s[1] * (cote / 2 + 0.02));
      b2.rotation.y = s[0] ? Math.PI / 2 : 0;
      g.add(b2);
    }
    const croix = new THREE.Group();
    const v = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.8, 0.16), mat(0x4a4a4a, { metalness: 0.6, roughness: 0.4 }));
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.16), mat(0x4a4a4a, { metalness: 0.6, roughness: 0.4 }));
    h.position.y = 0.45;
    croix.add(v, h);
    croix.position.y = hFut + hFut * 0.62 + 0.9;
    g.add(croix);
  } else {
    // clocher-mur de la chapelle : un pignon ajouré, une cloche
    const pignon = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.6, 0.55), matPierre);
    pignon.position.y = hFut + 1.8;
    pignon.castShadow = true;
    g.add(pignon);
    const arc = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.62, 14, 1, false, 0, Math.PI), mat(0x3a3a3a));
    arc.rotation.x = Math.PI / 2;
    arc.position.set(0, hFut + 2.1, 0);
    g.add(arc);
    const cloche = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8, 0, Math.PI * 2, 0, Math.PI / 1.9),
      mat(0x7a6033, { metalness: 0.55, roughness: 0.45 }));
    cloche.position.set(0, hFut + 2.3, 0);
    g.add(cloche);
    const rampant = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.5, 1.5, 4), matPierre);
    rampant.position.y = hFut + 4.1;
    rampant.rotation.y = Math.PI / 4;
    rampant.scale.z = 0.22;
    g.add(rampant);
    const croix = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.1, 0.12), mat(0x4a4a4a));
    croix.position.y = hFut + 5.2;
    g.add(croix);
  }

  g.position.set(b.x, b.g, b.z);

  // illumination nocturne
  const projecteurs = [];
  for (const s of [-1, 1]) {
    const sp = new THREE.SpotLight(0xffca7a, 0, 95, 0.62, 0.8, 1.15);
    sp.position.set(b.x + s * 9, b.g + 0.5, b.z + s * 6);
    sp.target.position.set(b.x, b.g + hFut * 1.1, b.z);
    scene.add(sp, sp.target);
    projecteurs.push(sp);
  }
  return { groupe: g, materiau: matPierre, projecteurs };
}

/* ------------------------------------------------------------- montage --- */
export function construireReperes(scene, data, terrain) {
  const groupe = new THREE.Group();
  groupe.name = 'reperes';

  groupe.add(pontDeMoine(data.bridge));

  const roues = [];
  data.mills.forEach((m, i) => {
    const { groupe: g, roue, sens } = moulin(m, i);
    groupe.add(g);
    roues.push({ roue, sens });
    if (m.weir) groupe.add(chaussee(m));
  });

  groupe.add(motteFeodale(data.motte));

  const clochers = [];
  for (const b of data.belfries) clochers.push(clocher(b, scene));
  for (const c of clochers) groupe.add(c.groupe);

  // quelques barques amarrées au pied des moulins
  scene.add(groupe);

  return {
    groupe, clochers,
    anime(dt) {
      for (const { roue, sens } of roues) roue.rotation.x += dt * 0.55 * sens;
    },
    nuit(k) {                                  // k : 0 = plein jour, 1 = nuit noire
      for (const c of clochers) {
        c.materiau.emissiveIntensity = 0.55 * k;
        for (const p of c.projecteurs) p.intensity = 320 * k;
      }
    },
  };
}
