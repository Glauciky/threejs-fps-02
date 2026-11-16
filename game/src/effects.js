// Tracers, impacts and explosions. Everything is pooled and reused: a
// tracer is a stretched box that lives 60 ms, an impact is a small puff that
// grows and fades, an explosion is a sphere and a light that bloom and die.
// Nothing is allocated per frame in the hot path.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_POOL = 24;
const TRACER_LIFE = 0.06;
const IMPACT_POOL = 16;
const IMPACT_LIFE = 0.35;

export function createEffects(scene) {
  const tracerGeometry = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const friendlyMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.friendly), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;

  const impactGeometry = new THREE.IcosahedronGeometry(0.09, 0);
  const impactMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#cfd6dd'), transparent: true, opacity: 0.8 });
  const impacts = [];
  for (let i = 0; i < IMPACT_POOL; i += 1) {
    const mesh = new THREE.Mesh(impactGeometry, impactMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactIndex = 0;

  const boomGeometry = new THREE.SphereGeometry(1, 20, 14);
  const boomMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const boom = new THREE.Mesh(boomGeometry, boomMaterial);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 30, 1.5);
  scene.add(boomLight);
  let boomLife = 0;
  let boomRadius = 0;

  const up = new THREE.Vector3(0, 1, 0);

  function tracer(from, to, team) {
    const t = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const length = from.distanceTo(to);
    if (length < 0.5) return;
    t.mesh.material = team === 'ravens' ? friendlyMaterial : tracerMaterial;
    t.mesh.visible = true;
    t.mesh.position.copy(from).lerp(to, 0.5);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, length);
    t.life = TRACER_LIFE;
  }

  function impact(point) {
    const im = impacts[impactIndex];
    impactIndex = (impactIndex + 1) % IMPACT_POOL;
    im.mesh.visible = true;
    im.mesh.position.copy(point);
    im.mesh.scale.setScalar(0.6);
    im.mesh.material.opacity = 0.8;
    im.life = IMPACT_LIFE;
  }

  function explosion(position, radius) {
    boom.visible = true;
    boom.position.copy(position);
    boom.position.y = Math.max(0.6, position.y);
    boom.scale.setScalar(0.5);
    boom.material.opacity = 0.9;
    boomLight.position.copy(boom.position);
    boomLight.intensity = 120;
    boomLife = 0.6;
    boomRadius = radius;
  }

  function step(dt) {
    for (const t of tracers) {
      if (t.life <= 0) continue;
      t.life -= dt;
      if (t.life <= 0) t.mesh.visible = false;
    }
    for (const im of impacts) {
      if (im.life <= 0) continue;
      im.life -= dt;
      im.mesh.scale.setScalar(0.6 + (IMPACT_LIFE - im.life) * 4);
      im.mesh.material.opacity = Math.max(0, im.life / IMPACT_LIFE) * 0.8;
      if (im.life <= 0) im.mesh.visible = false;
    }
    if (boomLife > 0) {
      boomLife -= dt;
      const k = 1 - Math.max(0, boomLife) / 0.6;
      boom.scale.setScalar(0.5 + k * boomRadius);
      boom.material.opacity = Math.max(0, 0.9 * (1 - k));
      boomLight.intensity = Math.max(0, 120 * (1 - k));
      if (boomLife <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  return { tracer, impact, explosion, step };
}
