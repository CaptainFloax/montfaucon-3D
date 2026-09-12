// Échantillonnage du MNT et petits utilitaires numériques partagés.
export class Terrain {
  constructor(data, world) {
    this.n = data.n;
    this.h = Float32Array.from(data.h);
    this.w = world.w;
    this.d = world.h;
    this.min = data.min;
    this.max = data.max;
  }
  /** Altitude interpolée (bilinéaire) au point local (x, z). */
  at(x, z) {
    const n = this.n;
    const u = ((x + this.w / 2) / this.w) * (n - 1);
    const v = ((this.d / 2 - z) / this.d) * (n - 1);
    const i = Math.min(n - 2, Math.max(0, Math.floor(u)));
    const j = Math.min(n - 2, Math.max(0, Math.floor(v)));
    const fu = Math.min(1, Math.max(0, u - i));
    const fv = Math.min(1, Math.max(0, v - j));
    const h = this.h;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return a * (1 - fu) * (1 - fv) + b * fu * (1 - fv) + c * (1 - fu) * fv + d * fu * fv;
  }
  /** Normale approchée, utile pour orienter ce qui se pose au sol. */
  slope(x, z, e = 12) {
    const hx = this.at(x + e, z) - this.at(x - e, z);
    const hz = this.at(x, z + e) - this.at(x, z - e);
    return Math.hypot(hx, hz) / (2 * e);
  }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);

/** Bruit de valeur 2D déterministe, doux — pour casser les aplats. */
export function noise2(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const fx = x - i, fy = y - j;
  const r = (a, b) => {
    let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
    h = (h ^ (h >>> 13)) >>> 0;
    return h / 4294967296;
  };
  const u = smooth(fx), v = smooth(fy);
  return lerp(lerp(r(i, j), r(i + 1, j), u), lerp(r(i, j + 1), r(i + 1, j + 1), u), v);
}

/** Générateur pseudo-aléatoire reproductible (xorshift32). */
export function rng(seed) {
  let x = seed >>> 0 || 2463534242;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}
