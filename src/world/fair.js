// La foire de la Saint-Maurice, dressée dans le champ : tréteaux et bâches rayées,
// manège, grande roue, guirlandes qui s'allument à la tombée du jour.
import * as THREE from '../lib/three.js';
import { rng } from '../lib/champ.js';
import { textureRayures, textureHalo, textureAireFoire } from '../lib/textures.js';

const bois = (c = 0x7a6244) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 });

function stand(rnd, rayures) {
  const g = new THREE.Group();
  const L = 3.4 + rnd() * 1.6, P = 2.2, H = 2.25;

  const etal = new THREE.Mesh(new THREE.BoxGeometry(L, 0.95, P * 0.75), bois(0x6f5840));
  etal.position.y = 0.48;
  etal.castShadow = etal.receiveShadow = true;
  g.add(etal);

  const nappe = new THREE.Mesh(new THREE.BoxGeometry(L + 0.12, 0.08, P * 0.8), bois(0xb9ac8f));
  nappe.position.y = 0.98;
  g.add(nappe);

  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, H, 6), bois(0x5f4b35));
    m.position.set(sx * L / 2, H / 2, sz * P / 2);
    m.castShadow = true;
    g.add(m);
  }

  const bache = new THREE.Mesh(
    new THREE.BoxGeometry(L + 0.5, 0.07, P + 0.9),
    new THREE.MeshStandardMaterial({ map: rayures.clone(), roughness: 0.85, side: THREE.DoubleSide }),
  );
  bache.material.map.repeat.set(Math.max(1, L / 1.1), 1);
  bache.material.map.needsUpdate = true;
  bache.position.y = H + 0.12;
  bache.rotation.x = -0.13;
  bache.castShadow = true;
  g.add(bache);

  const lambrequin = new THREE.Mesh(new THREE.BoxGeometry(L + 0.5, 0.32, 0.05), bache.material);
  lambrequin.position.set(0, H - 0.06, P / 2 + 0.44);
  g.add(lambrequin);

  // marchandises
  const cageot = bois(0x8a6f4a);
  for (let i = 0; i < 3 + Math.floor(rnd() * 3); i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.35), cageot);
    c.position.set((rnd() - 0.5) * (L - 0.7), 1.17, (rnd() - 0.5) * 0.9);
    c.rotation.y = rnd() * 0.6;
    c.castShadow = true;
    g.add(c);
  }
  return g;
}

function manege(rnd) {
  const g = new THREE.Group();
  const tournant = new THREE.Group();
  const R = 5.4;

  const socle = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.9, 0.7, 26), bois(0x6a5540));
  socle.position.y = 0.35;
  socle.receiveShadow = true;
  g.add(socle);

  const plateau = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.22, 26), bois(0x8d6f4b));
  plateau.position.y = 0.82;
  plateau.receiveShadow = true;
  tournant.add(plateau);

  const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 5.4, 12),
    new THREE.MeshStandardMaterial({ color: 0xc8b48c, roughness: 0.7, metalness: 0.2 }));
  mat.position.y = 3.4;
  g.add(mat);

  const toile = new THREE.Mesh(new THREE.ConeGeometry(R + 0.8, 2.3, 26, 1, true),
    new THREE.MeshStandardMaterial({ map: textureRayures('#b5372f', '#f5ead4'), roughness: 0.8, side: THREE.DoubleSide }));
  toile.material.map.repeat.set(13, 1);
  toile.position.y = 6.1;
  toile.castShadow = true;
  tournant.add(toile);

  const epi = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.5, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8b25e, roughness: 0.4, metalness: 0.5 }));
  epi.position.y = 7.8;
  g.add(epi);

  const lampes = [];
  const geoLampe = new THREE.SphereGeometry(0.16, 8, 6);
  const matLampe = new THREE.MeshStandardMaterial({ color: 0xfff0cf, emissive: 0xffd18a, emissiveIntensity: 0 });
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const l = new THREE.Mesh(geoLampe, matLampe);
    l.position.set(Math.cos(a) * (R + 0.75), 5.1, Math.sin(a) * (R + 0.75));
    tournant.add(l);
  }
  lampes.push(matLampe);

  // chevaux de bois
  const corpsGeo = new THREE.CapsuleGeometry(0.26, 0.9, 3, 8);
  const teintes = [0xe8dcc4, 0x9a6b48, 0x5f5b56, 0xc9a86e];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const c = new THREE.Group();
    const corps = new THREE.Mesh(corpsGeo, new THREE.MeshStandardMaterial({ color: teintes[i % 4], roughness: 0.75 }));
    corps.rotation.z = Math.PI / 2;
    corps.position.y = 1.55;
    corps.castShadow = true;
    c.add(corps);
    const cou = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 3, 6), corps.material);
    cou.position.set(0.5, 1.9, 0);
    cou.rotation.z = -0.55;
    c.add(cou);
    for (const [dx, dz] of [[0.35, 0.16], [0.35, -0.16], [-0.35, 0.16], [-0.35, -0.16]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.95, 5), corps.material);
      p.position.set(dx, 1.05, dz);
      c.add(p);
    }
    const barre = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 4.2, 6),
      new THREE.MeshStandardMaterial({ color: 0xd8c08a, metalness: 0.6, roughness: 0.35 }));
    barre.position.y = 3;
    c.add(barre);
    c.position.set(Math.cos(a) * (R - 1.5), 0.9, Math.sin(a) * (R - 1.5));
    c.rotation.y = -a + Math.PI / 2;
    c.userData.phase = i * 0.78;
    tournant.add(c);
  }

  g.add(tournant);
  return { groupe: g, tournant, lampes, chevaux: tournant.children.filter((c) => c.userData.phase !== undefined) };
}

function grandeRoue() {
  const g = new THREE.Group();
  const R = 8.2, nac = 12;
  const acier = new THREE.MeshStandardMaterial({ color: 0xb9b1a2, roughness: 0.5, metalness: 0.45 });

  for (const s of [-1, 1]) {
    for (const d of [-1, 1]) {
      const j = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, R + 2.6, 6), acier);
      j.position.set(d * 3.4, (R + 1.4) / 2, s * 1.7);
      j.rotation.z = -d * 0.22;
      j.rotation.x = -s * 0.1;
      j.castShadow = true;
      g.add(j);
    }
  }

  const roue = new THREE.Group();
  roue.position.y = R + 1.4;
  for (const s of [-1, 1]) {
    const jante = new THREE.Mesh(new THREE.TorusGeometry(R, 0.14, 6, 40), acier);
    jante.position.z = s * 1.1;
    jante.castShadow = true;
    roue.add(jante);
  }
  const lampes = [];
  const matLampe = new THREE.MeshStandardMaterial({ color: 0xfff2d8, emissive: 0xffc978, emissiveIntensity: 0 });
  for (let i = 0; i < nac; i++) {
    const a = (i / nac) * Math.PI * 2;
    const rayon = new THREE.Mesh(new THREE.BoxGeometry(0.09, R * 2, 0.09), acier);
    rayon.rotation.z = a;
    roue.add(rayon);

    const n = new THREE.Group();
    const caisse = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.8, 1.25),
      new THREE.MeshStandardMaterial({ color: [0xc25a48, 0x4c7a86, 0xd0a24e, 0x6d7f57][i % 4], roughness: 0.8 }));
    caisse.position.y = -0.5;
    caisse.castShadow = true;
    const anse = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.045, 5, 12, Math.PI), acier);
    n.add(caisse, anse);
    n.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    n.userData.nacelle = true;
    roue.add(n);

    const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), matLampe);
    l.position.set(Math.cos(a + 0.13) * (R + 0.45), Math.sin(a + 0.13) * (R + 0.45), 0);
    roue.add(l);
  }
  lampes.push(matLampe);
  g.add(roue);
  return { groupe: g, roue, lampes, nacelles: roue.children.filter((c) => c.userData.nacelle) };
}

function guirlandes(points, hauteur, halo) {
  const groupe = new THREE.Group();
  const positions = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const seg = 14;
    for (let k = 0; k <= seg; k++) {
      const t = k / seg;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t + hauteur - Math.sin(t * Math.PI) * 1.15;
      positions.push(x, y, z);
    }
    positions.push(NaN, NaN, NaN);
  }
  const propres = [];
  for (let i = 0; i < positions.length; i += 3) {
    if (Number.isNaN(positions[i])) continue;
    propres.push(positions[i], positions[i + 1], positions[i + 2]);
  }
  const gPts = new THREE.BufferGeometry();
  gPts.setAttribute('position', new THREE.Float32BufferAttribute(propres, 3));
  const mPts = new THREE.PointsMaterial({
    map: halo, size: 1.5, sizeAttenuation: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffd79a,
  });
  const ampoules = new THREE.Points(gPts, mPts);
  groupe.add(ampoules);

  const fil = new THREE.LineSegments(
    (() => {
      const seg = [];
      for (let i = 0; i + 5 < propres.length; i += 3) seg.push(propres[i], propres[i + 1], propres[i + 2], propres[i + 3], propres[i + 4], propres[i + 5]);
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
      return gg;
    })(),
    new THREE.LineBasicMaterial({ color: 0x2e2a24, transparent: true, opacity: 0.5 }),
  );
  groupe.add(fil);
  return { groupe, mPts };
}

export function construireFoire(scene, data, terrain) {
  const f = data.fair;
  const g = new THREE.Group();
  g.name = 'foire';
  const rnd = rng(220922);
  const rayures = textureRayures('#2f6d74', '#f3e9d5');
  const lampes = [];
  const sol = (x, z) => terrain.at(x, z);

  /* --- la place elle-même : terre battue --- */
  const geoPlace = new THREE.RingGeometry(0.02, f.r + 6, 72, 10);
  {   // l'aire épouse le pré plutôt que de le trancher
    const p = geoPlace.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = f.x + p.getX(i), z = f.z - p.getY(i);
      p.setZ(i, terrain.at(x, z) - f.g);
    }
    geoPlace.computeVertexNormals();
  }
  const place = new THREE.Mesh(
    geoPlace,
    new THREE.MeshStandardMaterial({
      map: textureAireFoire(), color: 0xb2a382, roughness: 1, transparent: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  place.rotation.x = -Math.PI / 2;
  place.position.set(f.x, f.g + 0.07, f.z);
  place.receiveShadow = true;
  g.add(place);

  /* --- le manège au centre --- */
  const m = manege(rnd);
  m.groupe.position.set(f.x, sol(f.x, f.z) + 0.08, f.z);
  g.add(m.groupe);
  lampes.push(...m.lampes);

  /* --- la grande roue, en retrait --- */
  const rx = f.x - f.r * 0.58, rz = f.z + f.r * 0.46;
  const roue = grandeRoue();
  roue.groupe.position.set(rx, sol(rx, rz) + 0.08, rz);
  roue.groupe.rotation.y = 0.7;
  g.add(roue.groupe);
  lampes.push(...roue.lampes);

  /* --- les tréteaux en arc de cercle --- */
  const stands = 18;
  for (let i = 0; i < stands; i++) {
    const a = (i / stands) * Math.PI * 2 + 0.2;
    const r = f.r * (0.68 + (i % 2) * 0.17);
    const x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
    if (Math.hypot(x - rx, z - rz) < 14.5) continue;
    const s = stand(rnd, rayures);
    s.position.set(x, sol(x, z) + 0.05, z);
    s.rotation.y = -a + Math.PI / 2;
    g.add(s);
  }

  /* --- guirlandes entre mâts --- */
  const mats = [];
  const nMats = 9;
  for (let i = 0; i < nMats; i++) {
    const a = (i / nMats) * Math.PI * 2 + 0.55;
    const x = f.x + Math.cos(a) * (f.r + 3), z = f.z + Math.sin(a) * (f.r + 3);
    const y = sol(x, z);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.4, 7), bois(0x6a5a43));
    p.position.set(x, y + 2.7, z);
    p.castShadow = true;
    g.add(p);
    mats.push(new THREE.Vector3(x, y + 5.1, z));
  }
  const halo = textureHalo();
  const gl = guirlandes(mats, 0, halo);
  g.add(gl.groupe);

  /* --- la foule --- */
  const foule = [];
  const geoCorps = new THREE.CapsuleGeometry(0.17, 0.52, 3, 6);
  const nGens = 120;
  const inst = new THREE.InstancedMesh(geoCorps, new THREE.MeshStandardMaterial({ roughness: 0.95 }), nGens);
  inst.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nGens * 3), 3);
  inst.castShadow = true;
  inst.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < nGens; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 8 + rnd() * (f.r - 4);
    foule.push({ a, r, v: (rnd() - 0.5) * 0.09, ph: rnd() * 7 });
    col.setHSL(rnd(), 0.3 + rnd() * 0.35, 0.3 + rnd() * 0.3);
    inst.setColorAt(i, col);
  }
  g.add(inst);

  /* --- une lanterne au centre pour la nuit --- */
  const feu = new THREE.PointLight(0xffb964, 0, 95, 1.6);
  feu.position.set(f.x, f.g + 6.5, f.z);
  g.add(feu);
  const feu2 = new THREE.PointLight(0xffc27a, 0, 70, 1.7);
  feu2.position.set(rx, sol(rx, rz) + 10, rz);
  g.add(feu2);

  scene.add(g);

  const dummy = new THREE.Object3D();
  return {
    groupe: g,
    anime(dt, temps) {
      m.tournant.rotation.y += dt * 0.42;
      for (const c of m.chevaux) c.position.y = 0.9 + Math.sin(temps * 2.4 + c.userData.phase) * 0.32;
      roue.roue.rotation.z += dt * 0.16;
      for (const n of roue.nacelles) n.rotation.z = -roue.roue.rotation.z;
      for (let i = 0; i < foule.length; i++) {
        const p = foule[i];
        p.a += p.v * dt * 0.35;
        const x = f.x + Math.cos(p.a) * p.r;
        const z = f.z + Math.sin(p.a) * p.r;
        dummy.position.set(x, terrain.at(x, z) + 0.55 + Math.abs(Math.sin(temps * 3 + p.ph)) * 0.05, z);
        dummy.rotation.set(0, -p.a, 0);
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    },
    nuit(k) {
      for (const l of lampes) l.emissiveIntensity = 1.6 * k;
      gl.mPts.opacity = 0.95 * k;
      feu.intensity = 260 * k;
      feu2.intensity = 180 * k;
    },
  };
}
