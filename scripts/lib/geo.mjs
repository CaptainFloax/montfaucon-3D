// Petites fonctions géométriques partagées par le préprocesseur.
export const R_LAT = 110574;                       // mètres par degré de latitude
export const rLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

export function makeProjector(originLat, originLon) {
  const kx = rLon(originLat);
  return (lat, lon) => [(lon - originLon) * kx, -(lat - originLat) * R_LAT];
}

export function signedArea(ring) {
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

export function centroid(ring) {
  const a = signedArea(ring);
  if (Math.abs(a) < 1e-9) {
    const s = ring.reduce((p, q) => [p[0] + q[0], p[1] + q[1]], [0, 0]);
    return [s[0] / ring.length, s[1] / ring.length];
  }
  let cx = 0, cz = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, z1] = ring[i];
    const [x2, z2] = ring[(i + 1) % n];
    const f = x1 * z2 - x2 * z1;
    cx += (x1 + x2) * f;
    cz += (z1 + z2) * f;
  }
  return [cx / (6 * a), cz / (6 * a)];
}

export function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

/** Rectangle d'aire minimale (rotating calipers) → {cx, cz, w, d, angle}. */
export function minAreaRect(ring) {
  const hull = convexHull(ring);
  if (hull.length < 3) {
    const c = centroid(ring);
    return { cx: c[0], cz: c[1], w: 4, d: 4, angle: 0, area: 16 };
  }
  let best = null;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(-ang), s = Math.sin(-ang);
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const [x, z] of hull) {
      const u = x * c - z * s, v = x * s + z * c;
      if (u < minU) minU = u; if (u > maxU) maxU = u;
      if (v < minV) minV = v; if (v > maxV) maxV = v;
    }
    const w = maxU - minU, d = maxV - minV, area = w * d;
    if (!best || area < best.area) {
      const cu = (minU + maxU) / 2, cv = (minV + maxV) / 2;
      const cc = Math.cos(ang), ss = Math.sin(ang);
      best = { area, w, d, angle: ang, cx: cu * cc - cv * ss, cz: cu * ss + cv * cc };
    }
  }
  return best;
}

export function polyArea(ring) { return Math.abs(signedArea(ring)); }

export function segLen(pts) {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return L;
}

/** Rééchantillonne une polyligne à pas constant. */
export function resample(pts, step) {
  if (pts.length < 2) return pts.slice();
  const out = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    if (L < 1e-6) continue;
    let t = step - carry;
    while (t <= L) {
      out.push([x0 + ((x1 - x0) * t) / L, z0 + ((z1 - z0) * t) / L]);
      t += step;
    }
    carry = L - (t - step);
  }
  const last = pts[pts.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > step * 0.4) out.push(last);
  return out;
}

/** Lissage par moyenne glissante (préserve les extrémités). */
export function smoothPath(pts, passes = 2) {
  let p = pts.map((q) => q.slice());
  for (let k = 0; k < passes; k++) {
    const q = p.map((v) => v.slice());
    for (let i = 1; i < p.length - 1; i++) {
      q[i][0] = (p[i - 1][0] + 2 * p[i][0] + p[i + 1][0]) / 4;
      q[i][1] = (p[i - 1][1] + 2 * p[i][1] + p[i + 1][1]) / 4;
    }
    p = q;
  }
  return p;
}

/** Assemble des tronçons OSM bout à bout en polylignes continues. */
export function chainWays(ways, tol = 6) {
  const segs = ways.map((w) => w.slice());
  const out = [];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  while (segs.length) {
    let cur = segs.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        const head = cur[0], tail = cur[cur.length - 1];
        const sh = s[0], st = s[s.length - 1];
        if (d(tail, sh) < tol) cur = cur.concat(s.slice(1));
        else if (d(tail, st) < tol) cur = cur.concat(s.slice(0, -1).reverse());
        else if (d(head, st) < tol) cur = s.slice(0, -1).concat(cur);
        else if (d(head, sh) < tol) cur = s.slice(1).reverse().concat(cur);
        else continue;
        segs.splice(i, 1); grew = true; break;
      }
    }
    out.push(cur);
  }
  return out.sort((a, b) => segLen(b) - segLen(a));
}

/** Hachage déterministe → [0,1[ : mêmes couleurs à chaque rechargement. */
export function hash01(n) {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function pointInRing(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
