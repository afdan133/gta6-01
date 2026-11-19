// Police and the five-star wanted system.
//
// Crimes push heat into the player; heat maps to stars; stars decide how many units exist.
// Police cars are driven by the same arcade physics as everything else and simply chase the
// player's position, while officers on foot bail out at close range and open fire at three
// stars and above. Staying clean cools heat down and sends the whole force home.

import { ROAD_GAP, TILE, VEHICLE, WANTED, WORLD_H, WORLD_W } from './config.js';
import { createPed, createVehicle, updateVehicle } from './entities.js';

const BAND = ROAD_GAP * TILE;
const BANDS = Math.floor(WORLD_H / BAND);

// How much heat each kind of crime is worth.
const HEAT = {
  melee: 8,
  shoot: 6,
  carjack: 14,
  killPed: 45,
  killCop: 62,
};

export function createPolice(city, rng) {
  return { cars: [], cops: [], city, rng };
}

export function reportCrime(police, player, x, y, kind) {
  const add = HEAT[kind] ?? 5;
  player.wantedHeat = Math.min(100, (player.wantedHeat ?? 0) + add);
  player.lastCrimeT = 0;
  player.crimePos = { x, y };
  return player.wantedHeat;
}

/** Heat -> whole stars, 0..5. */
export function starsOf(player) {
  const heat = player.wantedHeat ?? 0;
  if (heat <= 0) return 0;
  let stars = 0;
  for (let s = 1; s <= 5; s += 1) {
    if (heat >= WANTED.heatToStars[s]) stars = s;
  }
  return stars;
}

function spawnCruiser(police, player) {
  const { city, rng } = police;
  for (let i = 0; i < 60; i += 1) {
    const horiz = rng.chance(0.5);
    const dir = rng.chance(0.5) ? 1 : -1;
    const band = rng.int(0, BANDS - 1);
    const lane = band * BAND + (ROAD_GAP * TILE) / 2 + dir * TILE;
    let x;
    let y;
    if (horiz) {
      y = lane;
      x = player.x + rng.range(-900, 900);
      if (x < TILE * 2 || x > WORLD_W - TILE * 2 || !city.isRoad(x, y)) continue;
    } else {
      x = lane;
      y = player.y + rng.range(-900, 900);
      if (y < TILE * 2 || y > WORLD_H - TILE * 2 || !city.isRoad(x, y)) continue;
    }
    if (Math.hypot(x - player.x, y - player.y) < 380) continue; // arrive from off-screen
    const car = createVehicle(
      x, y,
      horiz ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      rng, ['#20304a'], 'police',
    );
    car.speed = 0;
    car.cruise = 260;
    car.topSpeed = VEHICLE.maxSpeed * 1.05; // tuned to just about catch a good driver
    car.laneAxis = horiz ? 'h' : 'v';
    car.laneDir = dir;
    car.siren = 1;
    police.cars.push(car);
    return car;
  }
  return null;
}

function spawnOfficer(police, x, y) {
  const cop = createPed(x, y, police.rng, ['#20304a'], ['#1a2233']);
  cop.cop = true;
  cop.health = 60;
  cop.walkSpeed = 64;
  cop.mode = 'chase';
  cop.shootCd = 1.2;
  police.cops.push(cop);
  return cop;
}

/**
 * Step the whole force.
 * ctx = { player, city, combat, audio, onBusted }
 */
export function updatePolice(police, ctx, dt) {
  const { player, city, combat, audio } = ctx;
  const stars = starsOf(player);
  player.wanted = stars;

  // Cooling: after a grace period away from crime, heat bleeds off faster the more stars are up.
  player.lastCrimeT = (player.lastCrimeT ?? 999) + dt;
  if (stars > 0 && player.lastCrimeT > WANTED.coolDelay) {
    player.wantedHeat = Math.max(0, player.wantedHeat - dt * (2.5 + stars));
  }
  if (stars === 0) {
    player.wantedHeat = Math.max(0, (player.wantedHeat ?? 0) - dt * 6);
  }

  // ---- how many units the current star level calls for ----
  const wantCars = stars === 0 ? 0 : Math.min(WANTED.maxCars, stars + 1);
  const wantFoot = stars >= WANTED.footCopsAtStars ? Math.min(WANTED.maxFoot, stars - 1) : 0;

  if (police.cars.length < wantCars && Math.random() < 0.02 + stars * 0.01) {
    spawnCruiser(police, player);
  }
  while (police.cops.length < wantFoot && police.cars.length > 0) {
    const car = police.cars[0];
    spawnOfficer(police, car.x, car.y);
    car.copsOut = true;
  }

  // ---- retire units that are done with ----
  for (let i = police.cars.length - 1; i >= 0; i -= 1) {
    const c = police.cars[i];
    const gone = c.exploded || stars === 0 || Math.hypot(c.x - player.x, c.y - player.y) > 1500;
    if (gone) police.cars.splice(i, 1);
  }
  for (let i = police.cops.length - 1; i >= 0; i -= 1) {
    const c = police.cops[i];
    const gone = c.dead || stars === 0 || Math.hypot(c.x - player.x, c.y - player.y) > 900;
    if (gone) police.cops.splice(i, 1);
  }

  // ---- cruisers ----
  for (const car of police.cars) {
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.hypot(dx, dy);
    const bearing = Math.atan2(dy, dx);
    let steer = (bearing - car.angle + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    steer = Math.max(-1, Math.min(1, steer * 2.2));

    if (player.inVehicle) {
      // Chase: full gas, but don't ram at point-blank range.
      const throttle = dist > 60 ? 1 : car.speed > 60 ? -0.6 : 0.2;
      updateVehicle(car, throttle, steer, false, dt, city);
    } else if (dist > 70) {
      updateVehicle(car, 0.9, steer, false, dt, city);
    } else {
      updateVehicle(car, car.speed > 10 ? -0.6 : 0, 0, false, dt, city);
      if (!car.copsOut && police.cops.length < WANTED.maxFoot) {
        spawnOfficer(police, car.x, car.y);
        car.copsOut = true;
      }
    }

    // Busted: a cruiser creeping next to a pedestrian player with officers around.
    if (!player.inVehicle && !player.wasted && dist < 34 && Math.abs(car.speed) < 40 && police.cops.length > 0) {
      if (ctx.onBusted) ctx.onBusted();
    }
  }

  // ---- officers on foot ----
  for (const cop of police.cops) {
    const dx = player.x - cop.x;
    const dy = player.y - cop.y;
    const dist = Math.hypot(dx, dy);
    cop.mode = dist > 140 ? 'chase' : 'aim';
    cop.heading = Math.atan2(dy, dx);

    // Close the gap, or back off a touch while shooting.
    const advance = dist > 60 ? 1 : -0.4;
    const step = (cop.walkSpeed ?? 62) * advance * dt;
    const nx = cop.x + Math.cos(cop.heading) * step;
    const ny = cop.y + Math.sin(cop.heading) * step;
    if (city.solidAt(nx, ny) || city.pointInBuilding(nx, ny)) {
      cop.heading += Math.PI / 2; // sidestep around the corner
    } else {
      cop.x = nx;
      cop.y = ny;
    }
    cop.angle = cop.heading;

    cop.shootCd -= dt;
    if (stars >= 3 && dist < 320 && cop.shootCd <= 0 && !player.wasted) {
      cop.shootCd = 0.65 + Math.random() * 0.5;
      const aim = cop.heading + (Math.random() - 0.5) * 0.16;
      combat.spawnBullet({
        x: cop.x + Math.cos(aim) * 12,
        y: cop.y + Math.sin(aim) * 12,
        angle: aim,
        speed: 620,
        dmg: 8,
        owner: 'cop',
        life: 320 / 620,
        color: '#ffd0d0',
      });
      if (audio) audio.gunshot(true);
    }
  }
}

/** True when an officer is right on top of a player who is on foot. */
export function bustedCheck(police, player) {
  if (player.inVehicle || player.wasted) return false;
  for (const cop of police.cops) {
    if (Math.hypot(cop.x - player.x, cop.y - player.y) < 18) return true;
  }
  return false;
}

export function clearPolice(police) {
  police.cars.length = 0;
  police.cops.length = 0;
}
