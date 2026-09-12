// Les barques de la Moine : elles remontent le fil de l'eau le long d'une rive
// et redescendent par l'autre, en boucle fermée.
import * as THREE from '../lib/three.js';
import { rng } from '../lib/champ.js';

function coqueBarque() {
  const g = new THREE.Group();
  const L = 4.6, l = 1.32;

  const plan = new THREE.Shape();
  plan.moveTo(0, -L / 2);
  plan.bezierCurveTo(l * 0.62, -L * 0.33, l * 0.66, L * 0.2, 0, L / 2);
  plan.bezierCurveTo(-l * 0.66, L * 0.2, -l * 0.62, -L * 0.33, 0, -L / 2);

  const geo = new THREE.ExtrudeGeometry(plan, {
    depth: 0.5, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 2, curveSegments: 16,
  });
  geo.rotateX(-Math.PI / 2);
  const coque = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x6d4f33, roughness: 0.82 }));
  coque.position.y = -0.2;
  coque.castShadow = true;
  g.add(coque);

  const interieur = new THREE.Mesh(
    new THREE.ExtrudeGeometry(plan, { depth: 0.28, bevelEnabled: false, curveSegments: 14 }).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f2f20, roughness: 0.95 }),
  );
  interieur.scale.set(0.84, 1, 0.9);
  interieur.position.y = 0.02;
  g.add(interieur);

  const bancs = new THREE.MeshStandardMaterial({ color: 0x8a6e4b, roughness: 0.9 });
  for (const z of [-1.05, 0.35]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.3), bancs);
    b.position.set(0, 0.22, z);
    b.castShadow = true;
    g.add(b);
  }
  return g;
}

function batelier(teinte) {
  const g = new THREE.Group();
  const corps = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.5, 3, 8),
    new THREE.MeshStandardMaterial({ color: teinte, roughness: 0.9 }));
  corps.position.y = 0.55;
  corps.castShadow = true;
  const tete = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xd9ae86, roughness: 1 }));
  tete.position.y = 1.0;
  const chapeau = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0x4a4335, roughness: 1 }));
  chapeau.position.y = 1.12;
  const perche = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a7350, roughness: 1 }));
  perche.position.set(0.32, 0.9, -0.2);
  perche.rotation.z = 0.42;
  perche.rotation.x = 0.22;
  g.add(corps, tete, chapeau, perche);
  return { groupe: g, perche };
}

export function construireBarques(scene, data, nb = 8) {
  const brut = data.boatPath;
  if (brut.length < 8) return { anime() {} };

  // aller (rive droite) + retour (rive gauche) → circuit fermé
  const decale = (pts, cote) => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const L = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(p[0] + (-dz / L) * cote, p[2] + 0.14, p[1] + (dx / L) * cote);
  });
  const aller = decale(brut, 2.4);
  const retour = decale([...brut].reverse(), 2.4);
  const courbe = new THREE.CatmullRomCurve3(aller.concat(retour), true, 'centripetal', 0.4);
  courbe.arcLengthDivisions = 2400;
  const longueur = courbe.getLength();

  const rnd = rng(6021);
  const barques = [];
  const teintes = [0x6d5a7a, 0x7a4f42, 0x4c5f6b, 0x6f6a44, 0x55604f];
  for (let i = 0; i < nb; i++) {
    const g = new THREE.Group();
    const coque = coqueBarque();
    g.add(coque);
    const b = batelier(teintes[i % teintes.length]);
    b.groupe.position.set(0, 0.1, -0.55);
    g.add(b.groupe);

    // sillage
    const sillage = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 7, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xcfe2e6, transparent: true, opacity: 0.16, depthWrite: false }),
    );
    sillage.rotation.x = -Math.PI / 2;
    sillage.position.set(0, -0.12, 3.6);
    g.add(sillage);

    scene.add(g);
    barques.push({
      g, perche: b.perche,
      t: i / nb + rnd() * 0.02,
      v: (1.9 + rnd() * 0.8) / longueur,      // allure de barque : ~2 m/s
      phase: rnd() * Math.PI * 2,
    });
  }

  const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  return {
    barques,
    anime(dt, temps) {
      for (const b of barques) {
        b.t = (b.t + b.v * dt) % 1;
        courbe.getPointAt(b.t, p0);
        courbe.getPointAt((b.t + 0.0016) % 1, p1);
        const houle = Math.sin(temps * 1.5 + b.phase) * 0.045;
        b.g.position.set(p0.x, p0.y + houle, p0.z);
        b.g.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
        b.g.rotation.z = Math.sin(temps * 1.1 + b.phase) * 0.035;
        b.g.rotation.x = Math.cos(temps * 0.9 + b.phase) * 0.02;
        b.perche.rotation.z = 0.42 + Math.sin(temps * 2.2 + b.phase) * 0.35;
      }
    },
  };
}
