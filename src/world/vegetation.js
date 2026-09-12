// Bocage : arbres de haie, boisements, ceps de vigne — en instanciation GPU.
import * as THREE from '../lib/three.js';
import { rng } from '../lib/champ.js';

export function construireVegetation(scene, data, terrain) {
  const arbres = data.trees;
  const feuillus = [], coniferes = [], troncs = [];
  const rnd = rng(190449);

  for (const [x, z, kind, s] of arbres) {
    const y = terrain.at(x, z);
    const item = { x, y, z, s, r: rnd() * Math.PI * 2, t: rnd() };
    if (kind === 1) coniferes.push(item);
    else feuillus.push(item);
    if (kind !== 3) troncs.push({ ...item, kind });
  }

  const maillage = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
    m.castShadow = true;
    m.receiveShadow = true;
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    return m;
  };

  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const matFeuille = new THREE.MeshStandardMaterial({ roughness: 0.94, metalness: 0, flatShading: true, vertexColors: false });
  const matAiguille = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });
  const matTronc = new THREE.MeshStandardMaterial({ color: 0x5c4a37, roughness: 1 });

  const mFeuillus = maillage(new THREE.IcosahedronGeometry(1, 0), matFeuille, feuillus.length);
  const mConiferes = maillage(new THREE.ConeGeometry(1, 2.6, 7), matAiguille, coniferes.length);
  const mTroncs = maillage(new THREE.CylinderGeometry(0.13, 0.22, 1, 5), matTronc, troncs.length);

  feuillus.forEach((a, i) => {
    const h = 2.4 + a.s * 4.2;
    const r = 1.15 + a.s * 1.55;
    dummy.position.set(a.x, a.y + h * 0.72, a.z);
    dummy.rotation.set((a.t - 0.5) * 0.3, a.r, (a.t - 0.5) * 0.25);
    dummy.scale.set(r, r * (0.72 + a.t * 0.42), r * (0.9 + a.t * 0.2));
    dummy.updateMatrix();
    mFeuillus.setMatrixAt(i, dummy.matrix);
    col.setHSL(0.245 + a.t * 0.055, 0.33 + a.t * 0.16, 0.22 + a.t * 0.13);
    mFeuillus.setColorAt(i, col);
  });
  coniferes.forEach((a, i) => {
    const h = 4 + a.s * 5;
    dummy.position.set(a.x, a.y + h * 0.5, a.z);
    dummy.rotation.set(0, a.r, 0);
    dummy.scale.set(1 + a.s * 0.5, h / 2.6, 1 + a.s * 0.5);
    dummy.updateMatrix();
    mConiferes.setMatrixAt(i, dummy.matrix);
    col.setHSL(0.31 + a.t * 0.03, 0.3, 0.15 + a.t * 0.07);
    mConiferes.setColorAt(i, col);
  });
  troncs.forEach((a, i) => {
    const h = (a.kind === 1 ? 2 : 2.2) + a.s * 2.4;
    dummy.position.set(a.x, a.y + h / 2, a.z);
    dummy.rotation.set(0, a.r, 0);
    dummy.scale.set(0.7 + a.s * 0.6, h, 0.7 + a.s * 0.6);
    dummy.updateMatrix();
    mTroncs.setMatrixAt(i, dummy.matrix);
    col.setHSL(0.08, 0.2, 0.16 + a.t * 0.07);
    mTroncs.setColorAt(i, col);
  });

  for (const m of [mFeuillus, mConiferes, mTroncs]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    scene.add(m);
  }
  return { mFeuillus, mConiferes, mTroncs, materiaux: [matFeuille, matAiguille, matTronc] };
}
