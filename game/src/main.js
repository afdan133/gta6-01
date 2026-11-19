// Boot, the game loop and the state machine: title → playing → brief → busted/wasted.
// Wires city, traffic, police, combat, missions, HUD, audio and save together into one game
// object and keeps each subsystem's update short and readable.

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
import { createPolice, updatePolice, reportCrime, starsOf, clearPolice, bustedCheck } from './police.js';
import { createCombat } from './combat.js';
import {
  createMissionState, updateMissions, activeMarker, objectiveText,
  failMission, onMissionCarDestroyed, MISSIONS,
} from './missions.js';
import { createHud } from './hud.js';
import { createSaveSystem } from './save.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20260619;

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const rng = createRandom(seed);
const city = createCity(seed);
const traffic = createTraffic(city, rng);
const player = createPlayer((10 + 2) * TILE + TILE / 2, (10 + 2) * TILE + TILE / 2);
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
  seed, city, traffic, player, police, combat, missionState, audio, camera, dayT: START_DAY_T,
};

let state = 'title'; // title | playing | wasted | busted | complete
let dayT = START_DAY_T;
let lastTime = performance.now();
let acc = 0;
let district = null;
let districtBanner = 0;
let toast = '';
let toastTimer = 0;
let deathTimer = 0;
let timeAlive = 0;

function announce(text) {
  if (statusEl) statusEl.textContent = text;
}

function setToast(text, seconds = 2.6) {
  toast = text;
  toastTimer = seconds;
}

// ---- input events: title start, mute, save/load, weapon switch -------------

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
      if (saveSystem.save(game)) setToast('Game saved'); else setToast('Save failed');
    }
    if (input.pressed('keyq')) { // F9 is intercepted by some browsers; Q = quick load too
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
  const data = saveSystem.load();
  if (data) {
    saveSystem.apply(data, game);
    setToast('Save loaded — continue where you left off');
  } else {
    setToast('Welcome to Sunset City. Follow the yellow marker.');
  }
  state = 'playing';
  announce('Playing Sunset City');
}

// ---- crime / death wiring ---------------------------------------------------

function onCrime(x, y, kind) {
  reportCrime(police, player, x, y, kind);
  // Shots panic nearby peds.
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

function respawn() {
  // Reset at a safe spot, lose weapons heat, keep cash and missions.
  player.dead = false;
  player.health = 100;
  player.armor = 0;
  player.wantedHeat = 0;
  player.lastCrimeT = 999;
  player.x = (10 + 2) * TILE + TILE / 2;
  player.y = (10 + 2) * TILE + TILE / 2;
  player.inVehicle = null;
  clearPolice(police);
  combat.bullets.length = 0;
  if (missionState.state === 'active') failMission(missionState, { audio, player }, 'You went down.');
  camera.x = player.x;
  camera.y = player.y;
  state = 'playing';
  setToast('Back on your feet. Follow the marker.');
}

// ---- simulation step ---------------------------------------------------------

function step(dt) {
  timeAlive += dt;
  dayT = (dayT + dt / DAY_LENGTH) % 1;
  game.dayT = dayT;
  handleGlobalKeys();
  if (state !== 'playing') {
    if (deathTimer > 0) deathTimer -= dt;
    if (state === 'title') return;
    return;
  }

  saveSystem.tick(game, dt);

  // Player (movement + vehicle enter/exit).
  const events = updatePlayer(player, input, city, dt, traffic.cars);
  for (const e of events) {
    if (e === 'enterVehicle' && player.inVehicle.kind !== 'police') {
      // Carjacking is a crime if the car had an AI driver or is a mission car.
      setToast('Vehicle taken. WASD drive, SPACE handbrake, E exit.');
      if (player.inVehicle.kind === 'traffic') onCrime(player.x, player.y, 'carjack');
    }
    if (e === 'exitVehicle') setToast('On foot. E to enter a car, click to shoot.');
  }

  // Shooting: mouse aim, click fire (works on foot; drive-by uses the car's facing).
  combat.initLoadout(player);
  player.fireCooldown = Math.max(0, (player.fireCooldown ?? 0) - dt);
  const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  if (input.mouse.down && !player.dead) {
    combat.fire(player, aim, {
      city, peds: traffic.peds, cops: police.cops, cars: traffic.cars,
      player, onCrime, shake: (a) => renderer.addShake(a),
      onCarDestroyed: (v) => { onMissionCarDestroyed(missionState, v); },
      onKill: null,
    });
  }
  // Passive regen is minimal; pickups are the main source of health.
  combat.ensurePickups(city, player, rng);

  // Traffic + panic propagation.
  updateTraffic(traffic, city, dt, null, player.inVehicle, rng);

  // Police.
  updatePolice(police, {
    player, city, combat, audio, onBusted,
  }, dt);

  // Handbrake skids.
  if (player.inVehicle && input.isDown('space') && Math.abs(player.inVehicle.speed) > 120) {
    const v = player.inVehicle;
    renderer.addSkid(v.x - Math.cos(v.angle) * 10, v.y - Math.sin(v.angle) * 10, v.angle);
    renderer.addSkid(v.x + Math.cos(v.angle) * 10, v.y + Math.sin(v.angle) * 10, v.angle);
  }

  // Missions.
  updateMissions(missionState, {
    player, city, combat, traffic, police, audio,
  }, dt);
  if (missionState.state === 'idle' && missionState.textTimer <= 0 && missionState.index >= MISSIONS.length && state === 'playing') {
    // All missions done.
    state = 'complete';
  }

  // Combat sim (bullets, particles, pickups).
  combat.update(dt, {
    city, player, peds: traffic.peds, cops: police.cops, cars: traffic.cars,
    shake: (a) => renderer.addShake(a), onWasted, onCrime,
    onCarDestroyed: (v) => onMissionCarDestroyed(missionState, v),
  });

  // Dead peds cleanup (leave a body for a while).
  for (let i = traffic.peds.length - 1; i >= 0; i -= 1) {
    if (traffic.peds[i].dead) traffic.peds.splice(i, 1);
  }

  // Audio loops: engine pitch by speed, siren while wanted.
  if (player.inVehicle) {
    const sp = Math.abs(player.inVehicle.speed) / 300;
    audio.engine(Math.min(1, sp), true);
  } else {
    audio.engine(0, false);
  }
  audio.siren(starsOf(player) > 0 && police.cars.length > 0);

  // District banner.
  const d = city.districtAt(player.x, player.y);
  if (d !== district) {
    district = d;
    districtBanner = 3.2;
    announce(`Entered ${d}`);
  }
  if (districtBanner > 0) districtBanner -= dt;
  if (toastTimer > 0) toastTimer -= dt;
  if (missionState.textTimer > 0) missionState.textTimer -= dt;
}

// ---- camera -------------------------------------------------------------------

function updateCamera(dt) {
  let tx = player.x;
  let ty = player.y;
  if (player.inVehicle) {
    tx += Math.cos(player.inVehicle.angle) * 70;
    ty += Math.sin(player.inVehicle.angle) * 70;
  }
  const k = 1 - Math.pow(0.0015, dt);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;
  const halfW = renderer.canvas.width / (2 * CAMERA_ZOOM);
  const halfH = renderer.canvas.height / (2 * CAMERA_ZOOM);
  camera.x = Math.max(Math.min(halfW, WORLD_W / 2), Math.min(WORLD_W - halfW, camera.x));
  camera.y = Math.max(Math.min(halfH, WORLD_H / 2), Math.min(WORLD_H - halfH, camera.y));
}

function viewBounds() {
  const halfW = renderer.canvas.width / (2 * CAMERA_ZOOM);
  const halfH = renderer.canvas.height / (2 * CAMERA_ZOOM);
  return { x0: camera.x - halfW, y0: camera.y - halfH, x1: camera.x + halfW, y1: camera.y + halfH };
}

// ---- drawing ------------------------------------------------------------------

function draw() {
  const ctx = renderer.ctx;
  const view = viewBounds();
  if (state === 'title') {
    hud.drawTitle(lastTime / 1000, seed);
    return;
  }

  renderer.beginFrame(camera);
  renderer.drawCity(city, view);
  renderer.drawSkids(STEP);
  renderer.drawTrees(city, view);

  for (const c of traffic.cars) {
    if (c.x < view.x0 - 60 || c.x > view.x1 + 60 || c.y < view.y0 - 60 || c.y > view.y1 + 60) continue;
    renderer.drawCar(c);
  }
  for (const p of traffic.peds) {
    if (p.x < view.x0 - 30 || p.x > view.x1 + 30 || p.y < view.y0 - 30 || p.y > view.y1 + 30) continue;
    renderer.drawPed(p);
  }
  for (const c of police.cops) {
    if (c.x < view.x0 - 30 || c.x > view.x1 + 30 || c.y < view.y0 - 30 || c.y > view.y1 + 30) continue;
    renderer.drawCop(c);
  }
  renderer.drawBuildings(city, view);

  // Mission markers above buildings.
  const marker = activeMarker(missionState, city);
  if (marker && state === 'playing') {
    renderer.drawMarker(marker.x, marker.y, PAL.hudAccent);
  }

  renderer.drawCombat(combat);
  renderer.drawPlayer(player);
  renderer.endFrame(STEP, dayT);

  // Reticle.
  if (state === 'playing') {
    const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    renderer.drawReticle(aim.x, aim.y);
  }

  // HUD.
  const ms = marker
    ? {
      ...marker,
      markerScreen: (() => {
        const s = renderer.worldToScreen(marker.x, marker.y);
        return {
          sx: s.x, sy: s.y,
          onScreen: s.x > 60 && s.x < renderer.canvas.width - 60 && s.y > 90 && s.y < renderer.canvas.height - 90,
        };
      })(),
    }
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
    marker: ms,
    district,
    districtBanner,
    storyText: missionState.storyText,
    storyTimer: missionState.textTimer,
    toast,
    toastTimer,
    policeBlips: [...police.cars, ...police.cops],
    mission: ms,
  });

  if (state === 'wasted') hud.drawPause('WASTED', 'Click or press ENTER to respawn');
  if (state === 'busted') hud.drawPause('BUSTED', 'Click or press ENTER to respawn');
  if (state === 'complete') {
    hud.drawPause('SUNSET CITY', `All missions complete — $${player.cash} banked. Thanks for playing!`);
  }
}

function frame(now) {
  const dt = Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;
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

// Debug / screenshot hooks.
window.__city = {
  city, traffic, player, police, combat, missionState, camera, seed, save: saveSystem, game,
  get dayT() { return dayT; },
  set dayT(v) { dayT = v; },
  get state() { return state; },
  set state(v) { state = v; },
};

announce('Sunset City — click or press ENTER to start');
requestAnimationFrame(frame);
