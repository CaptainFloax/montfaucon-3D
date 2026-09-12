// La pluie fine des Mauges : rideau de traits qui suit la caméra, plus le voile
// d'humidité sur les matériaux (la pierre et l'enrobé brillent sous l'averse).
import * as THREE from './lib/three.js';
import { rng } from './lib/champ.js';

const VS = `
attribute vec3 aGraine;
attribute float aQueue;
uniform vec3 uCentre;
uniform vec3 uBoite;
uniform float uTemps;
uniform float uVitesse;
uniform float uLong;
uniform float uVent;
varying float vFondu;
void main() {
  vec3 p = aGraine * uBoite;
  p.y = mod(p.y - uTemps * uVitesse * (0.75 + aGraine.x * 0.5), uBoite.y);
  vec3 w = uCentre + p - uBoite * 0.5;
  w.x += uVent * (uBoite.y - p.y) * 0.12;
  if (aQueue > 0.5) w.y -= uLong * (0.6 + aGraine.z * 0.8);
  vec4 mv = modelViewMatrix * vec4(w, 1.0);
  vFondu = clamp(1.0 - length(mv.xyz) / (uBoite.x * 0.75), 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const FS = `
uniform float uOpacite;
uniform vec3 uCouleur;
varying float vFondu;
void main() {
  gl_FragColor = vec4(uCouleur, uOpacite * vFondu);
}`;

export function construirePluie(scene, nb = 9000) {
  const pos = new Float32Array(nb * 2 * 3);
  const graine = new Float32Array(nb * 2 * 3);
  const queue = new Float32Array(nb * 2);
  const rnd = rng(8899);
  for (let i = 0; i < nb; i++) {
    const a = rnd(), b = rnd(), c = rnd();
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k;
      graine[j * 3] = a; graine[j * 3 + 1] = b; graine[j * 3 + 2] = c;
      queue[j] = k;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aGraine', new THREE.BufferAttribute(graine, 3));
  geo.setAttribute('aQueue', new THREE.BufferAttribute(queue, 1));

  const uniforms = {
    uCentre: { value: new THREE.Vector3() },
    uBoite: { value: new THREE.Vector3(340, 170, 340) },
    uTemps: { value: 0 },
    uVitesse: { value: 46 },
    uLong: { value: 1.5 },
    uVent: { value: 0.22 },
    uOpacite: { value: 0 },
    uCouleur: { value: new THREE.Color(0xd5e2ec) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false,
  });
  const rideau = new THREE.LineSegments(geo, mat);
  rideau.frustumCulled = false;
  rideau.renderOrder = 5;
  rideau.visible = false;
  scene.add(rideau);

  return {
    rideau, uniforms,
    maj(dt, force, centre, clarte) {
      uniforms.uTemps.value += dt;
      uniforms.uCentre.value.copy(centre);
      uniforms.uOpacite.value = 0.42 * force;
      uniforms.uCouleur.value.setRGB(0.72 + clarte * 0.18, 0.78 + clarte * 0.15, 0.84 + clarte * 0.13);
      rideau.visible = force > 0.01;
    },
  };
}

/** Rend les surfaces luisantes quand il pleut. */
export function humidite(materiaux, force) {
  for (const { m, sec, mouille } of materiaux) {
    m.roughness = sec + (mouille - sec) * force;
    if (m.metalness !== undefined) m.metalness = force * 0.12;
  }
}
