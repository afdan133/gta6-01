// Boot, game loop and state machine: title -> playing -> wasted/busted/complete.
//
// Wires the city, traffic, police, combat, missions, HUD, audio and save system into one game
// object, then runs a fixed-step simulation with an interpolated render. Each subsystem keeps
// its own update short; this file only sequences them and handles cross-cutting concerns
// (crimes, death, respawn, camera, HUD state assembly).

import {
  CAMERA_ZOOM, DAY_LENGTH, PAL, START_DAY_T, STEP, TILE, WORLD_H, WORLD_W,
} from './config.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { createCity } from './city.js';
import { createRenderer } from './render.js';
import { createPlayer, updatePlayer } from './entities.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createAudio } from './audio.js';
import { createPolice, updatePolice, reportCrime, starsOf, clearPolice } from './police.js';
import { createCombat } from './combat.js';
import {
  createMissionState, updateMissions, activeMarker, objectiveText,
  failMission, onMissionCarDestroyed, MISSIONS,
} from './missions.js';
import { createHud } from './hud.js';
import { createSaveSystem } from './save.js';

// ---- boot ---------------------------------------------------------------------

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20260619;

const SPAWN_TILE = 12; // player starts on a quiet block, not in traffic
const SPAWN_X = (10 + 2) * TILE + TILE / 2;
const SPAWN_Y = (10 + 2) * TILE + TILE / 2;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');

const input = createInput(canvas);
const renderer = createRenderer(canvas);
const rng = createRandom(seed);
const city = createCity(seed);
const traffic = createTraffic(city, rng);
const player = createPlayer(SPAWN_X, SPAWN_Y);
const audio = createAudio();
const combat = createCombat(audio);
const police = createPolice(city, rng);
const missionState = createMissionState(player);
const saveSystem = createSaveSystem();
const hud = createHud(canvas, renderer.ctx);

player.weapon = 'fists';
player.ammo = { pistol: 0, uzi: 0 };
player.wantedHeat = 0;
player.lastCrimeT = 999;

const camera = { x: player.x, y: player.y };
const game = {
  seed, city, traffic, player, police, combat, missionState, audio, camera,
  dayT: START_DAY_T,
};

let state = 'title';   // title | playing | wasted | busted | complete
let dayT = START_DAY_T;
let lastTime = performance.now();
let acc = 0;
let district = null;
let districtBanner = 0;
let toast = '';
let toastTimer = 0;
let deathTimer = 0;

// ---- small helpers ------------------------------------------------------------

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function setToast(text, seconds = 2.6) {
  toast = text;
  toastTimer = seconds;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---- input: title start, mute, save/load, weapon switch -------------------------

function handleGlobalKeys() {
  if (input.pressed('keym')) {
    audio.unlock();
    audio.setMuted(!audio.muted);
    setToast(audio.muted ? 'Muted (M to unmute)' : 'Sound on');
  }

  if (state === 'title') {
    if (input.pressed('enter') || input.mouse.clicked) startGame();
    return;
  }

  if (state === 'playing') {
    if (input.pressed('f5')) {
      setToast(saveSystem.save(game) ? 'Game saved' : 'Save failed');
    }
    // Q mirrors F9 (some browsers intercept F-keys before the page sees them).
    if (input.pressed('keyq') || input.pressed('f9')) {
      const data = saveSystem.load();
      if (data && saveSystem.apply(data, game)) setToast('Game loaded');
      else setToast('No save found');
    }
    if (input.pressed('digit1')) player.weapon = 'fists';
    if (input.pressed('digit2') && player.ammo.pistol > 0) player.weapon = 'pistol';
    if (input.pressed('digit3') && player.ammo.uzi > 0) player.weapon = 'uzi';
  }

  if ((state === 'wasted' || state === 'busted') && deathTimer <= 0) {
    if (input.pressed('enter') || input.mouse.clicked) respawn();
  }
}

function startGame() {
  audio.unlock();
  // Continue a previous run when one exists; otherwise this is a fresh story.
  const data = saveSystem.load();
  if (data) {
    saveSystem.apply(data, game);
    dayT = game.dayT;
    setToast('Save loaded — continue where you left off');
  } else {
    setToast('Welcome to Sunset City. Follow the yellow marker.');
  }
  state = 'playing';
  announce('Playing Sunset City');
}

// ---- crime / death ------------------------------------------------------------

function onCrime(x, y, kind) {
  reportCrime(police, player, x, y, kind);
  // Gunfire and kills send nearby pedestrians running.
  if (kind === 'shoot' || kind === 'killped') {
    updateTraffic(traffic, city, 0, { x, y, radius: 240 }, player.inVehicle);
  }
}

function onWasted() {
  state = 'wasted';
  deathTimer = 1.6;
  audio.fail();
  const loss = Math.min(player.cash, 100);
  player.cash -= loss;
  announce(`Wasted — lost $${loss}`);
}

function onBusted() {
  if (state !== 'playing') return;
  state = 'busted';
  deathTimer = 1.6;
  audio.fail();
  const loss = Math.min(player.cash, 150);
  player.cash -= loss;
  announce(`Busted — lost $${loss}`);
}

/** Back on your feet: reset health/heat at the spawn corner, keep cash and story progress. */
function respawn() {
  player.dead = false;
  player.health = 100;
  player.armor = 0;
  player.wantedHeat = 0;
  player.lastCrimeT = 999;
  player.x = SPAWN_X;
  player.y = SPAWN_Y;
  player.inVehicle = null;
  clearPolice(police);
  combat.bullets.length = 0;
  if (missionState.state === 'active') failMission(missionState, { audio, player }, 'You went down.');
  camera.x = player.x;
  camera.y = player.y;
  state = 'playing';
  setToast('Back on your feet. Follow the marker.');
}

// ---- simulation ---------------------------------------------------------------

function step(dt) {
  dayT = (dayT + dt / DAY_LENGTH) % 1;
  game.dayT = dayT;
  handleGlobalKeys();

  if (state !== 'playing') {
    if (deathTimer > 0) deathTimer -= dt;
    return;
  }

  saveSystem.tick(game, dt);

  // --- player: walking, driving, enter/exit -----------------------------------
  for (const e of updatePlayer(player, input, city, dt, traffic.cars)) {
    if (e === 'enterVehicle') {
      setToast('Vehicle taken. WASD drive, SPACE handbrake, E exit.');
      if (player.inVehicle.kind === 'traffic') onCrime(player.x, player.y, 'carjack');
    } else if (e === 'exitVehicle') {
      setToast('On foot. E to enter a car, click to shoot.');
    }
  }

  // --- shooting: mouse aim, hold to fire --------------------------------------
  combat.initLoadout(player);
  player.fireCooldown = Math.max(0, (player.fireCooldown ?? 0) - dt);
  const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  if (input.mouse.down && !player.dead) {
    combat.fire(player, aim, combatCtx());
  }
  combat.ensurePickups(city, player, rng);

  // --- world ---------------------------------------------------------------
  updateTraffic(traffic, city, dt, null, player.inVehicle, rng);
  updatePolice(police, { player, city, combat, audio, onBusted }, dt);

  // Handbrake skids: two marks, one per rear wheel.
  const car = player.inVehicle;
  if (car && input.isDown('space') && Math.abs(car.speed) > 120) {
    renderer.addSkid(car.x - Math.cos(car.angle) * 10, car.y - Math.sin(car.angle) * 10, car.angle);
    renderer.addSkid(car.x + Math.cos(car.angle) * 10, car.y + Math.sin(car.angle) * 10, car.angle);
    combat.tireSmoke(car);
  }

  // --- missions ------------------------------------------------------------
  updateMissions(missionState, {
    player, city, combat, traffic, police, audio, onCrime,
    onMissionEvent: () => saveSystem.onMissionEvent(game),
  }, dt);
  if (state === 'playing' && missionState.state === 'idle'
    && missionState.textTimer <= 0 && missionState.index >= MISSIONS.length) {
    state = 'complete';
    announce('All missions complete — Sunset City is yours');
  }

  // --- combat sim (bullets, particles, pickups, crashes) ---------------------
  combat.update(dt, combatCtx());

  // Clear dead peds so the arrays don't grow without bound.
  for (let i = traffic.peds.length - 1; i >= 0; i -= 1) {
    if (traffic.peds[i].dead) traffic.peds.splice(i, 1);
  }

  // --- audio loops ---------------------------------------------------------
  if (car) audio.engine(clamp(Math.abs(car.speed) / 300, 0, 1), true);
  else audio.engine(0, false);
  audio.siren(starsOf(player) > 0 && police.cars.length > 0);

  // --- district banner / timers --------------------------------------------
  const d = city.districtAt(player.x, player.y);
  if (d !== district) {
    district = d;
    districtBanner = 3.2;
    announce(`Entered ${d}`);
  }
  if (districtBanner > 0) districtBanner -= dt;
  if (toastTimer > 0) toastTimer -= dt;
}

/** Shared ctx handed to combat calls — one object shape for fire, update and explosions. */
function combatCtx() {
  return {
    city,
    player,
    peds: traffic.peds,
    cops: police.cops,
    cars: traffic.cars,
    onCrime,
    onWasted,
    shake: (amount) => renderer.addShake(amount),
    onCarDestroyed: (v) => onMissionCarDestroyed(missionState, v),
  };
}

// ---- camera --------------------------------------------------------------------

function updateCamera(dt) {
  let tx = player.x;
  let ty = player.y;
  if (player.inVehicle) {
    // Look ahead of the car so the road you're heading into is visible.
    tx += Math.cos(player.inVehicle.angle) * 70;
    ty += Math.sin(player.inVehicle.angle) * 70;
  }
  const k = 1 - Math.pow(0.0015, dt); // frame-rate independent smoothing
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;

  // Clamp so the view never shows the void past the map edge.
  const halfW = renderer.canvas.width / (2 * CAMERA_ZOOM);
  const halfH = renderer.canvas.height / (2 * CAMERA_ZOOM);
  camera.x = clamp(camera.x, Math.min(halfW, WORLD_W / 2), Math.max(WORLD_W - halfW, WORLD_W / 2));
  camera.y = clamp(camera.y, Math.min(halfH, WORLD_H / 2), Math.max(WORLD_H - halfH, WORLD_H / 2));
}

function viewBounds() {
  const halfW = renderer.canvas.width / (2 * CAMERA_ZOOM);
  const halfH = renderer.canvas.height / (2 * CAMERA_ZOOM);
  return { x0: camera.x - halfW, y0: camera.y - halfH, x1: camera.x + halfW, y1: camera.y + halfH };
}

// ---- drawing -------------------------------------------------------------------

/** Cull helper: is a world point inside the view with some margin? */
function inView(view, x, y, pad) {
  return x >= view.x0 - pad && x <= view.x1 + pad && y >= view.y0 - pad && y <= view.y1 + pad;
}

function draw() {
  if (state === 'title') {
    hud.drawTitle(lastTime / 1000, seed);
    return;
  }

  const view = viewBounds();
  renderer.beginFrame(camera);

  // Ground and decals first, then actors, then buildings on top (they occlude the streets
  // beneath their overhanging roofs, which sells the height).
  renderer.drawCity(city, view);
  renderer.drawSkids(STEP);
  renderer.drawTrees(city, view);

  for (const c of traffic.cars) if (inView(view, c.x, c.y, 60)) renderer.drawCar(c);
  for (const p of traffic.peds) if (inView(view, p.x, p.y, 30)) renderer.drawPed(p);
  for (const c of police.cops) if (inView(view, c.x, c.y, 30)) renderer.drawCop(c);

  renderer.drawBuildings(city, view);

  const marker = activeMarker(missionState);
  if (marker && state === 'playing') renderer.drawMarker(marker.x, marker.y, PAL.hudAccent);

  renderer.drawCombat(combat);
  renderer.drawPlayer(player);
  renderer.endFrame(STEP, dayT);

  // Reticle follows the cursor (screen space, so draw after endFrame).
  if (state === 'playing') {
    const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    renderer.ctx.setTransform(CAMERA_ZOOM, 0, 0, CAMERA_ZOOM,
      renderer.canvas.width / 2 - camera.x * CAMERA_ZOOM,
      renderer.canvas.height / 2 - camera.y * CAMERA_ZOOM);
    renderer.drawReticle(aim.x, aim.y);
    renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  // Marker screen position, used for the minimap blip and the edge arrow.
  const markerScreen = marker
    ? (() => {
      const s = renderer.worldToScreen(marker.x, marker.y);
      return {
        sx: s.x, sy: s.y,
        onScreen: s.x > 60 && s.x < renderer.canvas.width - 60
          && s.y > 90 && s.y < renderer.canvas.height - 90,
      };
    })()
    : null;

  hud.draw({
    player,
    city,
    dayT,
    wanted: starsOf(player),
    weaponName: (player.weapon || 'fists').toUpperCase(),
    ammo: player.weapon === 'fists' ? null : player.ammo[player.weapon],
    vehicleHealth: player.inVehicle ? player.inVehicle.health : null,
    objective: state === 'playing' ? objectiveText(missionState) : '',
    marker,
    markerScreen,
    mission: marker,
    district,
    districtBanner,
    storyText: missionState.storyText,
    storyTimer: missionState.textTimer,
    toast,
    toastTimer,
    policeBlips: [...police.cars, ...police.cops],
  });

  if (state === 'wasted') hud.drawPause('WASTED', 'Click or press ENTER to respawn');
  if (state === 'busted') hud.drawPause('BUSTED', 'Click or press ENTER to respawn');
  if (state === 'complete') {
    hud.drawPause('SUNSET CITY', `All missions complete — $${player.cash} banked. Thanks for playing!`);
  }
}

// ---- loop -----------------------------------------------------------------------

function frame(now) {
  const dt = Math.min(0.25, (now - lastTime) / 1000); // clamp after tab-outs
  lastTime = now;

  // Fixed-step simulation keeps physics deterministic regardless of refresh rate.
  acc += dt;
  while (acc >= STEP) {
    step(STEP);
    input.consume();
    acc -= STEP;
  }

  updateCamera(dt);
  draw();
  requestAnimationFrame(frame);
}

// Debug / smoke-test hooks: the headless test drives the game through window.__city.
window.__city = {
  city, traffic, player, police, combat, missionState, camera, seed,
  save: saveSystem, game,
  get dayT() { return dayT; },
  set dayT(v) { dayT = v; },
  get state() { return state; },
  set state(v) { state = v; },
};

announce('Sunset City — click or press ENTER to start');
requestAnimationFrame(frame);
