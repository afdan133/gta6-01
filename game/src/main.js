// Boot, loop and state machine.
//
// Wires the systems together (city, traffic, player, police, combat, missions, HUD, audio,
// save) into one game object and runs a fixed-step simulation with a smoothed render. This
// file only sequences subsystems and owns the cross-cutting concerns: crimes, camera, death,
// respawn and the HUD's view of the world.

import {
  CAM_ZOOM, DAY_LENGTH, PAL, START_DAY_T, STEP, TILE, WORLD_H, WORLD_W,
} from './config.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { createCity } from './city.js';
import { createRenderer } from './render.js';
import { createPlayer, updatePlayer } from './entities.js';
import { createTraffic, updateTraffic } from './traffic.js';
import { createAudio } from './audio.js';
import { clearPolice, createPolice, reportCrime, starsOf, updatePolice } from './police.js';
import { createCombat } from './combat.js';
import {
  MISSIONS, activeMarker, createMissionState, failMission, objectiveText,
  onMissionCarDestroyed, updateMissions,
} from './missions.js';
import { createHud } from './hud.js';
import { createSaveSystem } from './save.js';

// ---- boot ---------------------------------------------------------------------

const query = new URLSearchParams(window.location.search);
const wantedSeed = Number.parseInt(query.get('seed') ?? '', 10);
const seed = Number.isInteger(wantedSeed) ? wantedSeed : 20260619;

// Start on a quiet corner just off the road grid.
const SPAWN_X = 12.5 * TILE;
const SPAWN_Y = 12.5 * TILE;

const canvas = document.getElementById('game');
const ariaEl = document.getElementById('aria');

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
const saves = createSaveSystem();
const hud = createHud(canvas, renderer.ctx);

player.wantedHeat = 0;
player.lastCrimeT = 999;
combat.initLoadout(player);

const camera = { x: player.x, y: player.y };
const game = {
  seed, city, traffic, player, police, combat, missionState, audio, camera,
  dayT: START_DAY_T,
};

let state = 'title'; // title | playing | wasted | busted | complete
let dayT = START_DAY_T;
let lastTime = nowMs();
let acc = 0;
let district = null;
let districtBanner = 0;
let toast = '';
let toastTimer = 0;
let overlayTimer = 0;

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

// ---- helpers --------------------------------------------------------------------

function announce(text) {
  if (ariaEl) ariaEl.textContent = text;
}

function say(text, seconds = 2.6) {
  toast = text;
  toastTimer = seconds;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// ---- input: title, mute, save/load, weapon slots ----------------------------------

function readGlobalKeys() {
  if (input.wasPressed('keym')) {
    audio.unlock();
    const muted = audio.toggleMute();
    say(muted ? 'Muted (M to unmute)' : 'Sound on');
  }

  if (state === 'title') {
    if (input.wasPressed('enter') || input.mouse.click) startGame();
    return;
  }

  if (state === 'playing') {
    if (input.wasPressed('f5')) say(saves.save(game) ? 'Game saved' : 'Save failed');
    // Q duplicates F9 because browsers swallow the F-keys first.
    if (input.wasPressed('keyq') || input.wasPressed('f9')) {
      const data = saves.load();
      say(data && saves.apply(data, game) ? 'Game loaded' : 'No save found');
      dayT = game.dayT;
    }
    if (input.wasPressed('digit1')) {
      player.weapon = 'fists';
      player.fireCooldown = 0.15;
    }
    if (input.wasPressed('digit2') && player.ammo.pistol > 0) {
      player.weapon = 'pistol';
      player.fireCooldown = 0.15;
    }
    if (input.wasPressed('digit3') && player.ammo.uzi > 0) {
      player.weapon = 'uzi';
      player.fireCooldown = 0.15;
    }
  }

  if ((state === 'wasted' || state === 'busted') && overlayTimer <= 0) {
    if (input.wasPressed('enter') || input.mouse.click) respawn();
  }
}

function startGame() {
  audio.unlock();
  const data = saves.load();
  if (data) {
    saves.apply(data, game);
    dayT = game.dayT;
    say('Save loaded — continue where you left off');
  } else {
    say('Welcome to Sunset City. Follow the yellow marker.');
  }
  state = 'playing';
  announce('Playing Sunset City');
}

// ---- crime, death, respawn --------------------------------------------------------

function onCrime(x, y, kind) {
  reportCrime(police, player, x, y, kind);
  if (kind === 'shoot' || kind === 'killPed') {
    // Gunfire clears the sidewalk.
    updateTraffic(traffic, city, 0, { x, y, radius: 240 }, player.inVehicle, rng);
  }
}

function onWasted() {
  if (state !== 'playing') return;
  state = 'wasted';
  overlayTimer = 1.6;
  audio.fail();
  const fine = Math.min(player.cash, 100);
  player.cash -= fine;
  announce(`Wasted — medical bill $${fine}`);
}

function onBusted() {
  if (state !== 'playing') return;
  state = 'busted';
  overlayTimer = 1.6;
  audio.fail();
  const fine = Math.min(player.cash, 150);
  player.cash -= fine;
  announce(`Busted — bail $${fine}`);
}

/** Back on your feet at the spawn corner: health and heat reset, story progress kept. */
function respawn() {
  player.dead = false;
  player.wasted = false;
  player.health = 100;
  player.armor = 0;
  player.wantedHeat = 0;
  player.lastCrimeT = 999;
  player.x = SPAWN_X;
  player.y = SPAWN_Y;
  player.inVehicle = null;
  clearPolice(police);
  combat.bullets.length = 0;
  if (missionState.state === 'active') {
    failMission(missionState, { audio, player }, 'You went down.');
  }
  camera.x = player.x;
  camera.y = player.y;
  state = 'playing';
  say('Back on your feet. Follow the marker.');
}

// ---- simulation ------------------------------------------------------------------

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

function step(dt) {
  dayT = (dayT + dt / DAY_LENGTH) % 1;
  game.dayT = dayT;
  readGlobalKeys();

  if (state !== 'playing') {
    if (overlayTimer > 0) overlayTimer -= dt;
    return;
  }

  saves.tick(game, dt);

  for (const ev of updatePlayer(player, input, city, dt, traffic.cars)) {
    if (ev === 'enterVehicle') {
      const car = player.inVehicle;
      say('Vehicle taken. WASD to drive, SPACE handbrake, E to step out.');
      if (car && car.role === 'traffic') onCrime(player.x, player.y, 'carjack');
    } else if (ev === 'exitVehicle') {
      say('On foot. E to grab a car, click to shoot.');
    }
  }

  // Aim and fire: hold the button for automatic weapons.
  combat.initLoadout(player);
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
  if (input.mouse.button && !player.dead && !player.inVehicle) {
    const shot = combat.fire(player, aim, combatCtx());
    if (shot.empty) say('Out of ammo — switched to fists.');
  } else if (input.mouse.button && player.inVehicle && player.weapon !== 'fists') {
    combat.fire(player, aim, combatCtx()); // drive-by
  }
  combat.ensurePickups(city, player, rng);

  updateTraffic(traffic, city, dt, null, player.inVehicle, rng);
  updatePolice(police, {
    player, city, combat, audio, onBusted,
  }, dt);

  // Handbrake leaves rubber: one mark per rear wheel.
  const car = player.inVehicle;
  if (car && input.isDown('space') && Math.abs(car.speed) > 120) {
    renderer.addSkid(car.x - Math.cos(car.angle) * 10, car.y - Math.sin(car.angle) * 10, car.angle);
    renderer.addSkid(car.x + Math.cos(car.angle) * 10, car.y + Math.sin(car.angle) * 10, car.angle);
    combat.tireSmoke(car);
  }

  updateMissions(missionState, {
    player, city, combat, traffic, police, audio, onCrime,
    onMissionEvent: () => saves.onMissionEvent(game),
  }, dt);

  if (missionState.state === 'idle' && missionState.textTimer <= 0 && missionState.index >= MISSIONS.length) {
    state = 'complete';
    announce('All missions complete — Sunset City is yours');
  }

  combat.update(dt, combatCtx());

  // Drop corpses so the ped array stays bounded.
  for (let i = traffic.peds.length - 1; i >= 0; i -= 1) {
    if (traffic.peds[i].dead) traffic.peds.splice(i, 1);
  }

  if (car) audio.engine(clamp(Math.abs(car.speed) / 300, 0, 1), true);
  else audio.engine(0, false);
  audio.siren(starsOf(player) > 0 && police.cars.length > 0);

  const here = city.districtAt(player.x, player.y);
  if (here !== district) {
    district = here;
    districtBanner = 3.2;
    announce(`Entered ${here}`);
  }
  if (districtBanner > 0) districtBanner -= dt;
  if (toastTimer > 0) toastTimer -= dt;
}

// ---- camera ----------------------------------------------------------------------

function updateCamera(dt) {
  let tx = player.x;
  let ty = player.y;
  if (player.inVehicle) {
    // Lead the car so the road ahead stays visible.
    tx += Math.cos(player.inVehicle.angle) * 70;
    ty += Math.sin(player.inVehicle.angle) * 70;
  }
  const k = 1 - Math.pow(0.0015, dt);
  camera.x += (tx - camera.x) * k;
  camera.y += (ty - camera.y) * k;

  const halfW = renderer.canvas.width / (2 * CAM_ZOOM);
  const halfH = renderer.canvas.height / (2 * CAM_ZOOM);
  camera.x = clamp(camera.x, Math.min(halfW, WORLD_W / 2), Math.max(WORLD_W - halfW, WORLD_W / 2));
  camera.y = clamp(camera.y, Math.min(halfH, WORLD_H / 2), Math.max(WORLD_H - halfH, WORLD_H / 2));
}

function viewBounds() {
  const halfW = renderer.canvas.width / (2 * CAM_ZOOM);
  const halfH = renderer.canvas.height / (2 * CAM_ZOOM);
  return {
    x0: camera.x - halfW,
    y0: camera.y - halfH,
    x1: camera.x + halfW,
    y1: camera.y + halfH,
  };
}

// ---- drawing ---------------------------------------------------------------------

function inView(view, x, y, pad) {
  return x >= view.x0 - pad && x <= view.x1 + pad && y >= view.y0 - pad && y <= view.y1 + pad;
}

function draw() {
  if (state === 'title') {
    hud.drawTitle(nowMs() / 1000, seed);
    return;
  }

  const view = viewBounds();
  renderer.beginFrame(camera);

  // Ground, decals, then actors, then buildings on top so their lifted roofs occlude streets.
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

  if (state === 'playing') {
    const aim = renderer.screenToWorld(input.mouse.x, input.mouse.y);
    renderer.ctx.setTransform(
      CAM_ZOOM, 0, 0, CAM_ZOOM,
      renderer.canvas.width / 2 - camera.x * CAM_ZOOM,
      renderer.canvas.height / 2 - camera.y * CAM_ZOOM,
    );
    renderer.drawReticle(aim.x, aim.y);
    renderer.ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  let markerScreen = null;
  if (marker) {
    const s = renderer.worldToScreen(marker.x, marker.y);
    markerScreen = {
      sx: s.x,
      sy: s.y,
      onScreen: s.x > 60 && s.x < renderer.canvas.width - 60
        && s.y > 90 && s.y < renderer.canvas.height - 90,
    };
  }

  hud.draw({
    player,
    city,
    dayT,
    wanted: starsOf(player),
    weaponName: (player.weapon || 'fists').toUpperCase(),
    ammo: player.weapon === 'fists' ? null : player.ammo[player.weapon] ?? 0,
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

  if (state === 'wasted') hud.drawPause('WASTED', 'Click or press ENTER to get back up');
  if (state === 'busted') hud.drawPause('BUSTED', 'Click or press ENTER to walk out');
  if (state === 'complete') {
    hud.drawPause('SUNSET CITY', `All missions complete — $${player.cash} in the bank. Thanks for playing.`);
  }
}

// ---- loop ------------------------------------------------------------------------

function frame(now) {
  const dt = Math.min(0.25, (now - lastTime) / 1000); // clamp after a tab-out
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

// Test hooks: the headless smoke run drives everything through window.__city.
window.__city = {
  city, traffic, player, police, combat, missionState, camera, seed,
  save: saves,
  game,
  renderer,
  get dayT() {
    return dayT;
  },
  set dayT(v) {
    dayT = v;
  },
  get state() {
    return state;
  },
  set state(v) {
    state = v;
  },
};

announce('Sunset City — click or press ENTER to start');
requestAnimationFrame(frame);
