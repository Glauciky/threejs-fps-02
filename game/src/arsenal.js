// The arsenal: four weapons, one table, one view model. The table owns the
// numbers (damage, headshot multiplier, magazine, price); the view model is
// rebuilt from boxes when the weapon changes. Firing is hitscan: the caller
// owns the ray and the damage, this module owns the magazine, the cooldown,
// the reload and the spread that punishes moving.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p7: { id: 'p7', name: 'P7 Sidearm', price: 0, damage: 34, headMult: 3, mag: 12, reserve: Infinity, gap: 0.16, auto: false, reload: 1.4, spreadStill: 0.002, spreadMove: 0.02, pellets: 1, zoom: 1, kind: 'pistol' },
  kestrel: { id: 'kestrel', name: 'Kestrel-9 Carbine', price: 2700, damage: 30, headMult: 3, mag: 30, reserve: 90, gap: 0.096, auto: true, reload: 1.9, spreadStill: 0.0022, spreadMove: 0.028, pellets: 1, zoom: 1, kind: 'rifle' },
  boar: { id: 'boar', name: 'Boar-12 Shotgun', price: 1700, damage: 12, headMult: 2, mag: 6, reserve: 24, gap: 0.9, auto: false, reload: 2.4, spreadStill: 0.02, spreadMove: 0.05, pellets: 8, zoom: 1, kind: 'shotgun' },
  needle: { id: 'needle', name: 'Needle DMR', price: 4200, damage: 85, headMult: 3, mag: 10, reserve: 30, gap: 1.1, auto: false, reload: 2.6, spreadStill: 0.0012, spreadMove: 0.04, pellets: 1, zoom: 2.2, kind: 'dmr' },
};

export const GRENADE_DEFS = {
  flash: { id: 'flash', name: 'Flashbang', price: 200 },
  smoke: { id: 'smoke', name: 'Smoke', price: 300 },
  frag: { id: 'frag', name: 'Frag Grenade', price: 300 },
};

export const KEVLAR_PRICE = 650;

// Damage with range falloff: full out to 12 m, then down to 60% at 40 m.
export function damageAt(def, part, distance) {
  const falloff = 1 - 0.4 * Math.min(1, Math.max(0, distance - 12) / 28);
  const mult = part === 'head' ? def.headMult : 1;
  return def.damage * mult * falloff;
}

export function createArsenal(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  // The receiver is dark steel with an orange spine, so the gun reads as a
  // gun against both the pale containers and the night sky.
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232c38'), roughness: 0.55, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.2 });

  let model = null;
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    weaponId: 'p7',
    owned: { p7: true },
    mag: WEAPONS.p7.mag,
    reserve: WEAPONS.p7.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    scoped: false,
    grenades: { flash: 0, smoke: 0, frag: 0 },
    grenadeSelected: 'flash',
  };

  function buildModel(def) {
    if (model) camera.remove(model);
    model = new THREE.Group();
    const dims = {
      pistol: { receiver: [0.07, 0.09, 0.22], barrel: [0.04, 0.04, 0.16], stock: null, scope: false },
      rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22], scope: false },
      shotgun: { receiver: [0.1, 0.11, 0.5], barrel: [0.06, 0.06, 0.42], stock: [0.08, 0.09, 0.24], scope: false },
      dmr: { receiver: [0.09, 0.1, 0.5], barrel: [0.04, 0.04, 0.5], stock: [0.075, 0.08, 0.26], scope: true },
    }[def.kind];
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(...dims.receiver), body);
    model.add(receiver);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(dims.receiver[0] * 0.4, 0.02, dims.receiver[2] * 0.8), accent);
    spine.position.set(0, dims.receiver[1] / 2 + 0.01, 0);
    model.add(spine);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(...dims.barrel), grip);
    barrel.position.set(0, 0.025, -0.38);
    model.add(barrel);
    if (dims.stock) {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(...dims.stock), grip);
      stock.position.set(0, -0.02, 0.3);
      model.add(stock);
    }
    if (dims.scope) {
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.2), accent);
      scope.position.set(0, 0.09, -0.05);
      model.add(scope);
    }
    model.position.set(0.24, -0.2, -0.42);
    camera.add(model);
  }

  buildModel(WEAPONS.p7);

  function def() {
    return WEAPONS[state.weaponId];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    if (model) {
      model.position.z = -0.42 + state.kick;
      model.rotation.x = state.kick * 2.2;
      if (state.reloadLeft > 0) model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
    }
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        if (state.reserve !== Infinity) state.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = 0.055;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed) {
      const d = def();
      const moveFactor = Math.min(1, speed / 5.2);
      const base = d.spreadStill + moveFactor * d.spreadMove;
      return state.scoped ? base * 0.35 : base;
    },
    equip(id) {
      if (!state.owned[id] || state.weaponId === id) return false;
      state.weaponId = id;
      const d = WEAPONS[id];
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.scoped = false;
      buildModel(d);
      return true;
    },
    buy(id, money) {
      const d = WEAPONS[id];
      if (!d || state.owned[id] || money < d.price) return money;
      state.owned[id] = true;
      return money - d.price;
    },
    buyGrenade(id, money) {
      const d = GRENADE_DEFS[id];
      if (!d || money < d.price) return money;
      state.grenades[id] += 1;
      return money - d.price;
    },
    setScoped(on) {
      state.scoped = on && def().zoom > 1;
      return state.scoped;
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.scoped = false;
    },
  };
}
