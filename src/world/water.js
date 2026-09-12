// La Moine, ses biefs et les mares : surfaces triangulées, altitude suivant le fil de l'eau.
import * as THREE from '../lib/three.js';
import { triangulate } from '../lib/triangulate.js';
import { normalesEau } from '../lib/textures.js';

export function construireEau(scene, data) {
  const pos = [], uv = [], col = [];
  const riviere = new THREE.Color(0x527f8c);
  const mare = new THREE.Color(0x4d7b74);

  for (const p of data.water) {
    const r = p.r;
    const plan = r.map(([x, z]) => [x, z]);
    const idx = triangulate(plan);
    const c = p.k === 'river' ? riviere : mare;
    for (let i = 0; i < idx.length; i += 3) {
      for (const k of [idx[i], idx[i + 1], idx[i + 2]]) {
        pos.push(r[k][0], r[k][2], r[k][1]);
        uv.push(r[k][0] / 40, r[k][1] / 40);
        col.push(c.r, c.g, c.b);
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const normalMap = normalesEau();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.09, metalness: 0.02,
    normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 0.88, side: THREE.DoubleSide,
    envMapIntensity: 1.6,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'eau';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);

  return {
    mesh, materiau: mat,
    anime(t) {
      normalMap.offset.set((t * 0.0055) % 1, (t * 0.011) % 1);
    },
  };
}
