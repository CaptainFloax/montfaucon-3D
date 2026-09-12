// Voirie : rubans posés sur le relief, du chemin creux à la départementale.
import * as THREE from '../lib/three.js';

const STYLE = {
  motorway: 0x4a4640, trunk: 0x4a4640, primary: 0x4d4941, secondary: 0x504b43,
  tertiary: 0x534e46, unclassified: 0x565049, residential: 0x585249,
  living_street: 0x5b554c, pedestrian: 0x6d6355, service: 0x5d574e,
  track: 0x7d6d53, footway: 0x8a7a5f, path: 0x86775d, cycleway: 0x63594d, bridleway: 0x86775d,
};

export function construireVoirie(scene, data) {
  const pos = [], col = [], uv = [];
  const c = new THREE.Color();

  for (const r of data.roads) {
    const p = r.p, y = r.y, n = p.length;
    if (n < 2) continue;
    c.setHex(STYLE[r.k] ?? 0x585249);
    const demi = r.w / 2;
    const g = [];
    for (let i = 0; i < n; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const L = Math.hypot(dx, dz) || 1;
      dx /= L; dz /= L;
      const nx = -dz, nz = dx;
      g.push([
        [p[i][0] + nx * demi, y[i], p[i][1] + nz * demi],
        [p[i][0] - nx * demi, y[i], p[i][1] - nz * demi],
      ]);
    }
    let s = 0;
    for (let i = 0; i < n - 1; i++) {
      const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]);
      const [aL, aR] = g[i], [bL, bR] = g[i + 1];
      const v0 = s / 6, v1 = (s + L) / 6;
      pos.push(...aL, ...aR, ...bR, ...aL, ...bR, ...bL);
      uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
      s += L;
    }
    // tablier des ponts : petits parapets
    if (r.br) {
      for (let i = 0; i < n - 1; i++) {
        for (const cote of [1, -1]) {
          const a = g[i][cote > 0 ? 0 : 1], b = g[i + 1][cote > 0 ? 0 : 1];
          const hp = 0.95;
          pos.push(a[0], a[1], a[2], b[0], b[1], b[2], b[0], b[1] + hp, b[2],
                   a[0], a[1], a[2], b[0], b[1] + hp, b[2], a[0], a[1] + hp, a[2]);
          uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
          for (let k = 0; k < 6; k++) col.push(0.62, 0.58, 0.5);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.9, metalness: 0.02,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'voirie';
  mesh.receiveShadow = true;
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return { mesh, materiau: mat };
}
