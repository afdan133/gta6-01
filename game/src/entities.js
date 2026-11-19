// Entities: the player (on foot + driving), pedestrians, and the shared arcade vehicle physics
// used by everything on wheels. Movement resolves circle-vs-building collision against the city;
// vehicles use forward accel, lateral grip damping, and drift while the handbrake is held.

import { PED, PLAYER, TILE, VEHICLE, WORLD_H, WORLD_W } from './config.js';
import { T_WATER } from './city.js';

const TAU = Math.PI * 2;

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function createPlayer(x, y) {
  return {
    x, y,
    angle: 0,
    vx: 0, vy: 0,
    health: PLAYER.maxHealth,
    armor: 0,
    cash: 250,
    inVehicle: null,   // vehicle object while driving
    walkAngle: 0,
    wanted: 0,
  };
}

export function createPed(x, y, rng, shirtList, pantsList) {
  return {
    x, y,
    angle: rng.range(0, TAU),
    shirt: rng.pick(shirtList),
    pants: rng.pick(pantsList),
    vx: 0, vy: 0,
    state: 'walk',          // walk | flee
    timer: rng.range(1, 4), // seconds until the next wander decision
    targetAngle: 0,
    alive: true,
  };
}

export function createVehicle(x, y, angle, rng, colorList, kind = 'parked') {
  return {
    x, y, angle,
    vx: 0, vy: 0,        // velocity in world axes
    speed: 0,            // signed forward speed
    color: rng.pick(colorList),
    kind,                // parked | traffic | police
    driver: null,        // 'player' or null (mission tags set extra fields)
    health: 100,
    stopTimer: 0,        // intersection pause countdown
    laneAxis: null,      // 'h' | 'v' for traffic cars
    dir: 1,              // lane direction along the axis
    hornTimer: 0,
  };
}

/**
 * Push a circle (player, ped) out of buildings and water.
 * Samples 8 points on the rim and nudges the entity back along each blocked direction.
 * Returns true when any contact happened.
 */
function collideCircle(city, ent, radius) {
  let hit = false;
  const blocked = (px, py) => {
    if (city.solidAt(px, py)) return true;
    const b = city.pointInBuilding(px, py);
    return !!(b && b.height > 0);
  };
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const px = ent.x + Math.cos(a) * radius;
    const py = ent.y + Math.sin(a) * radius;
    if (!blocked(px, py)) continue;
    hit = true;
    // Back off toward the centre until this probe is free (bounded, so no infinite loops).
    for (let s = 0; s < 6 && blocked(px, py); s += 1) {
      ent.x += Math.cos(a + Math.PI) * 2;
      ent.y += Math.sin(a + Math.PI) * 2;
    }
  }
  ent.x = Math.max(radius, Math.min(WORLD_W - radius, ent.x));
  ent.y = Math.max(radius, Math.min(WORLD_H - radius, ent.y));
  return hit;
}

/**
 * Shared vehicle physics. throttle in [-1, 1] (positive = gas), steer in [-1, 1],
 * handbrake boolean (drift). Returns true when the car bumped something this step.
 */
export function updateVehicle(v, throttle, steer, handbrake, dt, city) {
  // Longitudinal: accel, brake-to-reverse, or coast with engine drag.
  if (throttle > 0) {
    v.speed += VEHICLE.accel * throttle * dt;
  } else if (throttle < 0) {
    v.speed += (v.speed > 0 ? -VEHICLE.brake : VEHICLE.reverseAccel) * throttle * dt;
  } else {
    v.speed -= v.speed * 1.4 * dt; // rolling friction
  }
  v.speed = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed, v.speed));

  // Steering authority fades in with speed so stationary cars don't pirouette.
  const steerEff = steer * VEHICLE.turnRate * Math.min(1, Math.abs(v.speed) / 90);
  v.angle = wrapAngle(v.angle + steerEff * dt * Math.sign(v.speed || 1));

  // Velocity is forward along the facing plus a lateral slip term. Handbraking injects slip
  // from the steering input and bleeds it off slowly, which reads as a drift.
  const fx = Math.cos(v.angle);
  const fy = Math.sin(v.angle);
  v.lat = (v.lat || 0) + (handbrake ? steerEff * v.speed * dt * 0.9 : 0);
  v.lat -= v.lat * (handbrake ? VEHICLE.handbrakeGrip : VEHICLE.driftGrip) * dt;
  const oldVx = fx * v.speed - fy * v.lat;
  const oldVy = fy * v.speed + fx * v.lat;
  v.vx = oldVx;
  v.vy = oldVy;

  v.x += v.vx * dt;
  v.y += v.vy * dt;

  // Collision: probe the four bounding corners; on a hit, kill most of the speed and back out.
  const hx = Math.abs(fx) * VEHICLE.length / 2 + Math.abs(fy) * VEHICLE.width / 2;
  const hy = Math.abs(fy) * VEHICLE.length / 2 + Math.abs(fx) * VEHICLE.width / 2;
  let bumped = false;
  const corners = [
    [v.x - hx, v.y - hy], [v.x + hx, v.y - hy],
    [v.x - hx, v.y + hy], [v.x + hx, v.y + hy],
  ];
  for (const [cx, cy] of corners) {
    if (city.solidAt(cx, cy) || city.pointInBuilding(cx, cy)) { bumped = true; break; }
  }
  if (bumped) {
    v.speed *= -0.25;              // small rebound
    v.x -= oldVx * dt * 1.5;       // undo most of this step's motion
    v.y -= oldVy * dt * 1.5;
  }
  v.x = Math.max(VEHICLE.length / 2, Math.min(WORLD_W - VEHICLE.length / 2, v.x));
  v.y = Math.max(VEHICLE.length / 2, Math.min(WORLD_H - VEHICLE.length / 2, v.y));
  return bumped;
}

/** Player update: on foot or driving. Returns events such as 'enterVehicle' / 'exitVehicle'. */
export function updatePlayer(player, input, city, dt, vehicles) {
  const events = [];

  if (player.inVehicle) {
    const v = player.inVehicle;
    const ax = input.axes();
    updateVehicle(v, -ax.y, ax.x, input.isDown('space'), dt, city); // W = forward
    player.x = v.x;
    player.y = v.y;
    player.angle = v.angle;
    if (input.pressed('keye') || input.pressed('keyf')) {
      // Exit: step out beside the car.
      v.driver = null;
      player.inVehicle = null;
      const side = v.angle + Math.PI / 2;
      const out = VEHICLE.width + PLAYER.radius + 2;
      player.x = v.x + Math.cos(side) * out;
      player.y = v.y + Math.sin(side) * out;
      player.vx = 0;
      player.vy = 0;
      events.push('exitVehicle');
    }
    return events;
  }

  // On foot.
  const ax = input.axes();
  const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let dx = ax.x;
  let dy = ax.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
    player.walkAngle = Math.atan2(dy, dx);
  }
  player.x += dx * speed * dt;
  player.y += dy * speed * dt;
  collideCircle(city, player, PLAYER.radius);
  player.angle = player.walkAngle;
  player.vx = dx * speed;
  player.vy = dy * speed;

  if (input.pressed('keye') || input.pressed('keyf')) {
    // Enter the nearest vehicle within reach.
    const reach = 55 * 55;
    let best = null;
    let bestD = reach;
    for (const v of vehicles) {
      const d = (v.x - player.x) ** 2 + (v.y - player.y) ** 2;
      if (d < bestD) { bestD = d; best = v; }
    }
    if (best) {
      player.inVehicle = best;
      best.driver = 'player';
      player.x = best.x;
      player.y = best.y;
      events.push('enterVehicle');
    }
  }
  return events;
}

/**
 * One pedestrian. Walks until its timer expires, picks a new heading, and when `panic`
 * ({x, y}) is nearby it flees away from the panic point, sliding along walls.
 */
export function updatePed(p, city, dt, panic) {
  p.timer -= dt;

  if (p.state === 'flee') {
    if (p.timer <= 0 || !panic) {
      // Panic passed (or the run is over): settle back into a walk.
      p.state = 'walk';
      p.timer = 1 + Math.random() * 3;
      return;
    }
    const away = Math.atan2(p.y - panic.y, p.x - panic.x);
    p.targetAngle = away;
    p.angle = wrapAngle(away);
    p.x += Math.cos(away) * PED.fleeSpeed * dt;
    p.y += Math.sin(away) * PED.fleeSpeed * dt;
    if (collideCircle(city, p, PED.radius)) {
      // Blocked: slide along the wall at a tangent.
      p.targetAngle += Math.PI / 3;
    }
    return;
  }

  if (p.timer <= 0) {
    p.timer = Math.random() * 3 + 1.5;
    p.targetAngle = Math.random() * TAU;
  }
  const nx = p.x + Math.cos(p.targetAngle) * PED.speed * dt;
  const ny = p.y + Math.sin(p.targetAngle) * PED.speed * dt;
  if (city.tileAt(nx, ny) === T_WATER) {
    // Turn away from the water instead of walking into it.
    p.targetAngle += Math.PI * (0.6 + Math.random() * 0.8);
  } else {
    p.x = nx;
    p.y = ny;
  }
  p.angle = wrapAngle(p.targetAngle);
  if (city.solidAt(p.x, p.y)) collideCircle(city, p, PED.radius);
}
