// Headless smoke test: stub just enough DOM/canvas/localStorage to boot main.js, then run
// ~1100 fixed-step frames — walk, steal a car, fire both guns, earn five stars, blow a car
// up, touch a mission marker, save/load, die, and sweep every state — catching any runtime
// error along the way. Run: node scripts/smoke.mjs  (dev tool; not shipped inside game/)

import { pathToFileURL } from 'node:url';

const calls = new Map();
function ctxStub() {
  const grad = { addColorStop() {} };
  return new Proxy({ canvas: null }, {
    get(t, k) {
      if (k === 'canvas') return t.canvas;
      if (k === 'measureText') return () => ({ width: 42 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (typeof k === 'string' && k in t) return t[k];
      return () => {
        calls.set(k, (calls.get(k) || 0) + 1);
        return undefined;
      };
    },
    set(t, k, v) {
      t[k] = v;
      return true;
    },
  });
}

const canvas = {
  width: 1280,
  height: 720,
  clientWidth: 1280,
  clientHeight: 720,
  getContext: () => ctx,
  addEventListener() {},
  getBoundingClientRect: () => ({ left: 0, top: 0 }),
};
const ctx = ctxStub();
ctx.canvas = canvas;

const listeners = {};
globalThis.window = {
  addEventListener: (t, f) => {
    (listeners[t] ||= []).push(f);
  },
  location: { search: '' },
  devicePixelRatio: 1,
};
globalThis.document = {
  getElementById: (id) => (id === 'game' ? canvas : { textContent: '' }),
};
globalThis.performance = globalThis.performance || { now: () => Date.now() };
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
let rafCb = null;
globalThis.requestAnimationFrame = (cb) => {
  rafCb = cb;
  return 1;
};
globalThis.AudioContext = undefined; // audio module must degrade to no-ops

await import(pathToFileURL(new URL('../game/src/main.js', import.meta.url).pathname).href);

const g = globalThis.window.__city;
if (!g) throw new Error('window.__city missing — main.js did not boot');

let clock = 0;
function tick(n, ms = 16.7) {
  for (let i = 0; i < n; i += 1) {
    if (!rafCb) throw new Error('rAF not scheduled');
    const cb = rafCb;
    rafCb = null;
    clock += ms;
    cb(clock);
  }
}

// Title screen frames, then into gameplay.
tick(2);
g.state = 'playing';
tick(120);

// Walk into a car and drive off.
const car = g.traffic.cars.find((c) => c.role !== 'police' && !c.exploded);
g.player.x = car.x;
g.player.y = car.y;
listeners.keydown.forEach((f) => f({ code: 'KeyE', preventDefault() {} }));
tick(3);
listeners.keyup.forEach((f) => f({ code: 'KeyE' }));
if (!g.player.inVehicle) throw new Error('enter vehicle failed');
tick(60);

// Give both guns and fire a burst on foot.
g.combat.giveWeapon(g.player, 'pistol', 100);
g.combat.giveWeapon(g.player, 'uzi', 200);
g.player.inVehicle = null;
const combatCtx = () => ({
  city: g.city,
  peds: g.traffic.peds,
  cops: g.police.cops,
  cars: g.traffic.cars,
  player: g.player,
  onCrime: () => {},
  shake: () => {},
});
for (let i = 0; i < 40; i += 1) {
  g.combat.fire(g.player, { x: g.player.x + 200, y: g.player.y + 40 }, combatCtx());
  tick(2);
}

// Max heat should bring the police force out.
g.player.wantedHeat = 100;
g.player.lastCrimeT = 0;
tick(400);
if (!g.police.cars.length) throw new Error('police never spawned at five stars');

// And an explosion should exercise blast + area damage.
const target = g.traffic.cars.find((c) => !c.exploded) || g.traffic.cars[0];
g.combat.explode(target, { ...combatCtx(), player: g.player, shake: () => {}, onCarDestroyed: () => {} });
tick(30);

// Missions: stand on the giver marker and let the interpreter run.
const marker = g.missionState.index;
g.player.x = (46 + 0.5) * 24;
g.player.y = (47 + 0.5) * 24;
tick(10);
if (g.missionState.index !== marker) throw new Error('mission did not start at the marker');
tick(200);

// Save / load round trip.
if (!g.save.save(g.game)) throw new Error('save failed');
const data = g.save.load();
if (!data || data.player.cash !== g.player.cash) throw new Error('save/load mismatch');
if (!g.save.apply(data, g.game)) throw new Error('apply failed');

// Death and the wasted overlay.
g.player.health = 1;
g.combat.damagePlayer(g.player, 50, { onWasted: () => { g.state = 'wasted'; } });
tick(5);

// Every render path: title, play, and each end-state.
g.state = 'title';
tick(3);
g.state = 'playing';
tick(3);
g.state = 'wasted';
tick(3);
g.state = 'busted';
tick(3);
g.state = 'complete';
tick(3);

console.log('SMOKE OK');
console.log(`frames ~${1100} | cars ${g.traffic.cars.length} | peds ${g.traffic.peds.length} | police ${g.police.cars.length}/${g.police.cops.length}`);
console.log(`missions done ${g.missionState.completed.length} index ${g.missionState.index} state ${g.missionState.state}`);
console.log(`particles ${g.combat.particles.length} bullets ${g.combat.bullets.length} pickups ${g.combat.pickups.length}`);
