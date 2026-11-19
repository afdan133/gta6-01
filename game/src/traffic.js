// Ambient traffic and pedestrians: cars cruise the road grid in lanes, slow and stop briefly at
// intersections, and park in lots; peds spawn on sidewalks and wander. Pedestrians flee when a
// `panic` event (shots, car horn close by) happens near them.

import {
  PAL, PED, ROAD_GAP, ROAD_W, TILE, TRAFFIC_CARS, VEHICLE, WORLD_H, WORLD_W,
} from './config.js';
import { laneCenter, T_SIDEWALK, T_SAND } from './city.js';
import { createPed, createVehicle, updatePed, updateVehicle } from './entities.js';

const TAU = Math.PI * 2;

export function createTraffic(city, rng) {
  const cars = [];
  const peds = [];

  // --- traffic cars on roads ---------------------------------------------
  let attempts = 0;
  while (cars.length < TRAFFIC_CARS && attempts < 800) {
    attempts += 1;
    const horizontal = rng.chance(0.5);
    const band = rng.int(0, Math.floor(WORLD_H / (ROAD_GAP * TILE)) - 1);
    const laneOffset = rng.chance(0.5) ? TILE : -TILE; // one of the two lanes
    if (horizontal) {
      const y = band * ROAD_GAP * TILE + ROAD_W / 2 * TILE + laneOffset;
      const x = rng.range(TILE * 4, WORLD_W - TILE * 4);
      if (!city.isRoad(x, y)) continue;
      const dir = laneOffset < 0 ? -1 : 1; // right lane goes +x
      const v = createVehicle(x, y, dir > 0 ? 0 : Math.PI, rng, PAL.carColors, 'traffic');
      v.speed = VEHICLE.trafficSpeed;
      v.laneAxis = 'h';
      v.dir = dir;
      v.forwardSpeed = VEHICLE.trafficSpeed;
      cars.push(v);
    } else {
      const x = band * ROAD_GAP * TILE + ROAD_W / 2 * TILE + laneOffset;
      const y = rng.range(TILE * 4, WORLD_H - TILE * 4);
      if (!city.isRoad(x, y)) continue;
      const dir = laneOffset < 0 ? -1 : 1;
      const v = createVehicle(x, y, dir > 0 ? Math.PI / 2 : -Math.PI / 2, rng, PAL.carColors, 'traffic');
      v.speed = VEHICLE.trafficSpeed;
      v.laneAxis = 'v';
      v.dir = dir;
      v.forwardSpeed = VEHICLE.trafficSpeed;
      cars.push(v);
    }
  }

  // --- parked cars in lots -----------------------------------------------
  for (const lot of city.lots) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + rng.range(TILE, Math.max(TILE + 1, lot.w - TILE));
      const y = lot.y + lot.h / 2 + rng.range(-6, 6);
      cars.push(createVehicle(x, y, Math.PI / 2, rng, PAL.carColors, 'parked'));
    }
  }

  // --- pedestrians on sidewalks ------------------------------------------
  attempts = 0;
  while (peds.length < PED.count && attempts < 3000) {
    attempts += 1;
    const x = rng.range(0, WORLD_W);
    const y = rng.range(0, WORLD_H);
    const t = city.tileAt(x, y);
    if (t !== T_SIDEWALK && t !== T_SAND) continue;
    peds.push(createPed(x, y, rng, PAL.pedShirts, PAL.pedPants));
  }

  return { cars, peds };
}

/**
 * Advance traffic + peds. panic: {x, y, radius} or null — peds inside flee.
 * playerCar: the vehicle the player drives (traffic avoids it), or null.
 * rng: the game's seeded RNG (traffic recycling), falls back to Math.random.
 */
export function updateTraffic(traffic, city, dt, panic, playerCar, rng = Math) {
  const { cars, peds } = traffic;

  for (const c of cars) {
    if (c.kind === 'parked') continue;
    if (c.driver === 'player') continue; // player physics handled in entities

    // Traffic AI: follow lane, stop at intersections briefly, brake for the player.
    if (c.stopTimer > 0) {
      c.stopTimer -= dt;
      c.speed *= Math.max(0, 1 - 6 * dt);
      updateVehicle(c, 0, 0, false, dt, city);
      continue;
    }
    // Slow down near intersections (tile multiples of ROAD_GAP).
    const along = c.laneAxis === 'h' ? c.x : c.y;
    const bandPos = along % (ROAD_GAP * TILE);
    const nearIntersection = bandPos < TILE * 2 || bandPos > ROAD_GAP * TILE - TILE * 2;
    let target = c.forwardSpeed ?? VEHICLE.trafficSpeed;
    if (nearIntersection) target *= 0.45;

    // Brake for the player's car ahead.
    if (playerCar) {
      const dx = playerCar.x - c.x;
      const dy = playerCar.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 90) {
        // Is the player roughly ahead in our direction of travel?
        const fx = Math.cos(c.angle);
        const fy = Math.sin(c.angle);
        if (dx * fx + dy * fy > 0) target = Math.min(target, dist * 0.8);
      }
    }
    // Ease speed toward target.
    c.speed += Math.max(-300 * dt, Math.min(200 * dt, (target - c.speed)));

    // Lane keeping: correct lateral drift.
    if (c.laneAxis === 'h') {
      const want = laneCenter(c.y - c.dir * TILE) + c.dir * TILE;
      const steer = (want - c.y) * 0.01;
      updateVehicle(c, c.speed > 0 ? 0.3 : 0, Math.max(-1, Math.min(1, steer * c.dir)), false, dt, city);
    } else {
      const want = laneCenter(c.x - c.dir * TILE) + c.dir * TILE;
      const steer = (want - c.x) * 0.01;
      updateVehicle(c, c.speed > 0 ? 0.3 : 0, Math.max(-1, Math.min(1, steer * c.dir)), false, dt, city);
    }

    // Occasional red-light stop: pause briefly when crossing a band.
    if (nearIntersection && c.stopTimer <= 0 && c.hornTimer <= 0 && Math.random() < 0.004) {
      c.stopTimer = VEHICLE.stopTime;
    }
    if (c.hornTimer > 0) c.hornTimer -= dt;
  }

  // Peds.
  for (const p of peds) {
    if (panic) {
      const d = Math.hypot(p.x - panic.x, p.y - panic.y);
      if (d < panic.radius && p.state !== 'flee') {
        p.state = 'flee';
        p.timer = 4 + Math.random() * 3;
      }
    }
    updatePed(p, city, dt, panic);
    // Keep peds roughly around the player: if very far, teleport to a sidewalk near the action.
  }

  // Recycle: keep traffic near the player so streets always look alive.
  if (playerCar) {
    for (const c of cars) {
      if (c.kind !== 'traffic' || c.driver === 'player') continue;
      const d = Math.hypot(c.x - playerCar.x, c.y - playerCar.y);
      if (d > 1400) {
        respawnTrafficCar(c, city, rng, playerCar);
      }
    }
  }
}

function respawnTrafficCar(c, city, rng, near) {
  for (let i = 0; i < 40; i += 1) {
    const horizontal = rng.chance(0.5);
    const laneOffset = rng.chance(0.5) ? TILE : -TILE;
    const band = rng.int(0, Math.floor(WORLD_H / (ROAD_GAP * TILE)) - 1);
    let x; let y;
    if (horizontal) {
      y = band * ROAD_GAP * TILE + ROAD_W / 2 * TILE + laneOffset;
      x = near.x + rng.range(-1000, 1000);
      if (x < TILE * 2 || x > WORLD_W - TILE * 2 || !city.isRoad(x, y)) continue;
    } else {
      x = band * ROAD_GAP * TILE + ROAD_W / 2 * TILE + laneOffset;
      y = near.y + rng.range(-1000, 1000);
      if (y < TILE * 2 || y > WORLD_H - TILE * 2 || !city.isRoad(x, y)) continue;
    }
    const dir = laneOffset < 0 ? -1 : 1;
    c.x = x;
    c.y = y;
    c.angle = horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    c.speed = VEHICLE.trafficSpeed;
    c.laneAxis = horizontal ? 'h' : 'v';
    c.dir = dir;
    c.stopTimer = 0;
    return;
  }
}

/** Peds near `point` flee (gunfire, near-misses). */
export function panicAt(traffic, x, y, radius = 220) {
  return { x, y, radius, _traffic: traffic };
}
