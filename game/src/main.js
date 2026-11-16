// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the
// display's rate. The player is a Raven; three friendly bots and four enemy
// Bulwark bots fight the round with them. ?shot=menu|play|buy|site|end with
// &seed=N sets up a deterministic frame for a capture, renders it twice,
// then freezes it and sets window.__shotReady. window.__game exposes the
// match for playtests.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { mulberry32 } from './rng.js';
import { createMatch, PHASE, WIN, MATCH } from './state.js';
import { createDock } from './dock.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADE_DEFS, KEVLAR_PRICE, damageAt } from './arsenal.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createCharge } from './charge.js';
import { createRounds } from './rounds.js';
import { createEffects } from './effects.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 22, 55);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const match = createMatch();
const dock = createDock(scene);
const audio = createAudio();
const effects = createEffects(scene);
const hud = createHud();
const player = createPlayer(scene, dock.colliders, { x: 0, z: 13, yaw: 0 });
const arsenal = createArsenal(camera);
const grenades = createGrenades(scene, dock, {
  audio,
  flash(pos) {
    onFlash(pos);
  },
  explosion(pos, radius) {
    onExplosion(pos, radius);
  },
});
dock.smokeMeshes = grenades.smokeMeshes;

let carrier = 'player';
let hasKevlar = false;
let plantHold = 0;
let buyOpen = false;
let started = false;
let frozen = false;
let elapsed = 0;
let accumulator = 0;
let lastTime = performance.now();
let prevFiring = false;
let stepCount = 0;

const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const direction = new THREE.Vector3();
const muzzle = new THREE.Vector3();
const aimPoint = new THREE.Vector3();
const forward = new THREE.Vector3();

// --- damage and kills -------------------------------------------------------

function ravensAlive() {
  return (player.state.alive ? 1 : 0) + bots.aliveCount('ravens');
}

function killFeed(killerName, victimName, headshot) {
  hud.killFeed(`${killerName} ▸ ${victimName}${headshot ? ' (headshot)' : ''}`);
}

function onBotKilled(bot, killer, headshot) {
  killFeed(killer === 'player' ? 'You' : killer.name, bot.name, headshot);
  if (killer === 'player') {
    rounds.awardKill();
    hud.setMoney(match.money);
  }
  if (bot.isCarrier) {
    const next = bots.bots.find((b) => b.team === 'ravens' && b.alive);
    if (next) bots.setCarrier(next);
    else carrier = null;
  }
  rounds.checkElimination(ravensAlive(), bots.aliveCount('bulwark'));
}

function damageBot(bot, amount, part, attacker) {
  const killed = bots.damage(bot, amount);
  if (killed) onBotKilled(bot, attacker, part === 'head');
  return killed;
}

function damagePlayer(amount, attacker, headshot) {
  if (!player.state.alive) return;
  player.damage(amount);
  hud.damageFlash();
  hud.setHealth(Math.round(player.state.health), Math.round(player.state.armor));
  audio.hurt();
  if (!player.state.alive) {
    rounds.noteDeath();
    hud.showBanner('You are down', 'Your team fights on — the round continues.', 4000);
    if (carrier === 'player') {
      const next = bots.bots.find((b) => b.team === 'ravens' && b.alive);
      if (next) {
        carrier = 'bot';
        bots.setCarrier(next);
      } else carrier = null;
    }
    if (document.pointerLockElement) document.exitPointerLock();
    rounds.checkElimination(ravensAlive(), bots.aliveCount('bulwark'));
  }
}

// --- bots -------------------------------------------------------------------

const bots = createBots(scene, dock, random, {
  player: {
    get body() { return player.body; },
    get hitMeshes() { return player.hitMeshes; },
    get alive() { return player.state.alive; },
    damage(amount) { damagePlayer(amount, null, false); },
  },
  damagePlayer(amount, bot, headshot) {
    damagePlayer(amount, bot, headshot);
  },
  damageBot(bot, amount, part, attacker) {
    damageBot(bot, amount, part, attacker);
  },
  onPlant(site, bot) {
    charge.plant(site);
  },
  onShotHeard(pos) {
    bots.hearShot(pos);
  },
  tracer(from, to, team) {
    effects.tracer(from, to, team);
  },
  impact(point) {
    effects.impact(point);
  },
  audio,
});

// --- grenades and the charge -------------------------------------------------

function onFlash(pos) {
  // The player: flashed only when facing the burst with a line of sight.
  if (player.state.alive) {
    camera.getWorldDirection(forward);
    aimPoint.copy(pos).sub(camera.position);
    const dist = aimPoint.length();
    aimPoint.normalize();
    const facing = forward.dot(aimPoint);
    if (facing > 0.2 && grenades.lineOfSight(camera.position, pos)) {
      const strength = Math.max(0.25, 1 - dist / 24);
      hud.flashWhite(strength);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    aimPoint.copy(pos).sub(bot.body.position);
    const dist = aimPoint.length();
    if (dist > 24) continue;
    aimPoint.normalize();
    const facing = -Math.sin(bot.body.yaw) * aimPoint.x - Math.cos(bot.body.yaw) * aimPoint.z;
    const eye = new THREE.Vector3(bot.body.position.x, bot.body.position.y + bot.body.eye, bot.body.position.z);
    if (facing > 0.1 && grenades.lineOfSight(eye, pos)) {
      bots.blind(bot, 2, elapsed);
    }
  }
}

function onExplosion(pos, radius) {
  effects.explosion(pos, radius);
  if (player.state.alive) {
    const dist = player.body.position.distanceTo(pos);
    if (dist < radius) {
      const amount = Math.max(10, 90 * (1 - dist / radius));
      damagePlayer(amount, null, false);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const dist = bot.body.position.distanceTo(pos);
    if (dist < radius) {
      const amount = Math.max(10, 90 * (1 - dist / radius));
      damageBot(bot, amount, 'torso', 'player');
    }
  }
}

const charge = createCharge(scene, dock, {
  audio,
  bots: bots.bots,
  onPlanted(site) {
    match.plantSite = site;
    rounds.awardPlant();
    hud.setMoney(match.money);
    hud.showBanner(`Charge planted at ${site}`, 'Defend it — 35 seconds to detonation.', 3000);
    bots.rotateToSite(site);
  },
  onDefused(bot) {
    rounds.endRound('bulwark', WIN.DEFUSED);
  },
  onDetonated() {
    rounds.endRound('ravens', WIN.DETONATION);
  },
  explosion(pos, radius) {
    onExplosion(pos, radius);
  },
});

// --- rounds -------------------------------------------------------------------

const rounds = createRounds(match, {
  resetEntities() {
    player.reset({ x: 0, z: 13, yaw: 0 });
    arsenal.refill();
    bots.reset(seed);
    charge.reset();
    grenades.reset();
    carrier = 'player';
    hasKevlar = false;
    plantHold = 0;
    hud.setHealth(100, 0);
    hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
    hud.setMoney(match.money);
    hud.setBomb(null);
  },
  onRoundStart(round) {
    hud.showBanner(`Round ${round}`, match.round === 1 ? 'Ravens attack — plant the charge at A or B.' : '', 2200);
    hud.setScore(match.score.ravens, match.score.bulwark, round);
  },
  onLive() {
    hud.showBanner('Go', '', 900);
    audio.buy();
  },
  onRoundEnd(winner, reason) {
    const names = { elimination: 'eliminated the other team', detonation: 'the charge detonated', defused: 'the charge was defused', timeout: 'time ran out' };
    hud.showBanner(`${winner === 'ravens' ? 'Ravens' : 'Bulwark'} win the round`, names[reason] || reason, 3200);
    if (winner === 'ravens') audio.roundWin();
    else audio.roundLose();
    hud.setScore(match.score.ravens, match.score.bulwark, match.round);
    hud.setBomb(null);
    hud.showOverlay('end', { winner, reason: names[reason] || reason });
    if (document.pointerLockElement) document.exitPointerLock();
  },
  onMatchEnd(winner) {
    hud.showOverlay('match', { winner, score: `${match.score.ravens} — ${match.score.bulwark}` });
  },
});

// --- shooting -----------------------------------------------------------------

function shoot(spread) {
  if (!arsenal.takeRound()) {
    audio.dryFire();
    return false;
  }
  const def = arsenal.def();
  camera.getWorldDirection(direction);
  muzzle.copy(camera.position).addScaledVector(direction, 0.5);
  muzzle.y -= 0.12;
  muzzle.x += Math.cos(camera.rotation.y) * 0.12;
  let hitAny = false;
  let killed = false;
  for (let p = 0; p < def.pellets; p += 1) {
    camera.getWorldDirection(direction);
    direction.x += (random() * 2 - 1) * spread;
    direction.y += (random() * 2 - 1) * spread;
    direction.z += (random() * 2 - 1) * spread;
    direction.normalize();
    scene.updateMatrixWorld(true);
    raycaster.set(camera.position, direction);
    const targets = bots.allHitMeshes().concat(dock.shootables);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) continue;
    effects.tracer(muzzle, hit.point, 'ravens');
    if (hit.object.userData.part) {
      const amount = damageAt(def, hit.object.userData.part, hit.distance);
      const bot = hit.object.userData.owner;
      hitAny = true;
      if (damageBot(bot, amount, hit.object.userData.part, 'player')) killed = true;
      audio.hit(killed);
    } else {
      effects.impact(hit.point);
    }
  }
  if (hitAny) hud.hitMarker(killed, shot ? 4000 : 90);
  arsenal.pullTrigger();
  player.mover.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot(def.kind);
  bots.hearShot(player.body.position);
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, def.name);
  return true;
}

function tryPlant(dt) {
  if (match.phase !== PHASE.LIVE || charge.state.state !== 'carried' || carrier !== 'player') return;
  let site = null;
  for (const key of Object.keys(dock.sites)) {
    const s = dock.sites[key];
    const dx = s.center.x - player.body.position.x;
    const dz = s.center.z - player.body.position.z;
    if (Math.hypot(dx, dz) < s.radius) site = key;
  }
  if (!site) {
    plantHold = 0;
    return;
  }
  plantHold += dt;
  hud.setBomb(`Planting… ${Math.ceil(4 - plantHold)}s — hold E`);
  if (plantHold >= 4) {
    plantHold = 0;
    charge.plant(site);
  }
}

// --- buy ----------------------------------------------------------------------

function buy(kind, id) {
  if (match.phase !== PHASE.FREEZE) return;
  if (kind === 'weapon') {
    const before = match.money;
    match.money = arsenal.buy(id, match.money);
    if (match.money !== before) {
      arsenal.equip(id);
      audio.buy();
      hud.setMoney(match.money);
      hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
    }
  } else if (kind === 'grenade') {
    const before = match.money;
    match.money = arsenal.buyGrenade(id, match.money);
    if (match.money !== before) {
      audio.buy();
      hud.setMoney(match.money);
    }
  } else if (kind === 'kevlar') {
    if (!hasKevlar && match.money >= KEVLAR_PRICE) {
      match.money -= KEVLAR_PRICE;
      hasKevlar = true;
      player.state.armor = 100;
      audio.buy();
      hud.setMoney(match.money);
      hud.setHealth(Math.round(player.state.health), 100);
    }
  }
  hud.showBuy(true, match.money, arsenal.state.owned, arsenal.state.grenades, hasKevlar);
}

function toggleBuy() {
  if (match.phase !== PHASE.FREEZE) return;
  buyOpen = !buyOpen;
  hud.showBuy(buyOpen, match.money, arsenal.state.owned, arsenal.state.grenades, hasKevlar);
  if (buyOpen && document.pointerLockElement) document.exitPointerLock();
}

// --- input actions --------------------------------------------------------------

function onKeyDown(event) {
  if (event.repeat) return;
  const code = event.code;
  if (code === 'KeyB') {
    toggleBuy();
    return;
  }
  if (code === 'KeyM') {
    audio.toggleMute();
    return;
  }
  if (code === 'KeyG') {
    const selected = arsenal.state.grenadeSelected;
    if (arsenal.state.grenades[selected] > 0 && player.state.alive && match.phase === PHASE.LIVE) {
      arsenal.state.grenades[selected] -= 1;
      camera.getWorldDirection(direction);
      const origin = camera.position.clone().addScaledVector(direction, 0.6);
      grenades.throwGrenade(selected, origin, direction, 14);
    }
    return;
  }
  if (code === 'KeyR') {
    if (arsenal.reload()) audio.reload();
    return;
  }
  if (buyOpen && match.phase === PHASE.FREEZE) {
    const buyKeys = { Digit1: ['weapon', 'kestrel'], Digit2: ['weapon', 'boar'], Digit3: ['weapon', 'needle'], Digit4: ['grenade', 'flash'], Digit5: ['grenade', 'smoke'], Digit6: ['grenade', 'frag'], Digit7: ['kevlar', 'kevlar'] };
    if (buyKeys[code]) buy(buyKeys[code][0], buyKeys[code][1]);
    return;
  }
  const weaponKeys = { Digit1: 'p7', Digit2: 'kestrel', Digit3: 'boar', Digit4: 'needle' };
  if (weaponKeys[code]) {
    if (arsenal.equip(weaponKeys[code])) {
      audio.buy();
      hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
    }
    return;
  }
  const grenadeKeys = { Digit5: 'flash', Digit6: 'smoke', Digit7: 'frag' };
  if (grenadeKeys[code]) {
    arsenal.state.grenadeSelected = grenadeKeys[code];
  }
}

window.addEventListener('keydown', onKeyDown);

hud.onBuy((kind, id) => buy(kind, id));
hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.phase === PHASE.END) {
    rounds.nextRound();
    hud.hideOverlay();
    input.requestLock();
  } else if (match.phase === PHASE.MATCH) {
    match.score.ravens = 0;
    match.score.bulwark = 0;
    match.round = 1;
    match.money = 800;
    match.lossStreak = 0;
    match.kills = 0;
    match.deaths = 0;
    match.matchWinner = null;
    rounds.startRound();
    hud.hideOverlay();
    input.requestLock();
  } else {
    input.requestLock();
  }
});

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    started = true;
    hud.hideOverlay();
    if (buyOpen) {
      buyOpen = false;
      hud.showBuy(false, match.money, arsenal.state.owned, arsenal.state.grenades, hasKevlar);
    }
  } else if (match.phase === PHASE.END) {
    hud.showOverlay('end', { winner: match.winner, reason: match.winReason });
  } else if (match.phase === PHASE.MATCH) {
    hud.showOverlay('match', { winner: match.matchWinner, score: `${match.score.ravens} — ${match.score.bulwark}` });
  } else if (!player.state.alive) {
    // Dead mid-round: stay in the world, no overlay.
  } else {
    hud.showOverlay(started ? 'paused' : 'start', 0);
  }
});

function syncCamera() {
  camera.position.set(player.body.position.x, player.body.position.y + player.body.eye, player.body.position.z);
  camera.rotation.set(player.body.pitch, player.body.yaw, 0, 'YXZ');
  const wantFov = arsenal.state.scoped ? 74 / arsenal.def().zoom : 74;
  if (Math.abs(camera.fov - wantFov) > 0.1) {
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }
  hud.setCrosshair(arsenal.spread(player.mover.groundSpeed()));
}

function aimAt(point) {
  const dx = point.x - player.body.position.x;
  const dy = point.y - (player.body.position.y + player.body.eye);
  const dz = point.z - player.body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  player.body.yaw = Math.atan2(-dx, -dz);
  player.body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function step(dt) {
  elapsed += dt;
  stepCount += 1;
  const keys = input.state.keys;
  const move = {
    forward: (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0),
    strafe: (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
    jump: keys.has('Space'),
    crouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
  };
  if (player.state.alive && (match.phase === PHASE.LIVE || match.phase === PHASE.FREEZE)) {
    player.step(dt, move);
    if (input.state.useHeld) tryPlant(dt);
    else plantHold = 0;
  }
  arsenal.step(dt);
  bots.step(dt, elapsed);
  grenades.step(dt, elapsed);
  charge.step(dt, elapsed);
  rounds.step(dt);
  effects.step(dt);
  hud.setHealth(Math.round(player.state.health), Math.round(player.state.armor));
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
  hud.setMoney(match.money);
  hud.setTimer(match.phase === PHASE.FREEZE ? match.freezeTime : match.roundTime, match.phase);
  hud.setScore(match.score.ravens, match.score.bulwark, match.round);
  hud.setAlive(ravensAlive(), bots.aliveCount('bulwark'));
  if (charge.state.state === 'planted') {
    hud.setBomb(`CHARGE ${charge.state.site} — ${Math.ceil(charge.state.timer)}s`);
  } else if (charge.state.state === 'carried' && match.phase === PHASE.LIVE && carrier === 'player' && plantHold === 0) {
    hud.setBomb(null);
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.mover.look(look.x, look.y);
    const scoped = input.state.scoping && arsenal.setScoped(true);
    if (!input.state.scoping) arsenal.setScoped(false);
    hud.setScoped(scoped);
    if (player.state.alive && match.phase === PHASE.LIVE) {
      const def = arsenal.def();
      const wantFire = def.auto ? input.state.firing : input.state.firing && !prevFiring;
      if (wantFire && arsenal.ready()) shoot(shot ? 0 : arsenal.spread(player.mover.groundSpeed()));
    }
    prevFiring = input.state.firing;
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function nearestVisibleBot() {
  let best = null;
  let bestDist = Infinity;
  for (const bot of bots.bots) {
    if (bot.team !== 'bulwark' || !bot.alive) continue;
    const dist = bot.body.position.distanceTo(player.body.position);
    if (dist >= bestDist) continue;
    aimPoint.set(bot.body.position.x, bot.body.position.y + 1.2, bot.body.position.z);
    if (grenades.lineOfSight(camera.position, aimPoint)) {
      best = bot;
      bestDist = dist;
    }
  }
  return best;
}

function runShot(name) {
  hud.hideOverlay();
  hud.showBuy(false, match.money, arsenal.state.owned, arsenal.state.grenades, hasKevlar);
  if (name === 'menu') {
    player.body.position.set(0, 0, 13);
    player.body.yaw = 0;
    player.body.pitch = 0;
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  } else if (name === 'buy') {
    player.body.position.set(0, 0, 13);
    player.body.yaw = 0.3;
    player.body.pitch = 0;
    settle(20);
    buyOpen = true;
    match.money = 3200;
    hud.showBuy(true, 3200, { p7: true, kestrel: true }, { flash: 1, smoke: 0, frag: 1 }, false);
    hud.setMoney(3200);
    hud.hideBanner();
  } else if (name === 'site') {
    match.phase = PHASE.LIVE;
    charge.plant('A');
    player.body.position.set(-6, 0, -2);
    settle(30);
    bots.step(0.5, elapsed);
    aimAt(new THREE.Vector3(-13.5, 1.2, -8.5));
    hud.setBomb('CHARGE A — 34s');
    hud.hideBanner();
  } else if (name === 'play' || name === 'end') {
    match.phase = PHASE.LIVE;
    player.body.position.set(0, 0, 10);
    player.body.yaw = 0;
    settle(60);
    for (let i = 0; i < 240; i += 1) step(FIXED_STEP);
    // The firefight may have downed the player; stand them back up for the frame.
    if (!player.state.alive) {
      player.reset({ x: 0, z: 10, yaw: 0 });
      arsenal.refill();
    }
    arsenal.state.owned.kestrel = true;
    syncCamera();
    const target = nearestVisibleBot();
    if (target) {
      aimPoint.set(target.body.position.x, target.body.position.y + 1.2, target.body.position.z);
      aimAt(aimPoint);
      arsenal.equip('kestrel');
      for (let round = 0; round < 3; round += 1) {
        shoot(0);
        settle(8);
      }
    }
    if (name === 'end') {
      rounds.endRound('ravens', WIN.ELIMINATION);
      hud.hideOverlay();
      hud.showBanner('Ravens win the round', 'eliminated the other team', 60000);
      settle(20);
    } else {
      // Freeze right after the last shot so the muzzle flash is still lit.
      settle(1);
      hud.hideBanner();
    }
  }
  hud.setHealth(Math.round(player.state.health), Math.round(player.state.armor));
  hud.setAmmo(arsenal.state.mag, arsenal.state.reserve, arsenal.def().name);
  hud.setMoney(match.money);
  hud.setTimer(match.phase === PHASE.FREEZE ? match.freezeTime : match.roundTime, match.phase);
  hud.setScore(match.score.ravens, match.score.bulwark, match.round);
  hud.setAlive(ravensAlive(), bots.aliveCount('bulwark'));
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.__game = {
  get phase() { return match.phase; },
  get round() { return match.round; },
  get health() { return Math.round(player.state.health); },
  get money() { return match.money; },
  get aliveRavens() { return ravensAlive(); },
  get aliveBulwark() { return bots.aliveCount('bulwark'); },
  get score() { return { ...match.score }; },
  get planted() { return charge.state.state === 'planted'; },
  get steps() { return stepCount; },
};

rounds.startRound();
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
