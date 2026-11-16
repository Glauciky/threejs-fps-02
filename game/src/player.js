// The player: a physics body plus health, armour and the hitbox bots shoot
// at. Armour absorbs half of every hit until it is gone. The hitbox is an
// invisible torso box and head sphere that ride on the body, so a bot's ray
// is checked against the player exactly as the player's ray is checked
// against a bot.
import * as THREE from 'three';
import { createBody } from './physics.js';

export function createPlayer(scene, colliders, spawn) {
  const mover = createBody(colliders, spawn);
  const body = mover.body;

  const hitMaterial = new THREE.MeshBasicMaterial({ visible: false });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.68, 1.05, 0.4), hitMaterial);
  torso.userData.part = 'torso';
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), hitMaterial);
  head.userData.part = 'head';
  scene.add(torso, head);

  const player = {
    health: 100,
    armor: 0,
    alive: true,
    hitMeshes: [torso, head],
  };
  torso.userData.owner = player;
  head.userData.owner = player;

  function syncHitbox() {
    torso.position.set(body.position.x, body.position.y + body.height * 0.62, body.position.z);
    head.position.set(body.position.x, body.position.y + body.height - 0.12, body.position.z);
  }

  function damage(amount) {
    if (!player.alive) return 0;
    let left = amount;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, left * 0.5);
      player.armor -= absorbed;
      left -= absorbed;
    }
    player.health = Math.max(0, player.health - left);
    if (player.health <= 0) player.alive = false;
    return left;
  }

  function reset(spawnPoint) {
    body.position.set(spawnPoint.x, 0, spawnPoint.z);
    body.velocity.set(0, 0, 0);
    body.yaw = spawnPoint.yaw ?? 0;
    body.pitch = 0;
    player.health = 100;
    player.armor = 0;
    player.alive = true;
    syncHitbox();
  }

  return {
    mover,
    body,
    state: player,
    damage,
    reset,
    syncHitbox,
    step(dt, move) {
      mover.step(dt, move);
      syncHitbox();
    },
  };
}
