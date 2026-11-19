// Police: the wanted system (1-5 stars), police car spawning and chase AI, cops on foot who
// shoot at 3+ stars, and the busted/wasted resolution. Stars rise from crimes reported by
// combat, decay while the player stays out of sight, and drive the siren + minimap blips.

import { ROAD_GAP, TILE, VEHICLE, WORLD_H, WORLD_W } from './config.js';
import { laneCenter } from './city.js';
import { createPed, createVehicle, updatePed, updateVehicle, wrapAngle } from './entities.js';

const TAU = Math.PI * 2;

export function createPolice(city, rng) {
  const cars = [];
  const cops = [];

  return { cars, cops, city, rng };
}

/** Crimes feed in here; heavier crimes add more heat. heat 0-100 maps to stars. */
export function reportCrime(police, player, x, y, kind) {
  const heat = {
    melee: 8, shoot: 6, killped: 45, killcop: 60, carjack: 12,
  }[kind] ?? 5;
  player.wantedHeat = Math.min(100, (player.wantedHeat ?? 0) + heat);
  player.lastCrimeT = 0;
  player.crimePos = { x, y };
}

export function starsOf(player) {
  const h = player.wantedHeat ?? 0;
  if (h <= 0) return 0;
  return Math.min(5, 1 + Math.floor(h / 20));
}

/** Spawn one pursuing police car on a road near the player (off-screen preferred). */
function spawnPoliceCar(police, player) {
  const city = police.city;
  const rng = police.rng;
  for (let i = 0; i < 60; i += 1) {
    const horizontal = rng.chance(0.5);
    const laneOffset = rng.chance(0.5) ? TILE : -TILE;
    const band = rng.int(0, Math.floor(WORLD_H / (ROAD_GAP * TILE)) - 1);
    let x; let y;
    if (horizontal) {
      y = band * ROAD_GAP * TILE + (ROAD_GAP * TILE) / 2 + laneOffset;
      x = player.x + rng.range(-900, 900);
      if (x < TILE * 2 || x > WORLD_W - TILE * 2 || !city.isRoad(x, y)) continue;
    } else {
      x = band * ROAD_GAP * TILE + (ROAD_GAP * TILE) / 2 + laneOffset;
      y = player.y + rng.range(-900, 900);
      if (y < TILE * 2 || y > WORLD_H - TILE * 2 || !city.isRoad(x, y)) continue;
    }
    if (Math.hypot(x - player.x, y - player.y) < 380) continue; // must spawn off-screen-ish
    const dir = laneOffset < 0 ? -1 : 1;
    const v = createVehicle(x, y, horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      rng, ['#20304a'], 'police');
    v.speed = 0;
    v.forwardSpeed = 250;
    v.maxSpeed = VEHICLE.maxSpeed * 1.05;
    v.laneAxis = horizontal ? 'h' : 'v';
    v.dir = dir;
    v.siren = true;
    police.cars.push(v);
    return v;
  }
  return null;
}

/** Spawn a cop on foot near a stopped police car. */
function spawnFootCop(police, x, y) {
  const rng = police.rng;
  const cop = createPed(x, y, rng, ['#20304a'], ['#1a2233']);
  cop.cop = true;
  cop.health = 60;
  cop.speed = 62;
  cop.state = 'chase';
  cop.shootCd = 1.2;
  police.cops.push(cop);
  return cop;
}

/**
 * Update the whole police system.
 * ctx: {player, city, combat, audio, onBusted, dt, view}
 */
export function updatePolice(police, ctx, dt) {
  const { player, city, combat, audio } = ctx;
  const stars = starsOf(player);
  player.wanted = stars;

  // Heat decay: hiding (no recent crime) cools the meter.
  player.lastCrimeT = (player.lastCrimeT ?? 999) + dt;
  if (player.lastCrimeT > 6 && stars > 0) {
    player.wantedHeat = Math.max(0, player.wantedHeat - dt * (2.5 + stars));
  }
  if (stars === 0) player.wantedHeat = Math.max(0, (player.wantedHeat ?? 0) - dt * 6);

  // --- spawn / despawn ----------------------------------------------------
  const wantCars = stars === 0 ? 0 : Math.min(6, stars + 1);
  const wantCops = stars >= 3 ? Math.min(6, stars - 1) : 0;
  if (police.cars.length < wantCars && Math.random() < 0.02 + stars * 0.01) {
    spawnPoliceCar(police, player);
  }
  while (police.cops.length < wantCops && police.cars.length > 0) {
    const c = police.cars[0];
    spawnFootCop(police, c.x, c.y);
    c.copsOut = true;
  }
  // Remove units when the heat cools or they fall far behind.
  for (let i = police.cars.length - 1; i >= 0; i -= 1) {
    const c = police.cars[i];
    if (c.exploded) { police.cars.splice(i, 1); continue; }
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (stars === 0 || d > 1500) police.cars.splice(i, 1);
  }
  for (let i = police.cops.length - 1; i >= 0; i -= 1) {
    const c = police.cops[i];
    if (c.dead) { police.cops.splice(i, 1); continue; }
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (stars === 0 || d > 900) police.cops.splice(i, 1);
  }

  // --- police cars chase ---------------------------------------------------
  for (const c of police.cars) {
    const dx = player.x - c.x;
    const dy = player.y - c.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    if (player.inVehicle) {
      // Pursuit: steer toward the player, throttle hard; brake when very close.
      const diff = wrapAngle(toPlayer - c.angle);
      const steer = Math.max(-1, Math.min(1, diff * 2.2));
      const throttle = dist > 60 ? 1 : (c.speed > 60 ? -0.6 : 0.2);
      updateVehicle(c, throttle, steer, false, dt, city);
    } else {
      // Player on foot: pull up alongside, then stop (arcs for the busted check).
      if (dist > 70) {
        const diff = wrapAngle(toPlayer - c.angle);
        updateVehicle(c, 0.9, Math.max(-1, Math.min(1, diff * 2.2)), false, dt, city);
      } else {
        updateVehicle(c, c.speed > 10 ? -0.6 : 0, 0, false, dt, city);
        if (!c.copsOut && police.cops.length < 6) {
          spawnFootCop(police, c.x, c.y);
          c.copsOut = true;
        }
      }
    }
    // Busted: slow car contact while the player is on foot near cops.
    if (!player.inVehicle && !player.dead && dist < 34 && Math.abs(c.speed) < 40 && police.cops.length > 0) {
      if (ctx.onBusted) ctx.onBusted();
    }
  }

  // --- cops on foot ---------------------------------------------------------
  for (const cop of police.cops) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.timer = 0;
    // Walk toward the player.
    if (dist > 140) {
      cop.targetAngle = Math.atan2(dy, dx);
      cop.state = 'chase';
    } else {
      cop.state = 'aim';
      cop.targetAngle = Math.atan2(dy, dx);
    }
    // Sidestep strafe while aiming.
    const move = dist > 60 ? 1 : -0.4;
    const nx = cop.x + Math.cos(cop.targetAngle) * cop.speed * move * dt;
    const ny = cop.y + Math.sin(cop.targetAngle) * cop.speed * move * dt;
    if (!city.solidAt(nx, ny) && !city.pointInBuilding(nx, ny)) {
      cop.x = nx;
      cop.y = ny;
    } else {
      cop.targetAngle += Math.PI / 2;
    }
    cop.angle = cop.targetAngle;
    // Shoot at 3+ stars, pistol pace.
    cop.shootCd -= dt;
    if (stars >= 3 && dist < 320 && cop.shootCd <= 0 && !player.dead) {
      cop.shootCd = 0.65 + Math.random() * 0.5;
      const aim = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.16;
      combat.spawnBullet({
        x: cop.x + Math.cos(aim) * 12, y: cop.y + Math.sin(aim) * 12,
        angle: aim, speed: 620, dmg: 8, owner: 'cop', life: 320 / 620, color: '#ffd0d0',
      });
      if (audio) audio.gunshot(true);
    }
    // Melee arrest when very close and heat is low.
  }

  // Cops also flee-triggering panic is not needed; they are the ones causing it.
  updatePedUnused(police, city, dt);
}

function updatePedUnused() { /* cops use custom movement above; kept for symmetry */ }

/** True when the player can be busted right now (on foot, cop within arm's reach). */
export function bustedCheck(police, player) {
  if (player.inVehicle || player.dead) return false;
  for (const cop of police.cops) {
    if (Math.hypot(cop.x - player.x, cop.y - player.y) < 18) return true;
  }
  return false;
}

/** Reset after busted/wasted: clear heat and units. */
export function clearPolice(police) {
  police.cars.length = 0;
  police.cops.length = 0;
}

export { laneCenter };
