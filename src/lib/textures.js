// Textures procédurales fabriquées au chargement : aucune image à télécharger,
// et le rendu reste cohérent quel que soit l'écran.
import * as THREE from './three.js';
import { rng, noise2, clamp } from './champ.js';

const cv = (w, h) => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
};

// Toutes ces textures sont relues pixel par pixel (getImageData) juste après
// avoir été dessinées : on annonce donc des lectures fréquentes, sinon le
// navigateur rapatrie le tampon depuis le GPU à chaque appel.
const tex = (canvas, repeat = [1, 1], srgb = true) => {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
};

/** Convertit un champ de hauteurs (canvas en niveaux de gris) en carte de normales. */
export function normalesDepuisRelief(source, force = 2.2) {
  const W = source.width, H = source.height;
  const src = source.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const h = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  const c = cv(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * force;
    const dy = (h(x, y + 1) - h(x, y - 1)) * force;
    const l = Math.hypot(dx, dy, 1);
    const k = (y * W + x) * 4;
    img.data[k] = ((-dx / l) * 0.5 + 0.5) * 255;
    img.data[k + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
    img.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, [1, 1], false);
}

/** Bruit fractal gris, utilisé comme relief de détail. */
function reliefBruit(W, echelles) {
  const c = cv(W, W), ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    let v = 0, somme = 0;
    for (const [f, a] of echelles) { v += noise2(x / f, y / f) * a; somme += a; }
    const g = clamp((v / somme) * 255, 0, 255);
    const k = (y * W + x) * 4;
    img.data[k] = img.data[k + 1] = img.data[k + 2] = g;
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Micro-relief du sol : mottes, herbe, cailloux. */
export function normalesSol() {
  return normalesDepuisRelief(reliefBruit(256, [[2.4, 0.44], [7, 0.33], [21, 0.23]]), 2.1);
}

/* --------------------------------------------------------------- façades */
// Une tuile = 4 travées × 4 niveaux. Les UV des murs sont calculés pour que
// 1 travée ≈ 3,2 m et 1 niveau ≈ 2,95 m : les fenêtres tombent à l'échelle.
const BAIES = 4, NIVEAUX = 4, PX = 128;

function dessineFacade(ctx, mode) {
  const lit = mode === 'lit', relief = mode === 'relief';
  const W = BAIES * PX, H = NIVEAUX * PX;
  ctx.fillStyle = lit ? '#000' : relief ? '#808080' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  if (relief) {
    // léger bossage de la maçonnerie sous l'enduit
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 128 + (noise2(x / 6, y / 6) - 0.5) * 16 + (noise2(x / 22, y / 22) - 0.5) * 20;
      if ((y % 26) < 1.4) v -= 26;                        // lit de pierre creusé
      const k = (y * W + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp(v, 0, 255);
    }
    ctx.putImageData(img, 0, 0);
  } else if (!lit) {
    // grain de pierre + joints horizontaux discrets
    const img = ctx.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const n = noise2(x / 9, y / 9) * 0.5 + noise2(x / 33, y / 33) * 0.5;
        let v = 246 + (n - 0.5) * 26;
        if ((y % 26) < 1.2) v -= 11;                         // lit de pierre
        const k = (y * W + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = clamp(v, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  const rnd = rng(20250922);
  for (let n = 0; n < NIVEAUX; n++) {
    for (let b = 0; b < BAIES; b++) {
      const allumee = rnd() < 0.42 && n < NIVEAUX;
      const rdc = n === NIVEAUX - 1;                         // v=0 en bas → dernier rang = rez
      const ox = b * PX, oy = n * PX;
      const ww = rdc && b % 3 === 1 ? 40 : 44;
      const hh = rdc && b % 3 === 1 ? 82 : 60;
      const x = ox + (PX - ww) / 2;
      const y = oy + (rdc ? PX - hh - 10 : (PX - hh) / 2);

      if (relief) {
        ctx.fillStyle = '#b9b9b9';                        // encadrement en saillie
        ctx.fillRect(x - 6, y - 6, ww + 12, hh + 12);
        ctx.fillStyle = '#3c3c3c';                        // tableau en retrait
        ctx.fillRect(x, y, ww, hh);
        if (!rdc || b % 3 !== 1) {
          ctx.fillStyle = '#cfcfcf';                      // volets épais
          ctx.fillRect(x - 17, y - 3, 15, hh + 6);
          ctx.fillRect(x + ww + 2, y - 3, 15, hh + 6);
          ctx.fillStyle = '#a8a8a8';
          for (let sV = 0; sV < hh; sV += 6) {
            ctx.fillRect(x - 17, y - 3 + sV, 15, 2.4);
            ctx.fillRect(x + ww + 2, y - 3 + sV, 15, 2.4);
          }
        }
        ctx.fillStyle = '#d8d8d8';                        // appui débordant
        ctx.fillRect(x - 7, y + hh + 5, ww + 14, 5);
        continue;
      }

      if (lit) {
        if (!allumee) continue;
        const g = ctx.createRadialGradient(x + ww / 2, y + hh / 2, 2, x + ww / 2, y + hh / 2, ww * 1.15);
        g.addColorStop(0, '#fff4d8');
        g.addColorStop(0.55, '#e8bf78');
        g.addColorStop(1, '#00000000');
        ctx.fillStyle = g;
        ctx.fillRect(x - 12, y - 12, ww + 24, hh + 24);
        ctx.fillStyle = '#fffaf0';
        ctx.fillRect(x + 3, y + 3, ww - 6, hh - 6);
        continue;
      }

      // encadrement de pierre claire
      ctx.fillStyle = '#fdfaf2';
      ctx.fillRect(x - 5, y - 5, ww + 10, hh + 10);
      // tableau sombre
      ctx.fillStyle = rdc && b % 3 === 1 ? '#4b3a2c' : '#2f3540';
      ctx.fillRect(x, y, ww, hh);
      // croisillon
      ctx.strokeStyle = '#e9e3d6';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + ww / 2, y); ctx.lineTo(x + ww / 2, y + hh);
      if (!rdc || b % 3 !== 1) { ctx.moveTo(x, y + hh * 0.42); ctx.lineTo(x + ww, y + hh * 0.42); }
      ctx.stroke();
      // volets battants
      if (!rdc || b % 3 !== 1) {
        ctx.fillStyle = ['#8d9e9b', '#7b8b93', '#93a08d', '#6f7f86'][(b + n) % 4];
        ctx.fillRect(x - 17, y - 3, 15, hh + 6);
        ctx.fillRect(x + ww + 2, y - 3, 15, hh + 6);
        ctx.fillStyle = 'rgba(0,0,0,.14)';
        for (let s = 0; s < hh; s += 6) {
          ctx.fillRect(x - 17, y - 3 + s, 15, 2);
          ctx.fillRect(x + ww + 2, y - 3 + s, 15, 2);
        }
      }
      // appui
      ctx.fillStyle = '#efe9dc';
      ctx.fillRect(x - 7, y + hh + 5, ww + 14, 5);
    }
  }
}

export function texturesFacade() {
  const c1 = cv(BAIES * PX, NIVEAUX * PX);
  dessineFacade(c1.getContext('2d', { willReadFrequently: true }), 'couleur');
  const c2 = cv(BAIES * PX, NIVEAUX * PX);
  dessineFacade(c2.getContext('2d', { willReadFrequently: true }), 'lit');
  const c3 = cv(BAIES * PX, NIVEAUX * PX);
  dessineFacade(c3.getContext('2d', { willReadFrequently: true }), 'relief');
  return { map: tex(c1), emissive: tex(c2), normal: normalesDepuisRelief(c3, 3.2) };
}

/* ----------------------------------------------------------------- toits */
const ARD_W = 512, ARD_RANG = 26, ARD_LARG = 34;

function dessineArdoise(ctx, relief) {
  ctx.fillStyle = relief ? '#8c8c8c' : '#ffffff';
  ctx.fillRect(0, 0, ARD_W, ARD_W);
  const rnd = rng(7717);
  for (let y = -ARD_RANG; y < ARD_W + ARD_RANG; y += ARD_RANG) {
    const dec = ((Math.round(y / ARD_RANG) % 2) + 2) % 2 * (ARD_LARG / 2);
    for (let x = -ARD_LARG; x < ARD_W + ARD_LARG; x += ARD_LARG) {
      const t = rnd();
      if (relief) {
        // chaque ardoise déborde sur le rang du dessous : marche d'escalier
        ctx.fillStyle = `rgb(${(150 + t * 26) | 0},${(150 + t * 26) | 0},${(150 + t * 26) | 0})`;
        ctx.fillRect(x + dec + 0.5, y + 0.5, ARD_LARG - 1, ARD_RANG * 1.8);
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(x + dec, y + ARD_RANG * 1.72, ARD_LARG, 2.4);    // ombre du recouvrement
        ctx.fillRect(x + dec - 0.6, y, 1.6, ARD_RANG * 1.8);          // joint vertical
      } else {
        const v = (0.8 + t * 0.28) * 255;
        ctx.fillStyle = `rgb(${v | 0},${(v * 1.01) | 0},${(v * 1.04) | 0})`;
        ctx.fillRect(x + dec + 0.5, y + 0.5, ARD_LARG - 1, ARD_RANG * 1.8);
        ctx.fillStyle = 'rgba(255,255,255,.10)';                       // arête qui accroche la lumière
        ctx.fillRect(x + dec + 0.5, y + 0.5, ARD_LARG - 1, 1.6);
        ctx.fillStyle = 'rgba(0,0,0,.17)';
        ctx.fillRect(x + dec, y + ARD_RANG * 1.66, ARD_LARG, 3);
      }
    }
  }
}

export function textureArdoise() {
  const c = cv(ARD_W, ARD_W);
  dessineArdoise(c.getContext('2d', { willReadFrequently: true }), false);
  return tex(c, [1, 1]);
}

export function normalesArdoise() {
  const c = cv(ARD_W, ARD_W);
  dessineArdoise(c.getContext('2d', { willReadFrequently: true }), true);
  return normalesDepuisRelief(c, 2.6);
}

/* ------------------------------------------------------------------- sol */
export function textureSol() {
  const W = 1024, c = cv(W, W), ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      // trois octaves : la tache de parcelle, la touffe, le grain
      const n =
        noise2(x / 128, y / 128) * 0.42 +
        noise2(x / 41, y / 41) * 0.32 +
        noise2(x / 13, y / 13) * 0.18 +
        noise2(x / 4.5, y / 4.5) * 0.08;
      const v = clamp(176 + (n - 0.5) * 150, 70, 255);
      // léger virage chaud dans les creux, froid sur les bosses
      const chaud = clamp((n - 0.5) * 1.6, -1, 1);
      const k = (y * W + x) * 4;
      img.data[k] = clamp(v * (1.03 - chaud * 0.03), 0, 255);
      img.data[k + 1] = v;
      img.data[k + 2] = clamp(v * (0.93 + chaud * 0.05), 0, 255);
      img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, [34, 34]);
}

/* ------------------------------------------------------------------- eau */
export function normalesEau() {
  const W = 256, c = cv(W, W), ctx = c.getContext('2d', { willReadFrequently: true });
  const hmap = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    hmap[y * W + x] =
      noise2(x / 13, y / 13) * 0.55 + noise2(x / 31, y / 31) * 0.3 + noise2(x / 5, y / 5) * 0.15;
  }
  const img = ctx.createImageData(W, W);
  const H = (x, y) => hmap[((y + W) % W) * W + ((x + W) % W)];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.4;
    const dy = (H(x, y + 1) - H(x, y - 1)) * 2.4;
    const l = Math.hypot(dx, dy, 1);
    const k = (y * W + x) * 4;
    img.data[k] = ((-dx / l) * 0.5 + 0.5) * 255;
    img.data[k + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
    img.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return tex(c, [26, 26], false);
}

/* ------------------------------------------------------- toile de store */
export function textureRayures(a = '#c9352e', b = '#f4ecdc') {
  const W = 64, H = 8, c = cv(W, H), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = b; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = a;
  for (let x = 0; x < W; x += 16) ctx.fillRect(x, 0, 8, H);
  return tex(c, [1, 1]);
}

/* ----------------------------------------------- terre battue de la foire */
export function textureAireFoire() {
  const W = 512, c = cv(W, W), ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(W, W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const n = noise2(x / 11, y / 11) * 0.45 + noise2(x / 37, y / 37) * 0.55;
    const v = clamp(190 + (n - 0.5) * 90, 60, 255);
    // fondu circulaire : l'aire se perd dans l'herbe du pré
    const r = Math.hypot(x - W / 2, y - W / 2) / (W / 2);
    const bord = clamp((0.99 - r) / 0.24, 0, 1);
    const grain = 0.55 + noise2(x / 5.5, y / 5.5) * 0.9;
    const a = clamp(bord * grain, 0, 1);
    const k = (y * W + x) * 4;
    img.data[k] = v * 1.04; img.data[k + 1] = v * 0.96; img.data[k + 2] = v * 0.8;
    img.data[k + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* ------------------------------------------- pastille lumineuse (points) */
export function textureHalo() {
  const W = 64, c = cv(W, W), ctx = c.getContext('2d', { willReadFrequently: true });
  const g = ctx.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,236,196,.85)');
  g.addColorStop(1, 'rgba(255,210,140,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, W);
  return tex(c);
}
