// Ambient traffic and crowds.
//
// Traffic cars cruise the road grid in right-hand lanes, ease down near junctions, sometimes
// sit at a "light", brake for whatever the player is driving, and respawn near the player once
// they fall far behind. Peds live on sidewalks and the beach; a panic event (gunshots, a car
// ploughing the curb) sends everyone nearby running.

import { PAL, PED, ROAD_GAP, ROAD_WIDE, TILE, TRAFFIC_CARS, VEHICLE, WORLD_H, WORLD_W } from './config.js';
import { BAND_PX, T_SAND, T_WALK, laneCenter } from './city.js';
import { createPed, createVehicle, updatePed, updateVehicle } from './entities.js';

const BANDS = Math.floor(WORLD_H / BAND_PX);

// Right-hand traffic: lane centre sits one tile off the band centre, side depends on direction.
function laneCoord(band, dir) {
  return band * BAND_PX + (ROAD_WIDE / 2) * TILE + dir * TILE;
}

function trySpawnCar(city, rng, anchor, push) {
  for (let tries = 0; tries < 40; tries += 1) {
    const horiz = rng.chance(0.5);
    const dir = rng.chance(0.5) ? 1 : -1;
    const band = rng.int(0, BANDS - 1);
    let x;
    let y;
    if (horiz) {
      y = laneCoord(band, dir);
      x = anchor ? anchor.x + rng.range(-1000, 1000) : rng.range(TILE * 4, WORLD_W - TILE * 4);
      if (x < TILE * 2 || x > WORLD_W - TILE * 2 || !city.isRoad(x, y)) continue;
    } else {
      x = laneCoord(band, dir);
      y = anchor ? anchor.y + rng.range(-1000, 1000) : rng.range(TILE * 4, WORLD_H - TILE * 4);
      if (y < TILE * 2 || y > WORLD_H - TILE * 2 || !city.isRoad(x, y)) continue;
    }
    const v = createVehicle(
      x, y,
      horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      rng, PAL.carColors, 'traffic',
    );
    v.speed = VEHICLE.trafficSpeed;
    v.cruise = VEHICLE.trafficSpeed;
    v.laneAxis = horiz ? 'h' : 'v';
    v.laneDir = dir;
    push(v);
    return true;
  }
  return false;
}

export function createTraffic(city, rng) {
  const cars = [];
  const peds = [];

  let budget = 800;
  while (cars.length < TRAFFIC_CARS && budget > 0) {
    budget -= 1;
    trySpawnCar(city, rng, null, (v) => cars.push(v));
  }

  // A few parked cars in each harbor lot.
  for (const lot of city.lots) {
    const n = rng.int(2, 5);
    for (let i = 0; i < n; i += 1) {
      const x = lot.x + rng.range(TILE, Math.max(TILE + 1, lot.w - TILE));
      const y = lot.y + lot.h / 2 + rng.range(-6, 6);
      cars.push(createVehicle(x, y, Math.PI / 2, rng, PAL.carColors, 'parked'));
    }
  }

  budget = 3000;
  while (peds.length < PED.count && budget > 0) {
    budget -= 1;
    const x = rng.range(0, WORLD_W);
    const y = rng.range(0, WORLD_H);
    const t = city.tileAt(x, y);
    if (t !== T_WALK && t !== T_SAND) continue;
    peds.push(createPed(x, y, rng, PAL.pedShirts, PAL.pedPants));
  }

  return { cars, peds };
}

/**
 * Step the whole street scene.
 * panic  — {x, y, radius} or null; peds inside flee the point.
 * myCar  — the car the player is driving, or null on foot.
 * rng    — seeded RNG used for respawns.
 */
export function updateTraffic(scene, city, dt, panic, myCar, rng = Math) {
  const { cars, peds } = scene;

  for (const c of cars) {
    if (c.role === 'parked' || c.driver === 'player' || c.exploded) continue;

    // Sitting out a junction timer: coast to a halt.
    if (c.junctionTimer > 0) {
      c.junctionTimer -= dt;
      c.speed *= Math.max(0, 1 - 6 * dt);
      updateVehicle(c, 0, 0, false, dt, city);
      continue;
    }

    // Cruise speed, halved when crossing an intersection.
    const along = c.laneAxis === 'h' ? c.x : c.y;
    const inBand = along % BAND_PX;
    const nearJunction = inBand < TILE * 2 || inBand > BAND_PX - TILE * 2;
    let target = c.cruise ?? VEHICLE.trafficSpeed;
    if (nearJunction) target *= 0.45;

    // Brake for the player's car when it sits ahead of us.
    if (myCar && !myCar.exploded) {
      const dx = myCar.x - c.x;
      const dy = myCar.y - c.y;
      const d = Math.hypot(dx, dy);
      if (d < 90) {
        const ahead = dx * Math.cos(c.angle) + dy * Math.sin(c.angle);
        if (ahead > 0) target = Math.min(target, d * 0.8);
      }
    }
    // Ease toward target speed; braking is snappier than accelerating.
    c.speed += Math.max(-300 * dt, Math.min(200 * dt, target - c.speed));

    // Gentle lane keeping back onto this lane's centre line.
    const ref = c.laneAxis === 'h' ? c.y : c.x;
    const want = laneCenter(ref - c.laneDir * TILE) + c.laneDir * TILE;
    const lateral = c.laneAxis === 'h' ? c.y - want : c.x - want;
    const steer = Math.max(-1, Math.min(1, lateral * 0.01 * c.laneDir));
    updateVehicle(c, c.speed > 0 ? 0.3 : 0, steer, false, dt, city);

    // Rare junction stop, like catching a red light.
    if (nearJunction && Math.random() < 0.004) c.junctionTimer = VEHICLE.junctionPause;
    if (c.siren > 0) c.siren -= dt;
  }

  for (const p of peds) {
    if (panic && p.mode !== 'panic') {
      const d = Math.hypot(p.x - panic.x, p.y - panic.y);
      if (d < panic.radius) {
        p.mode = 'panic';
        p.think = 4 + Math.random() * 3;
      }
    }
    updatePed(p, city, dt, panic ?? { x: p.x, y: p.y });
  }

  // Far-away traffic respawns near the player so streets stay busy anywhere in the map.
  if (myCar) {
    for (const c of cars) {
      if (c.role !== 'traffic' || c.driver === 'player') continue;
      if (Math.hypot(c.x - myCar.x, c.y - myCar.y) > 1400) {
        trySpawnCar(city, rng, myCar, (v) => Object.assign(c, v));
      }
    }
  }
}

export function panicAt(x, y, radius = 220) {
  return { x, y, radius };
}
