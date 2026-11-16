// The bots: three friendly Ravens and four enemy Bulwark, each a physics
// body with a team-coloured figure, a weapon and a state machine. A bot
// routes along the waypoint graph to its site, holds an angle there, engages
// anything it can see after a human reaction delay, rotates when the charge
// is planted, and investigates a gunshot it hears. Its shots are real
// raycasts against the player's hitbox and the other bots, checked against
// the map first, so a wall is cover for everyone.
import * as THREE from 'three';
import { createBody } from './physics.js';
import { PALETTE } from './palette.js';
import { WEAPONS, damageAt } from './arsenal.js';
import { range, pick, chance } from './rng.js';

const BOT_WEAPONS = ['kestrel', 'kestrel', 'boar', 'needle'];
const REACTION_MIN = 0.25;
const REACTION_MAX = 0.6;
const LOS_INTERVAL = 0.15;
const HEAR_RADIUS = 22;

function findRoute(edges, from, to) {
  if (from === to) return [to];
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of edges[node] || []) {
      if (!(next in prev)) {
        prev[next] = node;
        if (next === to) {
          const path = [to];
          let at = to;
          while (prev[at] !== null) {
            at = prev[at];
            path.unshift(at);
          }
          return path;
        }
        queue.push(next);
      }
    }
  }
  return [to];
}

function nearestNode(nodes, position) {
  let best = null;
  let bestDist = Infinity;
  for (const [name, point] of Object.entries(nodes)) {
    const d = (point.x - position.x) ** 2 + (point.z - position.z) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = name;
    }
  }
  return best;
}

export function createBots(scene, dock, random, events) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const eyePos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  // Reused across line-of-sight tests so no array is allocated per check.
  const losTargets = [];

  const teamMaterial = {
    ravens: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.friendly), roughness: 0.6, metalness: 0.1 }),
    bulwark: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.enemy), roughness: 0.6, metalness: 0.1 }),
  };
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#222a33'), roughness: 0.85 });
  const inkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 12, 10);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.08, 0.09, 0.5);
  const markerGeometry = new THREE.BoxGeometry(0.3, 0.05, 0.3);

  const bots = [];
  const defs = [
    { team: 'ravens', name: 'Rook', weapon: 'kestrel', site: 'A', lane: 'aLongMid' },
    { team: 'ravens', name: 'Heron', weapon: 'boar', site: 'A', lane: 'midCenter' },
    { team: 'ravens', name: 'Kite', weapon: 'needle', site: 'B', lane: 'bCutMid' },
    { team: 'bulwark', name: 'Bastion', weapon: 'kestrel', site: 'A', lane: 'siteA' },
    { team: 'bulwark', name: 'Gargoyle', weapon: 'kestrel', site: 'B', lane: 'siteB' },
    { team: 'bulwark', name: 'Sentry', weapon: 'boar', site: 'A', lane: 'aEntry' },
    { team: 'bulwark', name: 'Warden', weapon: 'needle', site: 'B', lane: 'midNorth' },
  ];

  for (let i = 0; i < defs.length; i += 1) {
    const def = defs[i];
    const spawn = def.team === 'ravens'
      ? { x: -4 + i * 2.4, z: 13, yaw: 0 }
      : { x: -6 + (i - 3) * 4, z: -13, yaw: Math.PI };
    const mover = createBody(dock.colliders, spawn);
    const group = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeometry, teamMaterial[def.team]);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, inkMaterial);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeometry, darkMaterial);
    legL.position.set(-0.14, 0.35, 0);
    const legR = new THREE.Mesh(legGeometry, darkMaterial);
    legR.position.set(0.14, 0.35, 0);
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.2, 1.15, -0.25);
    const marker = new THREE.Mesh(markerGeometry, teamMaterial[def.team]);
    marker.position.y = 1.82;
    group.add(torso, head, legL, legR, gun, marker);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      id: `bot-${i}`,
      name: def.name,
      team: def.team,
      weapon: WEAPONS[def.weapon],
      mover,
      body: mover.body,
      group,
      torso,
      head,
      hitMeshes: [torso, head],
      health: 100,
      alive: true,
      site: def.site,
      holdNode: def.lane,
      state: 'route',
      route: [],
      routeIndex: 0,
      holdYaw: 0,
      reaction: 0,
      burstLeft: 0,
      nextShotAt: 0,
      lastSeenAt: -10,
      target: null,
      investigatePos: null,
      isCarrier: false,
      plantProgress: 0,
      defuseProgress: 0,
      losTimer: i * 0.02,
      blindUntil: 0,
      fall: 0,
      spawn,
    };
    torso.userData.owner = bot;
    head.userData.owner = bot;
    bots.push(bot);
  }

  function hasLineOfSight(from, to) {
    eyePos.copy(from);
    targetPos.copy(to);
    const dist = eyePos.distanceTo(targetPos);
    aimDir.copy(targetPos).sub(eyePos).normalize();
    raycaster.set(eyePos, aimDir);
    raycaster.far = dist;
    losTargets.length = 0;
    losTargets.push(...dock.shootables);
    if (dock.smokeMeshes) losTargets.push(...dock.smokeMeshes);
    const hit = raycaster.intersectObjects(losTargets, false)[0];
    return !hit;
  }

  function visibleEnemy(bot, time) {
    const candidates = [];
    if (bot.team === 'bulwark' && events.player.alive) {
      candidates.push({ pos: events.player.body.position, eye: events.player.body.eye, hitMeshes: events.player.hitMeshes, kind: 'player' });
    }
    for (const other of bots) {
      if (other.team !== bot.team && other.alive) {
        candidates.push({ pos: other.body.position, eye: other.body.eye, hitMeshes: other.hitMeshes, kind: 'bot', bot: other });
      }
    }
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
      targetPos.set(c.pos.x, c.pos.y + c.eye * 0.85, c.pos.z);
      const dist = eyePos.distanceTo(targetPos);
      if (dist > 55 || dist >= bestDist) continue;
      if (hasLineOfSight(eyePos, targetPos)) {
        best = c;
        bestDist = dist;
      }
    }
    return best ? { target: best, dist: bestDist } : null;
  }

  function aimBotAt(bot, point) {
    const dx = point.x - bot.body.position.x;
    const dy = point.y - (bot.body.position.y + bot.body.eye);
    const dz = point.z - bot.body.position.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const wantYaw = Math.atan2(-dx, -dz);
    const wantPitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
    let dyaw = wantYaw - bot.body.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    bot.body.yaw += Math.max(-0.09, Math.min(0.09, dyaw));
    bot.body.pitch += Math.max(-0.05, Math.min(0.05, wantPitch - bot.body.pitch));
  }

  function botShoot(bot, seen, time) {
    if (time < bot.nextShotAt) return;
    const def = bot.weapon;
    const isBurst = def.auto;
    if (bot.burstLeft <= 0) {
      if (!isBurst && time < bot.nextShotAt) return;
      bot.burstLeft = isBurst ? 3 : 1;
    }
    bot.burstLeft -= 1;
    const gap = isBurst ? 0.11 : def.gap;
    bot.nextShotAt = time + (bot.burstLeft > 0 ? gap : def.gap + range(random, 0.25, 0.7));
    eyePos.set(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    const spread = 0.012 + Math.min(1, seen.dist / 40) * 0.02;
    const pellets = def.pellets;
    for (let p = 0; p < pellets; p += 1) {
      targetPos.set(seen.target.pos.x, seen.target.pos.y + seen.target.eye * 0.85, seen.target.pos.z);
      aimDir.copy(targetPos).sub(eyePos).normalize();
      aimDir.x += (random() * 2 - 1) * spread;
      aimDir.y += (random() * 2 - 1) * spread;
      aimDir.z += (random() * 2 - 1) * spread;
      aimDir.normalize();
      raycaster.set(eyePos, aimDir);
      raycaster.far = 90;
      const targets = seen.target.hitMeshes.concat(dock.shootables);
      const hit = raycaster.intersectObjects(targets, false)[0];
      events.tracer(eyePos, hit ? hit.point : aimDir.clone().multiplyScalar(60).add(eyePos), bot.team);
      if (!hit) continue;
      if (hit.object.userData.part) {
        const part = hit.object.userData.part;
        const amount = damageAt(def, part, hit.distance);
        if (seen.target.kind === 'player') {
          events.damagePlayer(amount, bot, part === 'head');
        } else {
          events.damageBot(seen.target.bot, amount, part, bot);
        }
      } else {
        events.impact(hit.point);
      }
    }
    events.audio.shot(def.kind);
  }

  function routeTo(bot, nodeName) {
    const from = nearestNode(dock.nodes, bot.body.position);
    bot.route = findRoute(dock.edges, from, nodeName);
    bot.routeIndex = 0;
    bot.state = 'route';
  }

  function stepBot(bot, dt, time) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.group.position.copy(bot.body.position);
    bot.group.rotation.y = bot.body.yaw;

    // Separation: do not stand inside another bot.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const dx = bot.body.position.x - other.body.position.x;
      const dz = bot.body.position.z - other.body.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.49 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        bot.body.position.x += (dx / d) * (0.7 - d) * 0.5;
        bot.body.position.z += (dz / d) * (0.7 - d) * 0.5;
      }
    }

    // A flashed bot sees nothing and holds still until its sight returns.
    const blinded = time < bot.blindUntil;
    bot.losTimer -= dt;
    let seen = null;
    if (!blinded && bot.losTimer <= 0) {
      bot.losTimer = LOS_INTERVAL;
      seen = visibleEnemy(bot, time);
      if (seen) {
        if (bot.target !== seen.target) {
          bot.reaction = range(random, REACTION_MIN, REACTION_MAX);
          bot.target = seen.target;
        }
        bot.lastSeenAt = time;
      } else if (bot.target && time - bot.lastSeenAt > 2) {
        bot.target = null;
      }
    }
    if (blinded) bot.target = null; else if (bot.target) {
      seen = { target: bot.target, dist: 10 };
    }

    const move = { forward: 0, strafe: 0, jump: false, crouch: false };

    if (bot.target && bot.reaction > 0) {
      bot.reaction -= dt;
      aimBotAt(bot, new THREE.Vector3(bot.target.pos.x, bot.target.pos.y + bot.target.eye * 0.85, bot.target.pos.z));
    } else if (bot.target) {
      aimBotAt(bot, new THREE.Vector3(bot.target.pos.x, bot.target.pos.y + bot.target.eye * 0.85, bot.target.pos.z));
      botShoot(bot, seen || { target: bot.target, dist: 10 }, time);
    } else if (bot.state === 'route' && bot.route.length > 0) {
      const node = dock.nodes[bot.route[bot.routeIndex]];
      const dx = node.x - bot.body.position.x;
      const dz = node.z - bot.body.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.9) {
        bot.routeIndex += 1;
        if (bot.routeIndex >= bot.route.length) {
          bot.state = 'hold';
          bot.holdYaw = bot.team === 'bulwark'
            ? Math.atan2(-(0 - bot.body.position.x), -(13 - bot.body.position.z))
            : range(random, 0, Math.PI * 2);
        }
      } else {
        const wantYaw = Math.atan2(-dx, -dz);
        let dyaw = wantYaw - bot.body.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        bot.body.yaw += Math.max(-0.12, Math.min(0.12, dyaw));
        move.forward = Math.abs(dyaw) < 0.6 ? 1 : 0.3;
      }
    } else if (bot.state === 'hold') {
      // Hold the angle, with a slow scan so the position reads as alive.
      bot.body.yaw = bot.holdYaw + Math.sin(time * 0.4 + bot.id.charCodeAt(4)) * 0.25;
      if (bot.investigatePos) {
        routeTo(bot, nearestNode(dock.nodes, bot.investigatePos));
        bot.investigatePos = null;
      }
    }

    // The carrier plants when it reaches its site.
    if (bot.isCarrier && bot.team === 'ravens' && bot.state === 'hold') {
      const site = dock.sites[bot.site];
      const dx = site.center.x - bot.body.position.x;
      const dz = site.center.z - bot.body.position.z;
      if (Math.hypot(dx, dz) < site.radius) {
        bot.plantProgress += dt;
        if (bot.plantProgress >= 4) {
          bot.plantProgress = 0;
          events.onPlant(bot.site, bot);
        }
      } else {
        bot.plantProgress = 0;
        routeTo(bot, bot.site === 'A' ? 'siteA' : 'siteB');
      }
    }

    bot.mover.step(dt, move);
    bot.group.position.copy(bot.body.position);
    bot.group.rotation.y = bot.body.yaw;
  }

  function reset(roundSeed) {
    const sitePick = chance(random, 0.5) ? 'A' : 'B';
    for (let i = 0; i < bots.length; i += 1) {
      const bot = bots[i];
      const spawn = bot.spawn;
      bot.body.position.set(spawn.x, 0, spawn.z);
      bot.body.velocity.set(0, 0, 0);
      bot.body.yaw = spawn.yaw;
      bot.body.pitch = 0;
      bot.health = 100;
      bot.alive = true;
      bot.fall = 0;
      bot.group.rotation.set(0, bot.body.yaw, 0);
      bot.group.position.copy(bot.body.position);
      bot.target = null;
      bot.burstLeft = 0;
      bot.nextShotAt = 0;
      bot.lastSeenAt = -10;
      bot.plantProgress = 0;
      bot.defuseProgress = 0;
      bot.investigatePos = null;
      bot.isCarrier = false;
      if (bot.team === 'ravens') {
        bot.site = i === 2 ? (sitePick === 'A' ? 'B' : 'A') : sitePick;
        routeTo(bot, bot.site === 'A' ? 'siteA' : 'siteB');
      } else {
        bot.site = bot.holdNode === 'siteA' || bot.holdNode === 'aEntry' ? 'A' : 'B';
        routeTo(bot, bot.holdNode);
      }
    }
  }

  function hearShot(position) {
    for (const bot of bots) {
      if (!bot.alive || bot.target) continue;
      const dx = bot.body.position.x - position.x;
      const dz = bot.body.position.z - position.z;
      if (dx * dx + dz * dz < HEAR_RADIUS * HEAR_RADIUS) {
        bot.investigatePos = position.clone();
        if (bot.state === 'hold') {
          routeTo(bot, nearestNode(dock.nodes, position));
          bot.investigatePos = null;
        }
      }
    }
  }

  return {
    bots,
    step(dt, time) {
      for (const bot of bots) stepBot(bot, dt, time);
    },
    reset,
    hearShot,
    aliveCount(team) {
      return bots.filter((b) => b.team === team && b.alive).length;
    },
    allHitMeshes() {
      const list = [];
      for (const bot of bots) {
        if (bot.alive) list.push(...bot.hitMeshes);
      }
      return list;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health <= 0) {
        bot.alive = false;
        bot.fall = 0;
        return true;
      }
      return false;
    },
    setCarrier(bot) {
      for (const b of bots) b.isCarrier = false;
      if (bot) bot.isCarrier = true;
    },
    blind(bot, seconds, time) {
      bot.blindUntil = Math.max(bot.blindUntil, time + seconds);
      bot.target = null;
    },
    rotateToSite(site) {
      for (const bot of bots) {
        if (bot.team !== 'bulwark' || !bot.alive) continue;
        bot.target = null;
        bot.investigatePos = null;
        routeTo(bot, site === 'A' ? 'siteA' : 'siteB');
      }
    },
  };
}
