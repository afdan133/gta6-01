// Actors and physics.
//
// The player (walking or driving), pedestrians, and one arcade vehicle model shared by
// everything with wheels. Foot movement resolves as a circle against buildings and water;
// cars accelerate forward, bleed lateral velocity as grip, and drift with the handbrake.

import { PED, PLAYER, VEHICLE, WORLD_H, WORLD_W } from './config.js';
import { T_WATER } from './city.js';

export function createPlayer(x, y) {
  return {
    x, y,
    angle: 0,
    vx: 0,
    vy: 0,
    walkAngle: 0,
    health: PLAYER.maxHealth,
    armor: 0,
    cash: 250,
    inVehicle: null,
    weapon: 'fists',
    fireCooldown: 0,
    wantedHeat: 0,
    lastCrimeT: -999,
    wasted: false,
  };
}

export function createPed(x, y, rng, shirts, pants) {
  return {
    x, y,
    angle: rng.angle(),
    heading: rng.angle(),
    vx: 0,
    vy: 0,
    shirt: rng.pick(shirts),
    pants: rng.pick(pants),
    mode: 'stroll',
    think: rng.range(1.2, 4),
    alive: true,
  };
}

export function createVehicle(x, y, angle, rng, colors, role = 'parked') {
  return {
    x, y, angle,
    vx: 0,
    vy: 0,
    speed: 0,
    lat: 0,
    color: rng.pick(colors),
    role,
    driver: null,
    health: 100,
    junctionTimer: 0,
    laneAxis: null,
    laneDir: 1,
    siren: 0,
    exploded: false,
  };
}

// ---- collision ---------------------------------------------------------------

const TAU = Math.PI * 2;

function probeBlocked(city, px, py) {
  if (city.solidAt(px, py)) return true;
  const b = city.pointInBuilding(px, py);
  return !!b;
}

/** Push a circle out of walls/water by probing its rim; true when it touched anything. */
function settleCircle(city, ent, r) {
  let touched = false;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const px = ent.x + Math.cos(a) * r;
    const py = ent.y + Math.sin(a) * r;
    if (!probeBlocked(city, px, py)) continue;
    touched = true;
    const back = a + Math.PI;
    for (let s = 0; s < 6 && probeBlocked(city, px, py); s += 1) {
      ent.x += Math.cos(back) * 2;
      ent.y += Math.sin(back) * 2;
    }
  }
  ent.x = Math.min(Math.max(ent.x, r), WORLD_W - r);
  ent.y = Math.min(Math.max(ent.y, r), WORLD_H - r);
  return touched;
}

// ---- vehicles ----------------------------------------------------------------

/**
 * Advance one car. throttle [-1..1], steer [-1..1], handbrake bool.
 * Returns true when the car hit a wall this step.
 */
export function updateVehicle(v, throttle, steer, handbrake, dt, city) {
  if (throttle > 0) {
    v.speed += VEHICLE.accel * throttle * dt;
  } else if (throttle < 0) {
    const k = v.speed > 0 ? VEHICLE.brake : VEHICLE.reverseAccel;
    v.speed += k * throttle * dt;
  } else {
    v.speed -= v.speed * 1.4 * dt;
  }
  v.speed = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed, v.speed));

  // Steering authority scales with speed so parked cars cannot spin in place.
  const authority = Math.min(1, Math.abs(v.speed) / 90);
  const swing = steer * VEHICLE.turnRate * authority;
  v.angle += swing * dt * (v.speed >= 0 ? 1 : -1);
  if (v.angle > Math.PI) v.angle -= TAU;
  if (v.angle < -Math.PI) v.angle += TAU;

  const fx = Math.cos(v.angle);
  const fy = Math.sin(v.angle);
  // Lateral slip: handbrake injects it (the drift), grip drains it.
  v.lat += handbrake ? swing * v.speed * dt * 0.9 : 0;
  v.lat -= v.lat * (handbrake ? VEHICLE.handbrakeGrip : VEHICLE.grip) * dt;

  v.vx = fx * v.speed - fy * v.lat;
  v.vy = fy * v.speed + fx * v.lat;
  v.x += v.vx * dt;
  v.y += v.vy * dt;

  // Probe the four corners of the oriented box.
  const hx = Math.abs(fx) * (VEHICLE.length / 2) + Math.abs(fy) * (VEHICLE.width / 2);
  const hy = Math.abs(fy) * (VEHICLE.length / 2) + Math.abs(fx) * (VEHICLE.width / 2);
  let crash = false;
  if (
    probeBlocked(city, v.x - hx, v.y - hy) || probeBlocked(city, v.x + hx, v.y - hy) ||
    probeBlocked(city, v.x - hx, v.y + hy) || probeBlocked(city, v.x + hx, v.y + hy)
  ) crash = true;

  if (crash) {
    v.speed *= -0.25;
    v.lat *= 0.4;
    v.x -= v.vx * dt * 1.5;
    v.y -= v.vy * dt * 1.5;
  }
  const half = VEHICLE.length / 2;
  v.x = Math.min(Math.max(v.x, half), WORLD_W - half);
  v.y = Math.min(Math.max(v.y, half), WORLD_H - half);
  return crash;
}

// ---- player ------------------------------------------------------------------

export function updatePlayer(p, input, city, dt, cars) {
  const events = [];

  if (p.inVehicle) {
    const v = p.inVehicle;
    const ax = input.axes();
    updateVehicle(v, -ax.y, ax.x, input.isDown('space'), dt, city);
    p.x = v.x;
    p.y = v.y;
    p.angle = v.angle;
    if (input.wasPressed('keye') || input.wasPressed('keyf')) {
      v.driver = null;
      p.inVehicle = null;
      // Step out on the left side, clear of the body.
      const side = v.angle + Math.PI / 2;
      const out = VEHICLE.width + PLAYER.radius + 3;
      p.x = v.x + Math.cos(side) * out;
      p.y = v.y + Math.sin(side) * out;
      p.vx = 0;
      p.vy = 0;
      events.push('exitVehicle');
    }
    return events;
  }

  // On foot.
  const ax = input.axes();
  const speed = input.sprinting() ? PLAYER.run : PLAYER.walk;
  let dx = ax.x;
  let dy = ax.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
    p.walkAngle = Math.atan2(dy, dx);
  }
  p.x += dx * speed * dt;
  p.y += dy * speed * dt;
  settleCircle(city, p, PLAYER.radius);
  p.angle = p.walkAngle;
  p.vx = dx * speed;
  p.vy = dy * speed;

  if (input.wasPressed('keye') || input.wasPressed('keyf')) {
    // Jack the closest car within arm's reach.
    let best = null;
    let bestD = 55 * 55;
    for (const c of cars) {
      if (c.exploded) continue;
      const d = (c.x - p.x) * (c.x - p.x) + (c.y - p.y) * (c.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best) {
      p.inVehicle = best;
      best.driver = 'player';
      p.x = best.x;
      p.y = best.y;
      events.push('enterVehicle');
    }
  }
  return events;
}

// ---- pedestrians ---------------------------------------------------------------

/**
 * One citizen. Strolls between random headings; when `panic` (a point) is close it sprints
 * away from it, sliding along walls, then settles back down once the threat passes.
 */
export function updatePed(ped, city, dt, panic) {
  ped.think -= dt;

  if (ped.mode === 'panic') {
    if (!panic || ped.think <= 0) {
      ped.mode = 'stroll';
      ped.think = 1 + Math.random() * 3;
      return;
    }
    const away = Math.atan2(ped.y - panic.y, ped.x - panic.x);
    ped.heading = away;
    ped.angle = away;
    ped.x += Math.cos(away) * PED.fleeSpeed * dt;
    ped.y += Math.sin(away) * PED.fleeSpeed * dt;
    if (settleCircle(city, ped, PED.radius)) {
      ped.heading += Math.PI / 3; // skid along the wall
    }
    return;
  }

  if (ped.think <= 0) {
    ped.think = 1.5 + Math.random() * 3;
    ped.heading = Math.random() * TAU;
  }
  const nx = ped.x + Math.cos(ped.heading) * PED.speed * dt;
  const ny = ped.y + Math.sin(ped.heading) * PED.speed * dt;
  if (city.tileAt(nx, ny) === T_WATER) {
    ped.heading += Math.PI * (0.6 + Math.random() * 0.8); // refuse to swim
  } else {
    ped.x = nx;
    ped.y = ny;
  }
  ped.angle = ped.heading;
  if (city.solidAt(ped.x, ped.y)) settleCircle(city, ped, PED.radius);
}
