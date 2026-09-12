// Course du soleil, couleurs du ciel, lumières et bascule jour/nuit.
// Date de référence : le 22 septembre — le jour de la Saint-Maurice.
import * as THREE from './lib/three.js';
import { clamp, lerp, invLerp, rng } from './lib/champ.js';

const LAT = 47.0925 * Math.PI / 180;
const DECL = 0.5 * Math.PI / 180;                 // déclinaison au ~22 septembre

export function positionSoleil(heures) {
  const H = ((heures - 12) * 15) * Math.PI / 180;
  const sinAlt = Math.sin(LAT) * Math.sin(DECL) + Math.cos(LAT) * Math.cos(DECL) * Math.cos(H);
  const alt = Math.asin(clamp(sinAlt, -1, 1));
  let cosAz = (Math.sin(DECL) - Math.sin(LAT) * sinAlt) / (Math.cos(LAT) * Math.cos(alt) || 1e-6);
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (H > 0) az = Math.PI * 2 - az;
  return {
    alt, az,
    dir: new THREE.Vector3(Math.cos(alt) * Math.sin(az), Math.sin(alt), -Math.cos(alt) * Math.cos(az)),
  };
}

/* --- palettes de ciel, échelonnées sur la hauteur du soleil --- */
const PALETTE = [
  { a: -90, zenith: 0x060a16, horizon: 0x0d1524, sol: 0x000000, hemi: 0x121a2c },
  { a: -14, zenith: 0x0d1630, horizon: 0x24304c, sol: 0x000000, hemi: 0x1d2740 },
  { a: -6,  zenith: 0x25325e, horizon: 0x9a6f74, sol: 0x2b2438, hemi: 0x3c4568 },
  { a: -1.5, zenith: 0x3a4d82, horizon: 0xe2926b, sol: 0xff9a52, hemi: 0x6a6f86 },
  { a: 3,   zenith: 0x4a6fa8, horizon: 0xf3bb85, sol: 0xffb970, hemi: 0x93a0b4 },
  { a: 12,  zenith: 0x4b83c0, horizon: 0xd5dfe6, sol: 0xffe0b4, hemi: 0xbfcbd6 },
  { a: 30,  zenith: 0x4a88cf, horizon: 0xc3d8e8, sol: 0xfff2dd, hemi: 0xcfdcea },
  { a: 90,  zenith: 0x3f81cf, horizon: 0xbdd6ea, sol: 0xfff7ea, hemi: 0xd4e1ee },
];

function melange(altDeg) {
  let i = 0;
  while (i < PALETTE.length - 2 && altDeg > PALETTE[i + 1].a) i++;
  const a = PALETTE[i], b = PALETTE[i + 1];
  const t = clamp((altDeg - a.a) / (b.a - a.a), 0, 1);
  const mix = (ka) => new THREE.Color(a[ka]).lerp(new THREE.Color(b[ka]), t);
  return { zenith: mix('zenith'), horizon: mix('horizon'), sol: mix('sol'), hemi: mix('hemi') };
}

const VS = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = `
uniform vec3 zenith, horizon, soleilCouleur;
uniform vec3 soleilDir;
uniform float halo, voile;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y * 1.05 + 0.06, 0.0, 1.0);
  vec3 ciel = mix(horizon, zenith, pow(h, 0.55));
  float cos_ = clamp(dot(d, normalize(soleilDir)), 0.0, 1.0);
  ciel += soleilCouleur * pow(cos_, 7.0) * 0.35 * halo;
  ciel += soleilCouleur * pow(cos_, 900.0) * 8.0 * halo;
  ciel = mix(ciel, vec3(0.56, 0.59, 0.63) * (0.22 + 0.78 * h), voile);
  gl_FragColor = vec4(ciel, 1.0);
}`;

export function construireCiel(scene, renderer) {
  const uniforms = {
    zenith: { value: new THREE.Color(0x3f81cf) },
    horizon: { value: new THREE.Color(0xbdd6ea) },
    soleilCouleur: { value: new THREE.Color(0xfff7ea) },
    soleilDir: { value: new THREE.Vector3(0, 1, 0) },
    halo: { value: 1 },
    voile: { value: 0 },
  };
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, side: THREE.BackSide, depthWrite: false, fog: false }),
  );
  dome.scale.setScalar(7000);
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  scene.add(dome);

  /* --- étoiles --- */
  const N = 1400, pts = new Float32Array(N * 3), tail = new Float32Array(N);
  const rnd = rng(31415);
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    pts[i * 3] = Math.cos(a) * r * 5200;
    pts[i * 3 + 1] = Math.abs(u) * 5200 + 40;
    pts[i * 3 + 2] = Math.sin(a) * r * 5200;
    tail[i] = 6 + rnd() * 16;
  }
  const gEtoiles = new THREE.BufferGeometry();
  gEtoiles.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  gEtoiles.setAttribute('size', new THREE.BufferAttribute(tail, 1));
  const mEtoiles = new THREE.PointsMaterial({ color: 0xdfe8ff, size: 11, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false });
  const etoiles = new THREE.Points(gEtoiles, mEtoiles);
  etoiles.frustumCulled = false;
  etoiles.renderOrder = -9;
  scene.add(etoiles);

  /* --- lumières --- */
  const soleil = new THREE.DirectionalLight(0xfff7ea, 3);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(4096, 4096);
  soleil.shadow.camera.near = 1;
  soleil.shadow.camera.far = 2600;
  soleil.shadow.bias = -0.00012;
  soleil.shadow.normalBias = 0.06;
  let portee = 0;
  // L'étendue de la carte d'ombre suit l'éloignement de la caméra : de près on
  // garde des ombres franches, de loin on couvre tout le bourg.
  function cadrerOmbre(distanceCamera) {
    const p = clamp(distanceCamera * 1.9, 150, 900);
    if (Math.abs(p - portee) < portee * 0.08) return;
    portee = p;
    const c = soleil.shadow.camera;
    c.left = -p; c.right = p; c.top = p; c.bottom = -p;
    // profondeur : la lumière est à 900 m, le terrain peut s'étaler de part et d'autre
    c.near = Math.max(1, 900 - p * 1.55 - 140);
    c.far = 900 + p * 1.55 + 420;
    c.updateProjectionMatrix();
  }
  cadrerOmbre(900);
  scene.add(soleil, soleil.target);

  const lune = new THREE.DirectionalLight(0x9fb6dd, 0);
  scene.add(lune, lune.target);

  const hemi = new THREE.HemisphereLight(0xd4e1ee, 0x5c5b46, 0.55);
  scene.add(hemi);

  const ambiance = new THREE.AmbientLight(0xffffff, 0.08);
  scene.add(ambiance);

  scene.fog = new THREE.FogExp2(0xbdd6ea, 0.00028);

  /* --- carte d'environnement tirée du ciel : c'est elle qui donne son éclat
         à l'eau, aux ardoises et aux verrières --- */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sceneEnv = new THREE.Scene();
  sceneEnv.add(new THREE.Mesh(new THREE.SphereGeometry(80, 32, 20), dome.material));
  let envRT = null, envAlt = -999, envPluie = -1, envDate = 0;
  function majEnvironnement(altDeg, pluie) {
    const t = performance.now();
    if (t - envDate < 220) return;
    if (envRT && Math.abs(altDeg - envAlt) < 1.4 && Math.abs(pluie - envPluie) < 0.08) return;
    envAlt = altDeg; envPluie = pluie; envDate = t;
    const rt = pmrem.fromScene(sceneEnv, 0, 1, 400);
    if (envRT) envRT.dispose();
    envRT = rt;
    scene.environment = rt.texture;
  }

  return {
    dome, soleil, lune, hemi, ambiance, etoiles, uniforms,
    /**
     * @param {number} heures 0→24
     * @param {number} pluie 0→1
     * @param {THREE.Vector3} centre cible de la caméra (pour recadrer l'ombre)
     * @param {number} distanceCamera éloignement de la caméra, en mètres
     */
    maj(heures, pluie, centre, distanceCamera = 600) {
      cadrerOmbre(distanceCamera);
      const s = positionSoleil(heures);
      const altDeg = s.alt * 180 / Math.PI;
      const p = melange(altDeg);
      const jour = invLerp(-6, 6, altDeg);              // 0 nuit, 1 jour
      const nuit = 1 - jour;

      // voile de pluie : on désature et on éteint
      const grisH = new THREE.Color(0x9aa3ad), grisZ = new THREE.Color(0x717b86);
      const horizon = p.horizon.clone().lerp(grisH, pluie * 0.72 * jour + pluie * 0.25);
      const zenith = p.zenith.clone().lerp(grisZ, pluie * 0.68 * jour + pluie * 0.25);

      uniforms.zenith.value.copy(zenith);
      uniforms.horizon.value.copy(horizon);
      uniforms.soleilCouleur.value.copy(p.sol);
      uniforms.soleilDir.value.copy(s.dir);
      uniforms.halo.value = (1 - pluie * 0.92) * clamp(jour * 1.3, 0, 1);
      uniforms.voile.value = pluie * 0.4;

      scene.fog.color.copy(horizon);
      scene.fog.density = lerp(0.00016, 0.00046, nuit) + pluie * 0.00068;

      const D = 900;
      soleil.position.copy(centre).addScaledVector(s.dir, D);
      soleil.target.position.copy(centre);
      soleil.target.updateMatrixWorld();
      const forceJour = clamp(invLerp(-2.5, 9, altDeg), 0, 1);
      soleil.intensity = forceJour * (0.85 + 2.35 * clamp(invLerp(0, 45, altDeg), 0, 1)) * (1 - pluie * 0.86);
      soleil.color.copy(p.sol).lerp(new THREE.Color(0xffffff), clamp(invLerp(4, 30, altDeg), 0, 1) * 0.4);
      soleil.castShadow = soleil.intensity > 0.06;

      lune.position.copy(centre).add(new THREE.Vector3(-s.dir.x, Math.abs(s.dir.y) * 0.75 + 0.35, -s.dir.z).multiplyScalar(D));
      lune.target.position.copy(centre);
      lune.target.updateMatrixWorld();
      lune.intensity = nuit * 0.8 * (1 - pluie * 0.7);

      hemi.color.copy(p.hemi).lerp(grisH, pluie * 0.5);
      hemi.groundColor.set(0x4a4a38).lerp(new THREE.Color(0x2a3038), nuit);
      hemi.intensity = lerp(0.1, 0.34, jour) + pluie * 0.3 * jour;
      ambiance.intensity = lerp(0.075, 0.09, jour) + pluie * 0.05;

      mEtoiles.opacity = clamp(invLerp(2, -9, altDeg), 0, 1) * (1 - pluie * 0.95);
      etoiles.position.copy(centre);
      dome.position.copy(centre);

      renderer.toneMappingExposure = lerp(0.8, 1.02, jour) * (1 - pluie * 0.14);
      majEnvironnement(altDeg, pluie);
      return { altDeg, jour, nuit, s };
    },
  };
}
