// The DOM HUD: health and armour, ammo, money, the round timer, the score,
// alive counts, the kill feed, the bomb status, a crosshair that widens with
// spread, a hitmarker, a damage vignette, the round banner, the buy menu and
// the start/pause/end overlays. It never touches the simulation; main.js
// pushes numbers in and reads the buy callback out.
import { WEAPONS, GRENADE_DEFS, KEVLAR_PRICE } from './arsenal.js';

const BUY_ROWS = [
  { key: '1', kind: 'weapon', id: 'kestrel' },
  { key: '2', kind: 'weapon', id: 'boar' },
  { key: '3', kind: 'weapon', id: 'needle' },
  { key: '4', kind: 'grenade', id: 'flash' },
  { key: '5', kind: 'grenade', id: 'smoke' },
  { key: '6', kind: 'grenade', id: 'frag' },
  { key: '7', kind: 'kevlar', id: 'kevlar' },
];

const COPY = {
  start: {
    title: 'Night Harbor',
    copy: 'Ravens attack, Bulwark defend. Plant the Spark Charge at A or B, or clear the other team. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'Night Harbor',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  end: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const el = (id) => document.getElementById(id);
  const overlay = el('overlay');
  const title = el('overlay-title');
  const copy = el('overlay-copy');
  const play = el('play');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const ammoName = el('ammo-name');
  const ammoBox = el('ammo');
  const healthBar = el('health-fill');
  const healthNum = el('health-num');
  const armorNum = el('armor-num');
  const moneyValue = el('money-value');
  const timerValue = el('timer-value');
  const timerBox = el('timer');
  const scoreRavens = el('score-ravens');
  const scoreBulwark = el('score-bulwark');
  const roundValue = el('round-value');
  const aliveRavens = el('alive-ravens');
  const aliveBulwark = el('alive-bulwark');
  const killfeed = el('killfeed');
  const bombBox = el('bomb');
  const bombText = el('bomb-text');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const vignette = el('vignette');
  const whiteout = el('whiteout');
  const banner = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const buyMenu = el('buymenu');
  const buyList = el('buy-list');
  const buyMoney = el('buy-money');

  let hitTimer = 0;
  let bannerTimer = 0;
  let lastAmmo = '';
  let lastHealth = -1;
  let lastArmor = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastAlive = '';

  function renderBuy(money, owned, grenades, hasKevlar) {
    let html = '';
    for (const row of BUY_ROWS) {
      let name = '';
      let price = 0;
      let ownedNow = false;
      let extra = '';
      if (row.kind === 'weapon') {
        name = WEAPONS[row.id].name;
        price = WEAPONS[row.id].price;
        ownedNow = !!owned[row.id];
      } else if (row.kind === 'grenade') {
        name = GRENADE_DEFS[row.id].name;
        price = GRENADE_DEFS[row.id].price;
        extra = grenades[row.id] > 0 ? ` x${grenades[row.id]}` : '';
      } else {
        name = 'Kevlar Vest';
        price = KEVLAR_PRICE;
        ownedNow = hasKevlar;
      }
      const afford = money >= price;
      const cls = ownedNow ? 'owned' : afford ? '' : 'poor';
      const tag = ownedNow ? 'OWNED' : `$${price}`;
      html += `<button type="button" class="buy-row ${cls}" data-kind="${row.kind}" data-id="${row.id}"><kbd>${row.key}</kbd><span>${name}${extra}</span><b>${tag}</b></button>`;
    }
    buyList.innerHTML = html;
    buyMoney.textContent = `$${money}`;
  }

  return {
    setHealth(hp, armor) {
      if (hp === lastHealth && armor === lastArmor) return;
      lastHealth = hp;
      lastArmor = armor;
      healthBar.style.width = `${hp}%`;
      healthBar.classList.toggle('low', hp <= 30);
      healthNum.textContent = String(hp);
      armorNum.textContent = armor > 0 ? `+${armor}` : '';
    },
    setAmmo(mag, reserve, name) {
      const key = `${mag}|${reserve}|${name}`;
      if (key === lastAmmo) return;
      lastAmmo = key;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = reserve === Infinity ? '/ ∞' : `/ ${reserve}`;
      ammoName.textContent = name;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(money) {
      if (money === lastMoney) return;
      lastMoney = money;
      moneyValue.textContent = `$${money}`;
    },
    setTimer(seconds, phase) {
      const text = `${Math.max(0, Math.ceil(seconds))}`;
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
      timerBox.classList.toggle('freeze', phase === 'freeze');
    },
    setScore(ravens, bulwark, round) {
      const key = `${ravens}|${bulwark}|${round}`;
      if (key === lastScore) return;
      lastScore = key;
      scoreRavens.textContent = String(ravens);
      scoreBulwark.textContent = String(bulwark);
      roundValue.textContent = `ROUND ${round}`;
    },
    setAlive(ravens, bulwark) {
      const key = `${ravens}|${bulwark}`;
      if (key === lastAlive) return;
      lastAlive = key;
      aliveRavens.textContent = '●'.repeat(ravens) + '○'.repeat(5 - ravens);
      aliveBulwark.textContent = '●'.repeat(bulwark) + '○'.repeat(5 - bulwark);
    },
    killFeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 5) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 6000);
    },
    setBomb(status) {
      if (!status) {
        bombBox.hidden = true;
        return;
      }
      bombBox.hidden = false;
      bombText.textContent = status;
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.style.transform = killed ? 'translate(-50%, -50%) rotate(45deg) scale(1.25)' : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.style.transform = '';
      }, holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      setTimeout(() => vignette.classList.remove('on'), 180);
    },
    flashWhite(strength) {
      whiteout.style.opacity = String(Math.min(1, strength));
      const start = performance.now();
      const duration = 900 + strength * 1200;
      function fade(now) {
        const k = (now - start) / duration;
        if (k >= 1) {
          whiteout.style.opacity = '0';
          return;
        }
        whiteout.style.opacity = String(Math.min(1, strength) * (1 - k));
        requestAnimationFrame(fade);
      }
      requestAnimationFrame(fade);
    },
    setCrosshair(spread) {
      const gap = 3 + Math.min(14, spread * 400);
      crosshair.style.setProperty('--gap', `${gap}px`);
    },
    setScoped(on) {
      document.body.classList.toggle('scoped', on);
    },
    showBanner(text, sub, holdMs = 2600) {
      bannerTitle.textContent = text;
      bannerSub.textContent = sub;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, holdMs);
    },
    hideBanner() {
      banner.hidden = true;
      clearTimeout(bannerTimer);
    },
    showBuy(open, money, owned, grenades, hasKevlar) {
      buyMenu.hidden = !open;
      if (open) renderBuy(money, owned, grenades, hasKevlar);
    },
    onBuy(handler) {
      buyList.addEventListener('click', (event) => {
        const row = event.target.closest('.buy-row');
        if (row) handler(row.dataset.kind, row.dataset.id);
      });
    },
    showOverlay(mode, data) {
      const text = COPY[mode];
      title.textContent = text.title;
      if (mode === 'end') {
        copy.textContent = `${data.winner === 'ravens' ? 'Ravens' : 'Bulwark'} take the round — ${data.reason}.`;
      } else if (mode === 'match') {
        copy.textContent = data.winner ? `${data.winner === 'ravens' ? 'Ravens' : 'Bulwark'} win the match ${data.score}.` : `A draw, ${data.score}.`;
      } else {
        copy.textContent = text.copy;
      }
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
