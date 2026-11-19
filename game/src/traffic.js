// Ambient traffic and pedestrians.
//
// Traffic cars cruise the road grid in lanes, slow near intersections, occasionally pause at a
// "light", brake for the player, and recycle back into view when they drift far from the action.
// Peds spawn on sidewalks and the beach and wander; a `panic` event (gunfire, near-miss) sends
// everyone within its radius running.

import {
  PAL, PED, ROAD_GAP, ROAD_W, TILE, TRAFFIC_CARS, VEHICLE, WORLD_H, WORLD_W,
} from './config.js';
import { laneCenter, T_SAND, T_SIDEWALK } from './city.js';
import { createPed, createVehicle, updatePed, updateVehicle } from './entities.js';

const ROAD_BAND = ROAD_GAP * TILE;
const BAND_COUNT = Math.floor(WORLD_H / ROAD_BAND);

/** Position along a lane centre for one of the two lanes (offset a full tile from centre). */
function laneCoordinate(band, laneOffset) {
  return band * ROAD_BAND + (ROAD_W / 2) * TILE + laneOffset;
}

function spawnTrafficCar(city, rng, near, out) {
  // Try a handful of random road spots; `near` (optional) keeps respawns around the player.
  for (let i = 0; i < 40; i += 1) {
    const horizontal = rng.chance(0.5);
    const laneOffset = rng.chance(0.5) ? TILE : -TILE; // right-hand lane by direction
    const band = rng.int(0, BAND_COUNT - 1);
    const dir = laneOffset < 0 ? -1 : 1;
    let x;
    let y;
    if (horizontal) {
      y = laneCoordinate(band, laneOffset);
      x = near ? near.x + rng.range(-1000, 1000) : rng.range(TILE * 4, WORLD_W - TILE * 4);
      if (x < TILE * 2 || x > WORLD_W - TILE * 2 || !city.isRoad(x, y)) continue;
    } else {
      x = laneCoordinate(band, laneOffset);
      y = near ? near.y + rng.range(-1000, 1000) : rng.range(TILE * 4, WORLD_H - TILE * 4);
      if (y < TILE * 2 || y > WORLD_H - TILE * 2 || !city.isRoad(x, y)) continue;
    }
    const v = createVehicle(
      x, y,
      horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      rng, PAL.carColors, 'traffic',
    );
    v.speed = VEHICLE.trafficSpeed;
    v.forwardSpeed = VEHICLE.trafficSpeed;
    v.laneAxis = horizontal ? 'h' : 'v';
    v.dir = dir;
    out(v);
    return true;
  }
  return false;
}

export function createTraffic(city, rng) {
  const cars = [];
  const peds = [];

  // Traffic cars on the road grid.
  let attempts = 0;
  while (cars.length < TRAFFIC_CARS && attempts < 800) {
    attempts += 1;
    spawnTrafficCar(city, rng, null, (v) => cars.push(v));
  }

  // Parked cars inside the harbor lots.
  for (const lot of city.lots) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + rng.range(TILE, Math.max(TILE + 1, lot.w - TILE));
      const y = lot.y + lot.h / 2 + rng.range(-6, 6);
      cars.push(createVehicle(x, y, Math.PI / 2, rng, PAL.carColors, 'parked'));
    }
  }

  // Peds on sidewalks and the beach.
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
 * Advance all traffic and peds.
 * panic: {x, y, radius} or null — peds inside the radius start fleeing.
 * playerCar: the vehicle the player is driving (traffic brakes for it), or null.
 * rng: the game's seeded RNG, used for respawns; defaults to Math.
 */
export function updateTraffic(traffic, city, dt, panic, playerCar, rng = Math) {
  const { cars, peds } = traffic;

  for (const c of cars) {
    if (c.kind === 'parked' || c.driver === 'player') continue; // player physics handled in entities

    // Pausing at an intersection: coast to a stop, then wait out the timer.
    if (c.stopTimer > 0) {
      c.stopTimer -= dt;
      c.speed *= Math.max(0, 1 - 6 * dt);
      updateVehicle(c, 0, 0, false, dt, city);
      continue;
    }

    // Target speed: cruise, halved near intersections, clamped when the player is ahead.
    const along = c.laneAxis === 'h' ? c.x : c.y;
    const bandPos = along % ROAD_BAND;
    const nearIntersection = bandPos < TILE * 2 || bandPos > ROAD_BAND - TILE * 2;
    let target = c.forwardSpeed ?? VEHICLE.trafficSpeed;
    if (nearIntersection) target *= 0.45;

    if (playerCar) {
      const dx = playerCar.x - c.x;
      const dy = playerCar.y - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 90) {
        // Is the player roughly ahead of us in our travel direction?
        if (dx * Math.cos(c.angle) + dy * Math.sin(c.angle) > 0) target = Math.min(target, dist * 0.8);
      }
    }
    // Ease speed toward the target (asymmetric: brake faster than accelerate).
    c.speed += Math.max(-300 * dt, Math.min(200 * dt, target - c.speed));

    // Lane keeping: steer gently back to this lane's centre line.
    const laneRef = c.laneAxis === 'h' ? c.y : c.x;
    const want = laneCenter(laneRef - c.dir * TILE) + c.dir * TILE;
    const lateral = c.laneAxis === 'h' ? c.y - want : c.x - want;
    const steer = Math.max(-1, Math.min(1, lateral * 0.01 * c.dir));
    updateVehicle(c, c.speed > 0 ? 0.3 : 0, steer, false, dt, city);

    // Occasional red-light stop when crossing an intersection.
    if (nearIntersection && Math.random() < 0.004) c.stopTimer = VEHICLE.stopTime;
    if (c.hornTimer > 0) c.hornTimer -= dt;
  }

  // Peds: scare them with panic events, then let them act.
  for (const p of peds) {
    if (panic && p.state !== 'flee') {
      const d = Math.hypot(p.x - panic.x, p.y - panic.y);
      if (d < panic.radius) {
        p.state = 'flee';
        p.timer = 4 + Math.random() * 3;
      }
    }
    updatePed(p, city, dt, panic ?? { x: p.x, y: p.y });
  }

  // Recycle: traffic that drifts too far from the player respawns on a road nearby,
  // so streets always look alive no matter where the player goes.
  if (playerCar) {
    for (const c of cars) {
      if (c.kind !== 'traffic' || c.driver === 'player') continue;
      if (Math.hypot(c.x - playerCar.x, c.y - playerCar.y) > 1400) {
        spawnTrafficCar(city, rng, playerCar, (v) => Object.assign(c, v));
      }
    }
  }
}

/**
 * Build a panic event at a world point. The returned object is passed to updateTraffic;
 * peds inside `radius` flee the point for a few seconds.
 */
export function panicAt(x, y, radius = 220) {
  return { x, y, radius };
}
