// Entities: the player (on foot + driving), peds, and vehicle physics shared by everything on
// wheels. Movement is circle-vs-building collision against the city; vehicles use a simple
// arcade car model (forward accel, lateral grip damping, drift on handbrake).

import { PED, PLAYER, TILE, VEHICLE, WORLD_H, WORLD_W } from './config.js';
import { T_WATER } from './city.js';

const TAU = Math.PI * 2;
function wrapAngle(a) {
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
    state: 'walk',     // walk | flee
    timer: rng.range(1, 4),
    targetAngle: 0,
    alive: true,
  };
}

export function createVehicle(x, y, angle, rng, colorList, kind = 'parked') {
  return {
    x, y, angle,
    vx: 0, vy: 0,          // velocity in world axes
    speed: 0,              // signed forward speed
    color: rng.pick(colorList),
    kind,                  // parked | traffic | police
    driver: null,          // ped id or 'player'
    health: 100,
    stopTimer: 0,
    laneAxis: null,        // 'h' | 'v' for traffic
    dir: 1,
    hornTimer: 0,
  };
}

/** Push a circle out of buildings and water; returns true when it collided. */
function collideCircle(city, ent, radius) {
  let hit = false;
  const probe = (px, py) => {
    if (city.solidAt(px, py)) return true;
    const b = city.pointInBuilding(px, py);
    return !!(b && b.height > 0);
  };
  // Sample 8 points on the circle; push back along the shortest escaping direction.
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const px = ent.x + Math.cos(a) * radius;
    const py = ent.y + Math.sin(a) * radius;
    if (!probe(px, py)) continue;
    hit = true;
    // Nudge back toward the entity centre until free (max 6 steps).
    for (let s = 0; s < 6 && probe(px, py); s += 1) {
      ent.x += Math.cos(a + Math.PI) * 2;
      ent.y += Math.sin(a + Math.PI) * 2;
    }
  }
  ent.x = Math.max(radius, Math.min(WORLD_W - radius, ent.x));
  ent.y = Math.max(radius, Math.min(WORLD_H - radius, ent.y));
  return hit;
}

/** Shared vehicle physics update. throttle in [-1,1], steer in [-1,1], handbrake bool. */
export function updateVehicle(v, throttle, steer, handbrake, dt, city) {
  // Longitudinal
  if (throttle > 0) {
    v.speed += VEHICLE.accel * throttle * dt;
  } else if (throttle < 0) {
    v.speed += (v.speed > 0 ? -VEHICLE.brake : VEHICLE.reverseAccel) * throttle * dt;
  } else {
    // engine drag + rolling friction
    v.speed -= v.speed * 1.4 * dt;
  }
  v.speed = Math.max(-VEHICLE.maxReverse, Math.min(VEHICLE.maxSpeed, v.speed));

  // Steering scales down at speed for stability.
  const steerEff = steer * VEHICLE.turnRate * Math.min(1, Math.abs(v.speed) / 90);
  v.angle = wrapAngle(v.angle + steerEff * dt * Math.sign(v.speed || 1));

  // Velocity: forward component + lateral damping (grip).
  const fx = Math.cos(v.angle);
  const fy = Math.sin(v.angle);
  let forward = v.speed;
  // Lateral velocity bleeds off — less grip when handbraking (drift).
  const grip = handbrake ? VEHICLE.handbrakeGrip : VEHICLE.driftGrip;
  v.vx = fx * forward;
  v.vy = fy * forward;
  // keep small lateral memory for drift look
  const oldVx = v.vx;
  const oldVy = v.vy;

  v.x += v.vx * dt;
  v.y += v.vy * dt;

  // Collision: probe corners; on hit, kill most of the speed and push out.
  const hx = Math.abs(Math.cos(v.angle)) * VEHICLE.length / 2 + Math.abs(Math.sin(v.angle)) * VEHICLE.width / 2;
  const hy = Math.abs(Math.sin(v.angle)) * VEHICLE.length / 2 + Math.abs(Math.cos(v.angle)) * VEHICLE.width / 2;
  let bumped = false;
  const corners = [
    [v.x - hx, v.y - hy], [v.x + hx, v.y - hy], [v.x - hx, v.y + hy], [v.x + hx, v.y + hy],
  ];
  for (const [cx, cy] of corners) {
    if (city.solidAt(cx, cy)) { bumped = true; break; }
    const b = city.pointInBuilding(cx, cy);
    if (b) { bumped = true; break; }
  }
  if (bumped) {
    v.speed *= -0.25;
    v.x -= oldVx * dt * 1.5;
    v.y -= oldVy * dt * 1.5;
    bumped = true;
  }
  v.x = Math.max(VEHICLE.length / 2, Math.min(WORLD_W - VEHICLE.length / 2, v.x));
  v.y = Math.max(VEHICLE.length / 2, Math.min(WORLD_H - VEHICLE.length / 2, v.y));
  return bumped;
}

/** Player update: on foot or driving. Returns events (e.g. 'enter' attempt). */
export function updatePlayer(player, input, city, dt, vehicles) {
  const events = [];
  if (player.inVehicle) {
    const v = player.inVehicle;
    const ax = input.axes();
    const throttle = -ax.y; // W = forward
    const steer = ax.x;
    const handbrake = input.isDown('space');
    updateVehicle(v, throttle, steer, handbrake, dt, city);
    player.x = v.x;
    player.y = v.y;
    player.angle = v.angle;
    if (input.pressed('keye') || input.pressed('keyf')) {
      // Exit: place player beside the car.
      v.driver = null;
      player.inVehicle = null;
      const side = v.angle + Math.PI / 2;
      player.x = v.x + Math.cos(side) * (VEHICLE.width + PLAYER.radius + 2);
      player.y = v.y + Math.sin(side) * (VEHICLE.width + PLAYER.radius + 2);
      player.vx = 0; player.vy = 0;
      events.push('exitVehicle');
    }
  } else {
    const ax = input.axes();
    const running = input.isDown('shiftleft') || input.isDown('shiftright');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let dx = ax.x;
    let dy = ax.y;
    const len = Math.hypot(dx, dy);
    if (len > 0) {
      dx /= len; dy /= len;
      player.walkAngle = Math.atan2(dy, dx);
    }
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
    collideCircle(city, player, PLAYER.radius);
    player.angle = player.walkAngle;
    player.vx = dx * speed; player.vy = dy * speed;
    if (input.pressed('keye') || input.pressed('keyf')) {
      // Enter the nearest vehicle within pickup range.
      let best = null;
      let bestD = 55 * 55;
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
  }
  return events;
}

/** One ped: wander sidewalks; when scared (nearAlarm set), run away from the panic point. */
export function updatePed(p, city, dt, panic) {
  p.timer -= dt;
  if (p.state === 'flee') {
    p.timer -= dt;
    if (p.timer <= 0) p.state = 'walk';
    const away = Math.atan2(p.y - panic.y, p.x - panic.x);
    p.targetAngle = away;
    const sp = PED.fleeSpeed;
    p.x += Math.cos(p.targetAngle) * sp * dt;
    p.y += Math.sin(p.targetAngle) * sp * dt;
    p.angle = wrapAngle(p.targetAngle);
    if (collideCircle(city, p, PED.radius)) {
      // Slide along walls: pick a new tangent direction.
      p.targetAngle += Math.PI / 3;
    }
  } else {
    if (p.timer <= 0) {
      p.timer = Math.random() * 3 + 1.5;
      p.targetAngle = Math.random() * TAU;
    }
    const sp = PED.speed;
    const nx = p.x + Math.cos(p.targetAngle) * sp * dt;
    const ny = p.y + Math.sin(p.targetAngle) * sp * dt;
    const t = city.tileAt(nx, ny);
    if (t === T_WATER) {
      p.targetAngle += Math.PI * (0.6 + Math.random() * 0.8);
    } else {
      p.x = nx;
      p.y = ny;
    }
    // Prefer sidewalks and sand: steer back if drifting deep into the road for long.
    p.angle = wrapAngle(p.targetAngle);
    if (city.solidAt(p.x, p.y)) collideCircle(city, p, PED.radius);
  }
}

export { wrapAngle };
