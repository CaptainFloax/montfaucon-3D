// Éclairage public : de simples halos posés le long des rues du bourg,
// bien moins coûteux que des centaines de lumières réelles.
import * as THREE from '../lib/three.js';
import { textureHalo } from '../lib/textures.js';

const RUES = new Set(['residential', 'secondary', 'tertiary', 'unclassified', 'living_street', 'pedestrian', 'primary']);

export function construireLampadaires(scene, data, terrain, noyaux) {
  const pts = [];
  const poteaux = [];
  for (const r of data.roads) {
    if (!RUES.has(r.k)) continue;
    let reste = 0;
    for (let i = 1; i < r.p.length; i++) {
      const [x0, z0] = r.p[i - 1], [x1, z1] = r.p[i];
      const L = Math.hypot(x1 - x0, z1 - z0);
      let t = reste;
      while (t < L) {
        const x = x0 + ((x1 - x0) * t) / L, z = z0 + ((z1 - z0) * t) / L;
        if (noyaux.some((n) => Math.hypot(x - n.x, z - n.z) < n.r)) {
          const y = terrain.at(x, z);
          pts.push(x, y + 4.6, z);
          poteaux.push([x, y, z]);
        }
        t += 38;
      }
      reste = t - L;
    }
  }
  if (!pts.length) return { maj() {} };

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const mat = new THREE.PointsMaterial({
    map: textureHalo(), size: 7.5, sizeAttenuation: true, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffcf94,
  });
  const halos = new THREE.Points(geo, mat);
  halos.frustumCulled = false;
  halos.renderOrder = 4;
  scene.add(halos);

  // les mâts, discrets de jour
  const inst = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.07, 0.1, 4.4, 5),
    new THREE.MeshStandardMaterial({ color: 0x3f4148, roughness: 0.7, metalness: 0.3 }),
    poteaux.length,
  );
  const d = new THREE.Object3D();
  poteaux.forEach(([x, y, z], i) => {
    d.position.set(x, y + 2.2, z);
    d.updateMatrix();
    inst.setMatrixAt(i, d.matrix);
  });
  inst.castShadow = false;
  inst.frustumCulled = false;
  scene.add(inst);

  return {
    halos, mats: inst, nombre: poteaux.length,
    maj(nuit) { mat.opacity = 0.9 * nuit; halos.visible = nuit > 0.02; },
  };
}
