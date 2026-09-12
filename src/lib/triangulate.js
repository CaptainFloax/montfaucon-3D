// Triangulation d'un polygone simple par « ear clipping ».
// Suffisant ici : les emprises OSM sont petites et sans trou.

const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

function inTriangle(p, a, b, c) {
  const d1 = area2(p, a, b), d2 = area2(p, b, c), d3 = area2(p, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * @param {[number,number][]} ring contour fermé implicite, sens horaire ou trigo
 * @returns {number[]} indices de triangles dans le contour d'origine
 */
export function triangulate(ring) {
  const n = ring.length;
  if (n < 3) return [];
  let idx = [...Array(n).keys()];

  // on travaille en sens trigonométrique
  let a2 = 0;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n];
    a2 += p[0] * q[1] - q[0] * p[1];
  }
  if (a2 < 0) idx.reverse();

  const out = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < n * n + 40) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k - 1 + idx.length) % idx.length];
      const i1 = idx[k];
      const i2 = idx[(k + 1) % idx.length];
      const a = ring[i0], b = ring[i1], c = ring[i2];
      if (area2(a, b, c) <= 1e-9) continue;                 // sommet réflexe ou plat
      let ok = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inTriangle(ring[j], a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push(i0, i1, i2);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;                                    // polygone dégénéré : on s'arrête
  }
  if (idx.length === 3) out.push(idx[0], idx[1], idx[2]);
  return out;
}
