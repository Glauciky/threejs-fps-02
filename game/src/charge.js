// The Spark Charge: the objective beyond killing. The Ravens carry it; a
// 4-second hold inside a site plants it, a 35-second timer runs with beeps
// that quicken, and a 5-second hold on the planted charge defuses it. A
// defender bot that reaches the planted charge channels the defuse itself.
// Detonation and defusal end the round through the events the caller gives.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MATCH } from './state.js';

export function createCharge(scene, dock, events) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.35),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3, emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 0.4 }),
  );
  mesh.visible = false;
  mesh.castShadow = true;
  scene.add(mesh);
  const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8, 1.5);
  scene.add(light);

  const charge = {
    state: 'carried',
    site: null,
    timer: MATCH.PLANT_SECONDS,
    plantProgress: 0,
    defuseProgress: 0,
    beepAt: 0,
    defuser: null,
  };

  function plant(site) {
    charge.state = 'planted';
    charge.site = site;
    charge.timer = MATCH.PLANT_SECONDS;
    charge.beepAt = 0;
    const center = dock.sites[site].center;
    mesh.position.set(center.x, 0.15, center.z);
    mesh.visible = true;
    light.position.set(center.x, 1, center.z);
    light.intensity = 12;
    events.audio.plant();
    events.onPlanted(site);
  }

  function step(dt, time) {
    if (charge.state !== 'planted') return;
    charge.timer -= dt;
    const interval = charge.timer > 20 ? 1 : charge.timer > 10 ? 0.5 : 0.25;
    if (time - charge.beepAt >= interval) {
      charge.beepAt = time;
      events.audio.beep(charge.timer <= 10);
      light.intensity = light.intensity > 6 ? 2 : 12;
    }
    // A defender bot on the charge channels the defuse.
    if (!charge.defuser) {
      for (const bot of events.bots) {
        if (bot.team !== 'bulwark' || !bot.alive) continue;
        const dx = bot.body.position.x - mesh.position.x;
        const dz = bot.body.position.z - mesh.position.z;
        if (dx * dx + dz * dz < 4) {
          charge.defuser = bot;
          break;
        }
      }
    }
    if (charge.defuser) {
      const bot = charge.defuser;
      const dx = bot.body.position.x - mesh.position.x;
      const dz = bot.body.position.z - mesh.position.z;
      if (!bot.alive || dx * dx + dz * dz >= 4) {
        charge.defuser = null;
        charge.defuseProgress = 0;
      } else {
        charge.defuseProgress += dt;
        if (charge.defuseProgress >= 5) {
          charge.state = 'defused';
          mesh.visible = false;
          light.intensity = 0;
          events.onDefused(bot);
        }
      }
    }
    if (charge.timer <= 0 && charge.state === 'planted') {
      charge.state = 'exploded';
      mesh.visible = false;
      light.intensity = 0;
      events.explosion(mesh.position, 8, null);
      events.audio.explosion();
      events.onDetonated();
    }
  }

  function reset() {
    charge.state = 'carried';
    charge.site = null;
    charge.timer = MATCH.PLANT_SECONDS;
    charge.plantProgress = 0;
    charge.defuseProgress = 0;
    charge.beepAt = 0;
    charge.defuser = null;
    mesh.visible = false;
    light.intensity = 0;
  }

  return {
    state: charge,
    plant,
    step,
    reset,
    position() {
      return mesh.position;
    },
  };
}
