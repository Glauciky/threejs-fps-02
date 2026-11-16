// Grenades: a thrown arc, one bounce, then a fuse. Flash whites out anyone
// facing it with a line of sight; smoke grows into an opaque sphere that
// blocks bot vision for twelve seconds; frag hurts everyone in six metres
// with falloff. The smoke spheres are exposed so the bots' line-of-sight
// test can treat them as cover.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 12;
const FLASH_FUSE = 1.2;
const SMOKE_FUSE = 1.0;
const FRAG_FUSE = 1.5;
const FRAG_RADIUS = 6;
const SMOKE_RADIUS = 3.5;
const SMOKE_SECONDS = 12;

export function createGrenades(scene, dock, events) {
  const smokeMeshes = [];
  const smokes = [];
  const active = [];
  const sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9aa7b5'), roughness: 1, transparent: true, opacity: 0.92 });
  const ballGeometry = new THREE.SphereGeometry(0.09, 10, 8);
  const ballMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 });
  const raycaster = new THREE.Raycaster();
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function throwGrenade(type, origin, direction, speed) {
    const mesh = new THREE.Mesh(ballGeometry, ballMaterial);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    active.push({
      type,
      mesh,
      vel: direction.clone().multiplyScalar(speed),
      fuse: type === 'flash' ? FLASH_FUSE : type === 'smoke' ? SMOKE_FUSE : FRAG_FUSE,
      bounced: false,
      done: false,
    });
    events.audio.shot('pistol');
  }

  function lineOfSight(a, b) {
    from.copy(a);
    to.copy(b);
    const dist = from.distanceTo(to);
    dir.copy(to).sub(from).normalize();
    raycaster.set(from, dir);
    raycaster.far = dist;
    return !raycaster.intersectObjects(dock.shootables, false)[0];
  }

  function detonate(g, time) {
    g.done = true;
    scene.remove(g.mesh);
    const pos = g.mesh.position.clone();
    if (g.type === 'flash') {
      events.flash(pos);
    } else if (g.type === 'smoke') {
      const cloud = new THREE.Mesh(sphereGeometry, smokeMaterial.clone());
      cloud.position.copy(pos);
      cloud.scale.setScalar(0.2);
      scene.add(cloud);
      smokeMeshes.push(cloud);
      smokes.push({ mesh: cloud, born: time });
    } else {
      events.explosion(pos, FRAG_RADIUS);
      events.audio.explosion();
    }
  }

  function step(dt, time) {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const g = active[i];
      if (g.done) {
        active.splice(i, 1);
        continue;
      }
      g.vel.y -= GRAVITY * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      const p = g.mesh.position;
      if (p.y <= 0.09) {
        p.y = 0.09;
        if (!g.bounced) {
          g.bounced = true;
          g.vel.y = Math.abs(g.vel.y) * 0.4;
          g.vel.x *= 0.6;
          g.vel.z *= 0.6;
        } else {
          g.vel.y = 0;
          g.vel.x *= 0.8;
          g.vel.z *= 0.8;
        }
      }
      if (p.x < -19.5 || p.x > 19.5) { p.x = Math.max(-19.5, Math.min(19.5, p.x)); g.vel.x = 0; }
      if (p.z < -14.5 || p.z > 14.5) { p.z = Math.max(-14.5, Math.min(14.5, p.z)); g.vel.z = 0; }
      g.fuse -= dt;
      if (g.fuse <= 0) detonate(g, time);
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      const age = time - s.born;
      if (age < 1) {
        s.mesh.scale.setScalar(0.2 + (SMOKE_RADIUS - 0.2) * age);
      } else if (age > SMOKE_SECONDS) {
        const fade = Math.min(1, (age - SMOKE_SECONDS) / 1.5);
        s.mesh.material.opacity = 0.92 * (1 - fade);
        s.mesh.scale.setScalar(SMOKE_RADIUS * (1 + fade * 0.2));
        if (fade >= 1) {
          scene.remove(s.mesh);
          const idx = smokeMeshes.indexOf(s.mesh);
          if (idx !== -1) smokeMeshes.splice(idx, 1);
          smokes.splice(i, 1);
        }
      }
    }
  }

  function reset() {
    for (const g of active) scene.remove(g.mesh);
    active.length = 0;
    for (const s of smokes) scene.remove(s.mesh);
    smokes.length = 0;
    smokeMeshes.length = 0;
  }

  return {
    smokeMeshes,
    throwGrenade,
    step,
    reset,
    lineOfSight,
    count() {
      return active.length;
    },
  };
}
