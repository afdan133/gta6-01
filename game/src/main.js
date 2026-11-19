// Boot and the game loop. Stage S1+S2: the city exists, the player walks and drives, ambient
// traffic and pedestrians live around them, the camera follows and the sunset tint moves.
// Later stages add police, combat, missions, HUD and save on top of this same loop.

import {
  CAMERA_ZOOM, DAY_LENGTH, MAP_H, MAP_W, PAL, START_DAY_T, STEP, TILE, WORLD_H, WORLD_W,
} from './config.js';
import { createRandom } from './random.js';
import { createInput } from './input.js';
import { createCity } from './city.js';
import { createRenderer } from './render.js';
import { createPlayer, updatePlayer } from './entities.js';
import { createTraffic, updateTraffic } from './traffic.js';

const params = new URLSearchParams(window.location.search);
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20260619;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const input = createInput(canvas);
const renderer = createRenderer(canvas);
const rng = createRandom(seed);
const city = createCity(seed);
const traffic = createTraffic(city, rng);
const player = createPlayer((10 + 2) * TILE + TILE / 2, (10 + 2) * TILE + TILE / 2);
player.angle = 0;

const camera = { x: player.x, y: player.y };

let dayT = START_DAY_T;
let lastTime = performance.now();
let acc = 0;
let district = null;
let bannerTimer = 0;
let toast = '';
let toastTimer = 0;

function announce(text) {
  if (status) status.textContent = text;
}

function setToast(text, seconds = 2.2) {
  toast = text;
  toastTimer = seconds;
}

/** Camera: lerp toward the player, clamp to the world, and lead slightly in the driving direction. */
function updateCamera(dt) {
  let tx = player.x;
  let ty = player.y;
  if (player.inVehicle) {
    tx += Math.cos(player.inVehicle.angle) * 70;
    ty += Math.sin(player.inVehicle.angle) * 70;
  }
  const k = 1 - Math.pow(0.0015, dt); // smooth follow
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

function step(dt) {
  dayT = (dayT + dt / DAY_LENGTH) % 1;

  const events = updatePlayer(player, input, city, dt, traffic.cars);
  for (const e of events) {
    if (e === 'enterVehicle') setToast('Vehicle stolen. WASD drive, SPACE handbrake, E exit.');
    if (e === 'exitVehicle') setToast('On foot. E to enter a car.');
    announce(e);
  }

  updateTraffic(traffic, city, dt, null, player.inVehicle);

  // District banner.
  const d = city.districtAt(player.x, player.y);
  if (d !== district) {
    district = d;
    bannerTimer = 3.2;
    announce(`Entered ${d}`);
  }
  if (bannerTimer > 0) bannerTimer -= dt;
  if (toastTimer > 0) toastTimer -= dt;
}

function draw() {
  renderer.beginFrame(camera);
  const view = viewBounds();
  renderer.drawCity(city, view);
  renderer.drawTrees(city, view);

  // Cars under the player? Draw all vehicles, then peds, then the player on foot on top.
  for (const c of traffic.cars) {
    if (c.x < view.x0 - 60 || c.x > view.x1 + 60 || c.y < view.y0 - 60 || c.y > view.y1 + 60) continue;
    renderer.drawCar(c);
  }
  for (const p of traffic.peds) {
    if (p.x < view.x0 - 30 || p.x > view.x1 + 30 || p.y < view.y0 - 30 || p.y > view.y1 + 30) continue;
    renderer.drawPed(p);
  }
  renderer.drawBuildings(city, view);
  renderer.drawPlayer(player);
  renderer.endFrame(1 / 60, dayT);

  drawOverlay();
}

function drawOverlay() {
  const ctx = renderer.ctx;
  const { width, height } = renderer.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // District banner (top centre).
  if (bannerTimer > 0 && district) {
    const alpha = Math.min(1, bannerTimer);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = PAL.hudBg;
    ctx.fillRect(width / 2 - 150, 28, 300, 46);
    ctx.fillStyle = PAL.hudAccent;
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(district.toUpperCase(), width / 2, 60);
    ctx.globalAlpha = 1;
  }

  // Controls hint + clock (placeholder HUD until S4's real HUD module).
  ctx.fillStyle = PAL.hudBg;
  ctx.fillRect(12, 12, 330, 74);
  ctx.fillStyle = PAL.hudText;
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const mode = player.inVehicle ? 'DRIVING' : 'ON FOOT';
  ctx.fillText(`${mode}   $${player.cash}   HP ${Math.round(player.health)}`, 22, 32);
  ctx.fillText(player.inVehicle
    ? 'WASD drive   SPACE handbrake   E exit'
    : 'WASD walk   SHIFT run   E enter car', 22, 52);
  ctx.fillStyle = PAL.hudAccent;
  const hh = Math.floor(((dayT + 0.25) % 1) * 24).toString().padStart(2, '0');
  const mm = Math.floor(((((dayT + 0.25) % 1) * 24) % 1) * 60).toString().padStart(2, '0');
  ctx.fillText(`SUNSET CITY  ${hh}:${mm}`, 22, 72);

  if (toastTimer > 0) {
    ctx.globalAlpha = Math.min(1, toastTimer);
    ctx.fillStyle = PAL.hudBg;
    ctx.fillRect(width / 2 - 240, height - 76, 480, 40);
    ctx.fillStyle = PAL.hudText;
    ctx.font = '15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(toast, width / 2, height - 50);
    ctx.globalAlpha = 1;
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

// Debug hook for the screenshot pass and for checking the build headlessly.
window.__city = { city, traffic, player, camera, seed, get dayT() { return dayT; }, set dayT(v) { dayT = v; } };

announce('Sunset City — WASD to walk, E to enter a car');
requestAnimationFrame(frame);
