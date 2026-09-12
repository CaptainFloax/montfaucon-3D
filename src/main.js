// Montfaucon-Montigné en 3D — assemblage de la scène et boucle de rendu.
import * as THREE from './lib/three.js';
import { OrbitControls } from '../vendor/jsm/controls/OrbitControls.js';

import { Terrain, clamp, lerp } from './lib/champ.js';
import { construireTerrain } from './world/terrain.js';
import { construireBatiments } from './world/buildings.js';
import { construireVoirie } from './world/roads.js';
import { construireEau } from './world/water.js';
import { construireVegetation } from './world/vegetation.js';
import { construireReperes } from './world/landmarks.js';
import { construireFoire } from './world/fair.js';
import { construireBarques } from './world/boats.js';
import { construireLampadaires } from './world/lamps.js';
import { construireCiel } from './sky.js';
import { construirePluie, humidite } from './weather.js';
import { creerInterface, creerEtiquettes } from './ui.js';
import { creerMiniCarte } from './minimap.js';

const ecran = document.getElementById('chargement');
const jauge = ecran.querySelector('.barre i');
const etape = ecran.querySelector('.etape');
// On laisse le navigateur repeindre entre deux étapes, sans dépendre d'un rAF
// qui serait bridé si l'onglet n'est pas au premier plan.
const attendre = () => new Promise((r) => {
  let fini = false;
  const fin = () => { if (!fini) { fini = true; r(); } };
  requestAnimationFrame(() => setTimeout(fin, 0));
  setTimeout(fin, 90);
});
async function pas(pct, texte) {
  jauge.style.width = `${pct}%`;
  etape.textContent = texte;
  await attendre();
}

async function demarrer() {
  await pas(6, 'lecture des données OpenStreetMap…');
  const data = await (await fetch('data/scene.json')).json();

  /* ------------------------------------------------------------- rendu --- */
  const canvas = document.getElementById('vue');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 1.2, 9000);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.055;
  controls.rotateSpeed = 0.52;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.85;
  controls.screenSpacePanning = false;
  controls.minDistance = 18;
  controls.maxDistance = 3200;
  controls.maxPolarAngle = 1.505;
  controls.minPolarAngle = 0.08;
  controls.zoomToCursor = true;          // la molette va vers ce qu'on regarde
  controls.zoomSpeed = 1.15;

  /* ----------------------------------------------------------- le monde --- */
  await pas(16, 'modelage du relief de la vallée…');
  const terrain = new Terrain(data.terrain, data.meta.world);
  const sol = construireTerrain(scene, data, terrain);

  await pas(34, 'élévation des maisons de pierre…');
  const bati = construireBatiments(scene, data);

  await pas(50, 'tracé des rues et des chemins…');
  const voirie = construireVoirie(scene, data);

  await pas(58, 'mise en eau de la Moine…');
  const eau = construireEau(scene, data);

  await pas(68, 'plantation du bocage…');
  const vegetation = construireVegetation(scene, data, terrain);

  await pas(78, 'pont, moulins, motte et clochers…');
  const reperes = construireReperes(scene, data, terrain);

  await pas(85, 'montage de la foire de la Saint-Maurice…');
  const foire = construireFoire(scene, data, terrain);

  await pas(90, 'mise à l’eau des barques…');
  const barques = construireBarques(scene, data, 5);

  await pas(94, 'allumage des réverbères…');
  const noyaux = [
    { x: 232, z: -890, r: 420 },
    { x: -496, z: 862, r: 330 },
    { x: 300, z: -520, r: 260 },
  ];
  const lampadaires = construireLampadaires(scene, data, terrain, noyaux);

  await pas(97, 'lever du jour…');
  const ciel = construireCiel(scene, renderer);
  const pluie = construirePluie(scene, 9000);

  const mouillables = [
    { m: sol.materiau, sec: 0.96, mouille: 0.72 },
    { m: voirie.materiau, sec: 0.9, mouille: 0.36 },
    { m: bati.matToit, sec: 0.72, mouille: 0.26 },
    { m: bati.matFacade, sec: 0.88, mouille: 0.6 },
    { m: bati.matBrut, sec: 0.93, mouille: 0.66 },
  ];

  /* --------------------------------------------------------- étiquettes --- */
  const conteneur = document.getElementById('labels');
  const entrees = [];
  for (const l of data.landmarks) {
    entrees.push({
      texte: l.name, vedette: true,
      position: new THREE.Vector3(l.x, l.y + (l.id === 'motte-feodale' ? 22 : 14), l.z),
      onClick: () => allerVers(l),
    });
  }
  for (const p of data.places) {
    if (!['village', 'hamlet', 'town'].includes(p.k)) continue;
    entrees.push({ texte: p.n, position: new THREE.Vector3(p.x, p.y + 9, p.z) });
  }
  const etiquettes = creerEtiquettes(conteneur, entrees);

  /* ------------------------------------------------------------- caméra --- */
  const bornes = { x: data.meta.world.w / 2 - 60, z: data.meta.world.h / 2 - 60 };
  const sph = new THREE.Spherical();
  const VUE_INITIALE = { x: 300, z: -700, dist: 880, phi: 1.0, theta: 0.42 };
  const VUE_LARGE = { x: 60, z: -180, dist: 2450, phi: 0.92, theta: 0.3 };

  function poser(v, immediat = true) {
    const y = terrain.at(v.x, v.z);
    controls.target.set(v.x, y + 12, v.z);
    sph.set(v.dist, v.phi, v.theta);
    camera.position.setFromSpherical(sph).add(controls.target);
    controls.update();
    if (immediat) voyage = null;
  }

  let voyage = null;
  /** Vol vers un point du sol en conservant l'orientation et la distance courantes. */
  function volerAuPoint(x, z, distance) {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    volerVers({
      x: clamp(x, -bornes.x, bornes.x), z: clamp(z, -bornes.z, bornes.z),
      dist: distance ?? clamp(sph.radius, controls.minDistance, controls.maxDistance),
      phi: sph.phi, theta: sph.theta,
    }, 950);
  }
  function volerVers(v, duree = 1700) {
    const depart = {
      cible: controls.target.clone(),
      sph: new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)),
    };
    const cible = new THREE.Vector3(v.x, terrain.at(v.x, v.z) + 12, v.z);
    const arrivee = new THREE.Spherical(v.dist, v.phi, v.theta);
    // on prend le chemin le plus court en azimut
    while (arrivee.theta - depart.sph.theta > Math.PI) arrivee.theta -= Math.PI * 2;
    while (arrivee.theta - depart.sph.theta < -Math.PI) arrivee.theta += Math.PI * 2;
    voyage = { depart, cible, arrivee, t: 0, duree: duree / 1000 };
  }
  const allerVers = (l) => volerVers({ x: l.x, z: l.z, dist: l.view.dist, phi: l.view.phi, theta: l.view.theta });

  poser(VUE_INITIALE);

  /* --------------------------------------------------------- interface --- */
  let heures = 10.3;
  let pluieCible = 0, pluieForce = 0;
  let etiquettesActives = true;
  let ronde = false;

  const carte = creerMiniCarte(document.getElementById('carte'), data, {
    surClic: ({ x, z, repere }) => {
      if (repere) { allerVers(repere); return; }
      volerAuPoint(x, z);
    },
  });

  const ui = creerInterface({
    landmarks: data.landmarks,
    surRepere: allerVers,
    surHeure: (h) => { heures = h; },
    surPluie: (on) => { pluieCible = on ? 1 : 0; },
    surEtiquettes: (on) => { etiquettesActives = on; },
    surRonde: (on) => { ronde = on; },
    surCourbes: (on) => sol.courbes(on),
    surVueLarge: () => volerVers(VUE_LARGE, 2100),
  });

  /* -------------------------------------------------------------- boucle --- */
  const exageration = data.meta.exageration || 1;
  const jaugeAlt = document.getElementById('altitude');
  let compteur = 0;
  const horloge = new THREE.Clock();
  const taille = new THREE.Vector2(innerWidth, innerHeight);
  const easing = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  let temps = 0;

  addEventListener('resize', () => {
    taille.set(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.8));
  });
  canvas.addEventListener('pointerdown', () => { voyage = null; });
  canvas.addEventListener('wheel', () => { voyage = null; }, { passive: true });

  /* --- double-clic : on se pose à l'endroit visé --- */
  const rayon = new THREE.Raycaster();
  const souris = new THREE.Vector2();
  const cibles = [sol.mesh, ...bati.meshes];
  canvas.addEventListener('dblclick', (ev) => {
    souris.set((ev.clientX / innerWidth) * 2 - 1, -(ev.clientY / innerHeight) * 2 + 1);
    rayon.setFromCamera(souris, camera);
    const hit = rayon.intersectObjects(cibles, false)[0];
    if (!hit) return;
    const d = camera.position.distanceTo(controls.target);
    volerAuPoint(hit.point.x, hit.point.z, Math.max(controls.minDistance + 12, d * 0.55));
  });

  /* --- clavier : déplacement continu, vitesse proportionnelle à l'altitude --- */
  const touches = new Set();
  const estChamp = (el) => el && /input|textarea|select|button/i.test(el.tagName);
  addEventListener('keydown', (e) => {
    if (estChamp(e.target)) return;
    touches.add(e.key.toLowerCase());
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault();
  });
  addEventListener('keyup', (e) => touches.delete(e.key.toLowerCase()));
  addEventListener('blur', () => touches.clear());

  const avant = new THREE.Vector3(), cote = new THREE.Vector3(), glisse = new THREE.Vector3();
  function clavier(dt) {
    const k = (...n) => n.some((x) => touches.has(x));
    let ax = 0, az = 0, dz = 0;
    if (k('arrowup', 'z', 'w')) az += 1;
    if (k('arrowdown', 's')) az -= 1;
    if (k('arrowleft', 'q', 'a')) ax -= 1;
    if (k('arrowright', 'd')) ax += 1;
    if (k('+', '=')) dz -= 1;
    if (k('-', '_')) dz += 1;
    if (!ax && !az && !dz) return;
    voyage = null;
    const dist = camera.position.distanceTo(controls.target);
    const v = clamp(dist * 0.7, 30, 620) * (touches.has('shift') ? 2.4 : 1) * dt;
    avant.subVectors(controls.target, camera.position).setY(0).normalize();
    cote.set(-avant.z, 0, avant.x);
    glisse.set(0, 0, 0).addScaledVector(avant, az * v).addScaledVector(cote, ax * v);
    controls.target.add(glisse);
    camera.position.add(glisse);
    if (dz) {
      const f = 1 + dz * dt * 1.6;
      const off = camera.position.clone().sub(controls.target)
        .multiplyScalar(clamp(f, 0.5, 2));
      if (off.length() > controls.minDistance && off.length() < controls.maxDistance) {
        camera.position.copy(controls.target).add(off);
      }
    }
  }

  function boucle() {
    requestAnimationFrame(boucle);
    const dt = Math.min(0.05, horloge.getDelta());
    temps += dt;

    ui.tic(dt);
    clavier(dt);

    if (voyage) {
      voyage.t = Math.min(1, voyage.t + dt / voyage.duree);
      const k = easing(voyage.t);
      controls.target.lerpVectors(voyage.depart.cible, voyage.cible, k);
      const s = new THREE.Spherical(
        lerp(voyage.depart.sph.radius, voyage.arrivee.radius, k),
        lerp(voyage.depart.sph.phi, voyage.arrivee.phi, k),
        lerp(voyage.depart.sph.theta, voyage.arrivee.theta, k),
      );
      camera.position.setFromSpherical(s).add(controls.target);
      if (voyage.t >= 1) voyage = null;
    } else if (ronde) {
      const off = camera.position.clone().sub(controls.target);
      const s = new THREE.Spherical().setFromVector3(off);
      s.theta += dt * 0.045;
      camera.position.setFromSpherical(s).add(controls.target);
    }

    controls.target.x = clamp(controls.target.x, -bornes.x, bornes.x);
    controls.target.z = clamp(controls.target.z, -bornes.z, bornes.z);
    const solCible = terrain.at(controls.target.x, controls.target.z);
    controls.target.y = lerp(controls.target.y, solCible + 12, 0.08);
    controls.update();
    // on ne passe jamais sous la terre
    const solCam = terrain.at(camera.position.x, camera.position.z);
    if (camera.position.y < solCam + 6) camera.position.y = solCam + 6;

    pluieForce += (pluieCible - pluieForce) * Math.min(1, dt * 1.4);
    const etat = ciel.maj(heures, pluieForce, controls.target, camera.position.distanceTo(controls.target));

    humidite(mouillables, pluieForce);
    pluie.maj(dt, pluieForce, camera.position, etat.jour);

    bati.matFacade.emissiveIntensity = etat.nuit * 1.45;
    lampadaires.maj(etat.nuit);
    reperes.nuit(etat.nuit);
    foire.nuit(etat.nuit);

    reperes.anime(dt);
    foire.anime(dt, temps);
    barques.anime(dt, temps);
    eau.anime(temps);

    etiquettes.maj(camera, taille, etiquettesActives, 1250);

    const cap = Math.atan2(controls.target.x - camera.position.x, -(controls.target.z - camera.position.z)) - Math.PI / 2;
    carte.dessiner(camera.position, controls.target, cap, (camera.fov * Math.PI / 180) * camera.aspect * 0.85);

    // altitude réelle du point visé, en mètres NGF (le relief est amplifié à l'écran)
    if ((compteur = (compteur + 1) % 12) === 0) {
      jaugeAlt.textContent = `${Math.round(controls.target.y / exageration - 12 / exageration)} m`;
    }

    renderer.render(scene, camera);
  }

  // accès depuis la console du navigateur, pratique pour bidouiller la scène
  globalThis.MM = { THREE, scene, camera, renderer, controls, data, terrain, ciel, poser, volerVers };

  await pas(100, 'prêt.');
  boucle();
  setTimeout(() => ecran.classList.add('parti'), 260);
}

demarrer().catch((err) => {
  console.error(err);
  etape.textContent = `échec du chargement : ${err.message}`;
  etape.style.color = '#e08a7a';
});
