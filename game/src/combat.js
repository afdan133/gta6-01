// Combat: weapons (fists, pistol, uzi), mouse aim, bullets, vehicle damage and explosions,
// pickups, particles and floating text. Everything is simulated in world pixels; the renderer
// draws the arrays this module owns. Crimes are reported upward through ctx.onCrime so the
// police module can raise the wanted level.
//
// ctx shape (where used): {city, player, peds, cops, cars, onCrime(x, y, kind),
// onKill(ent), onCarDestroyed(v), onWasted(), shake(amount)}.

import { PLAYER } from './config.js';

const TAU = Math.PI * 2;

export const WEAPONS = {
  fists:  { name: 'FISTS',  dmg: 10, cooldown: 0.42, range: 24,  spread: 0,    bulletSpeed: 0,   sound: 'punch' },
  pistol: { name: 'PISTOL', dmg: 24, cooldown: 0.30, range: 700, spread: 0.02, bulletSpeed: 900, sound: 'pistol' },
  uzi:    { name: 'UZI',    dmg: 11, cooldown: 0.08, range: 560, spread: 0.10, bulletSpeed: 850, sound: 'uzi' },
};

// Pickups render as a labelled ring; label + colour identify the type.
export const PICKUP_TYPES = {
  health: { color: '#e34f5a', label: '+' },
  armor:  { color: '#4fa3e3', label: 'A' },
  pistol: { color: '#e8d36a', label: 'P' },
  uzi:    { color: '#c58cf0', label: 'U' },
  cash:   { color: '#6fc27a', label: '$' },
};

export function createCombat(audio) {
  const bullets = [];   // {x, y, vx, vy, life, dmg, owner, color}
  const particles = []; // {x, y, vx, vy, life, max, size, color, grav}
  const blasts = [];    // explosion rings {x, y, r, t, max}
  const flashes = [];   // muzzle flashes {x, y, angle, t}
  const pickups = [];   // {x, y, type, t, life}
  const floats = [];    // floating text {x, y, text, t, color}

  // ---- loadout -------------------------------------------------------------

  /** Ensure a player object has weapon/ammo fields (safe to call every step). */
  function initLoadout(player) {
    if (player.weapon === undefined) player.weapon = 'fists';
    if (!player.ammo) player.ammo = { pistol: 0, uzi: 0 };
    if (player.fireCooldown === undefined) player.fireCooldown = 0;
    player.aimAngle = player.aimAngle ?? 0;
  }

  function giveWeapon(player, kind, ammo) {
    player.weapon = kind;
    if (kind === 'pistol') player.ammo.pistol = Math.min(200, player.ammo.pistol + (ammo ?? 40));
    if (kind === 'uzi') player.ammo.uzi = Math.min(400, player.ammo.uzi + (ammo ?? 120));
  }

  // ---- spawning helpers ------------------------------------------------------

  function spawnBullet(o) {
    bullets.push({
      x: o.x, y: o.y,
      vx: Math.cos(o.angle) * o.speed,
      vy: Math.sin(o.angle) * o.speed,
      life: o.life ?? 0.9,
      dmg: o.dmg ?? 10,
      owner: o.owner ?? 'player', // 'player' | 'cop'
      color: o.color ?? '#ffe6a0',
    });
  }

  function addParticles(x, y, n, color, speed, life, size, grav = 0) {
    for (let i = 0; i < n; i += 1) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.9);
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.7),
        max: life,
        size: size * (0.6 + Math.random() * 0.8),
        color,
        grav, // positive falls, negative rises (smoke)
      });
    }
  }

  function addFloat(x, y, text, color = '#ffe9a8') {
    floats.push({ x, y, text, t: 1.0, color });
  }

  // ---- firing ------------------------------------------------------------------

  /** Nearest living target roughly in front of the player (fists cone check). */
  function meleeTarget(player, angle, targets) {
    let best = null;
    let bestD = WEAPONS.fists.range * WEAPONS.fists.range;
    for (const t of targets) {
      if (t.dead) continue;
      const dx = t.x - player.x;
      const dy = t.y - player.y;
      const d = dx * dx + dy * dy;
      if (d > bestD) continue;
      const dot = (dx * Math.cos(angle) + dy * Math.sin(angle)) / (Math.sqrt(d) || 1);
      if (dot < 0.2) continue; // outside the punch cone
      bestD = d;
      best = t;
    }
    return best;
  }

  /**
   * Player fires at the world point `aim`. Returns {fired, empty} — `empty` means the gun
   * clicked dry and the player was switched back to fists.
   */
  function fire(player, aim, ctx) {
    if (player.fireCooldown > 0) return { fired: false };
    const w = WEAPONS[player.weapon] || WEAPONS.fists;
    const angle = Math.atan2(aim.y - player.y, aim.x - player.x + 0.0001);
    player.aimAngle = angle;

    if (player.weapon === 'fists') {
      player.fireCooldown = w.cooldown;
      const t = meleeTarget(player, angle, [...(ctx.peds || []), ...(ctx.cops || [])]);
      addParticles(player.x + Math.cos(angle) * 16, player.y + Math.sin(angle) * 16, 4, '#f5e9d0', 90, 0.2, 2);
      if (t) {
        hurtEntity(t, w.dmg, ctx);
        if (ctx.onCrime) ctx.onCrime(t.x, t.y, 'melee');
      }
      return { fired: true };
    }

    // Guns: consume ammo, spawn one spread bullet from the muzzle.
    if (player.ammo[player.weapon] <= 0) {
      player.weapon = 'fists';
      return { fired: false, empty: true };
    }
    player.ammo[player.weapon] -= 1;
    player.fireCooldown = w.cooldown;

    const spread = (Math.random() - 0.5) * w.spread * 2;
    const muzzleX = player.x + Math.cos(angle) * 16;
    const muzzleY = player.y + Math.sin(angle) * 16;
    spawnBullet({
      x: muzzleX, y: muzzleY, angle: angle + spread,
      speed: w.bulletSpeed, dmg: w.dmg, owner: 'player', life: w.range / w.bulletSpeed,
    });
    flashes.push({ x: muzzleX, y: muzzleY, angle, t: 0.06 });
    addParticles(muzzleX, muzzleY, 2, '#ffd48a', 60, 0.12, 2);
    if (audio) audio.gunshot(player.weapon === 'uzi');
    if (ctx.onCrime) ctx.onCrime(player.x, player.y, 'shoot');
    return { fired: true };
  }

  // ---- damage ------------------------------------------------------------------

  function hurtEntity(ent, dmg, ctx) {
    ent.health = (ent.health ?? 40) - dmg;
    if (ent.onHurt) ent.onHurt(dmg);
    addParticles(ent.x, ent.y, 4, '#a8323c', 70, 0.35, 2, 60);
    if (ent.health <= 0 && !ent.dead) {
      ent.dead = true;
      ent.alive = false;
      addParticles(ent.x, ent.y, 10, '#8f2630', 110, 0.6, 3, 120);
      if (ent.cop) {
        if (ctx.onCrime) ctx.onCrime(ent.x, ent.y, 'killcop');
      } else if (ctx.onCrime) {
        ctx.onCrime(ent.x, ent.y, 'killped');
      }
      if (ctx.onKill) ctx.onKill(ent);
    }
  }

  function damageVehicle(v, dmg, ctx) {
    if (v.exploded) return;
    v.health -= dmg;
    if (v.health <= 30) addParticles(v.x, v.y, 1, '#4a4a4a', 20, 0.9, 3, -20); // smoke
    if (v.health <= 0) explode(v, ctx);
  }

  /** Blow a car up: blast ring, fire + smoke particles, shake, area damage. */
  function explode(v, ctx) {
    if (v.exploded) return;
    v.exploded = true;
    v.health = 0;
    blasts.push({ x: v.x, y: v.y, r: 6, t: 0.7, max: 0.7 });
    addParticles(v.x, v.y, 26, '#ff9a3c', 210, 0.9, 4, 30);   // fire
    addParticles(v.x, v.y, 16, '#ffe27a', 140, 0.6, 3, 10);   // sparks
    addParticles(v.x, v.y, 14, '#3a3a42', 90, 1.5, 5, -25);   // smoke
    if (audio) audio.explosion();
    if (ctx.shake) ctx.shake(11);

    // Area damage to everyone nearby.
    const R = 90;
    for (const e of [...(ctx.peds || []), ...(ctx.cops || [])]) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - v.x, e.y - v.y);
      if (d < R) hurtEntity(e, 80 * (1 - d / R), ctx);
    }
    if (ctx.player && !ctx.player.inVehicle) {
      const d = Math.hypot(ctx.player.x - v.x, ctx.player.y - v.y);
      if (d < R) damagePlayer(ctx.player, 55 * (1 - d / R), ctx);
    }
    if (ctx.onCarDestroyed) ctx.onCarDestroyed(v);
  }

  /** Armor soaks 60% of incoming damage until it breaks. */
  function damagePlayer(player, dmg, ctx) {
    if (player.dead) return;
    let left = dmg;
    if (player.armor > 0) {
      const absorb = Math.min(player.armor, left * 0.6);
      player.armor -= absorb;
      left -= absorb;
    }
    player.health = Math.max(0, player.health - left);
    if (audio) audio.hurt();
    if (ctx && ctx.shake) ctx.shake(3);
    if (player.health <= 0 && !player.dead) {
      player.dead = true;
      if (ctx && ctx.onWasted) ctx.onWasted();
    }
  }

  // ---- pickups ------------------------------------------------------------------

  function addPickup(x, y, type) {
    pickups.push({ x, y, type, t: 0, life: 90 });
  }

  /** Keep a handful of pickups alive near the player (called about once a second). */
  function ensurePickups(city, player, rng) {
    if (pickups.filter((p) => p.life > 0).length >= 7) return;
    for (let i = 0; i < 12; i += 1) {
      const a = rng.range(0, TAU);
      const d = rng.range(160, 520);
      const x = player.x + Math.cos(a) * d;
      const y = player.y + Math.sin(a) * d;
      if (city.isRoad(x, y)) continue;                 // not in the middle of the street
      if (city.solidAt(x, y) || city.pointInBuilding(x, y)) continue;
      const roll = rng.next();
      const type = roll < 0.24 ? 'health' : roll < 0.42 ? 'armor' : roll < 0.58 ? 'pistol' : roll < 0.8 ? 'cash' : 'uzi';
      addPickup(x, y, type);
      return; // one per tick keeps the streets from littering
    }
  }

  // ---- per-step update ------------------------------------------------------------

  /** Move bullets, resolve hits, tick particles/blasts/flashes/floats, collect pickups. */
  function update(dt, ctx) {
    const { city, player, peds, cops, cars } = ctx;

    // Bullets: sub-stepped so fast rounds can't tunnel through thin targets.
    for (let i = bullets.length - 1; i >= 0; i -= 1) {
      const b = bullets[i];
      b.life -= dt;
      let dead = b.life <= 0;
      for (let s = 0; s < 2 && !dead; s += 1) {
        b.x += (b.vx * dt) / 2;
        b.y += (b.vy * dt) / 2;
        if (b.x < 0 || b.y < 0 || b.x > city.worldSize().w || b.y > city.worldSize().h) { dead = true; break; }
        if (city.solidAt(b.x, b.y) || city.pointInBuilding(b.x, b.y)) {
          addParticles(b.x, b.y, 3, '#d8d2c0', 55, 0.18, 1.6); // wall dust
          dead = true;
          break;
        }
        if (b.owner === 'player') {
          for (const c of cops) {
            if (c.dead) continue;
            if (Math.hypot(c.x - b.x, c.y - b.y) < 8) { hurtEntity(c, b.dmg, ctx); dead = true; break; }
          }
          if (dead) break;
          for (const p of peds) {
            if (p.dead) continue;
            if (Math.hypot(p.x - b.x, p.y - b.y) < 7) { hurtEntity(p, b.dmg, ctx); dead = true; break; }
          }
          if (dead) break;
        } else if (player && !player.dead && !player.inVehicle) {
          if (Math.hypot(player.x - b.x, player.y - b.y) < PLAYER.radius + 2) {
            damagePlayer(player, b.dmg, ctx);
            dead = true;
            break;
          }
        }
        // Bullets also hit cars (and occupants take splash when the player is driving).
        for (const v of cars) {
          if (v.exploded) continue;
          if (Math.hypot(v.x - b.x, v.y - b.y) < 16) {
            damageVehicle(v, b.dmg * 0.8, ctx);
            if (v.driver === 'player' && b.owner !== 'player') damagePlayer(player, b.dmg * 0.5, ctx);
            dead = true;
            break;
          }
        }
      }
      if (dead) bullets.splice(i, 1);
    }

    // Particles: gravity + drag.
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= 1 - 1.6 * dt;
      p.vy *= 1 - 1.6 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    // Explosion rings expand and fade.
    for (let i = blasts.length - 1; i >= 0; i -= 1) {
      const b = blasts[i];
      b.t -= dt;
      b.r += dt * 130;
      if (b.t <= 0) blasts.splice(i, 1);
    }

    for (let i = flashes.length - 1; i >= 0; i -= 1) {
      flashes[i].t -= dt;
      if (flashes[i].t <= 0) flashes.splice(i, 1);
    }

    for (let i = floats.length - 1; i >= 0; i -= 1) {
      floats[i].t -= dt;
      floats[i].y -= dt * 26;
      if (floats[i].t <= 0) floats.splice(i, 1);
    }

    // Pickups: age out, then collect on contact.
    for (let i = pickups.length - 1; i >= 0; i -= 1) {
      const p = pickups[i];
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) { pickups.splice(i, 1); continue; }
      if (player.dead) continue;
      if (Math.hypot(player.x - p.x, player.y - p.y) > 18) continue;
      pickups.splice(i, 1);
      if (audio) audio.pickup();
      if (p.type === 'health') {
        player.health = Math.min(PLAYER.maxHealth, player.health + 35);
        addFloat(p.x, p.y - 10, '+35 HP', '#7ee08a');
      } else if (p.type === 'armor') {
        player.armor = Math.min(PLAYER.maxArmor, player.armor + 40);
        addFloat(p.x, p.y - 10, '+40 ARMOR', '#7ec8e0');
      } else if (p.type === 'pistol') {
        giveWeapon(player, 'pistol', 40);
        addFloat(p.x, p.y - 10, 'PISTOL', '#ffe27a');
      } else if (p.type === 'uzi') {
        giveWeapon(player, 'uzi', 120);
        addFloat(p.x, p.y - 10, 'UZI', '#d6a6f5');
      } else {
        player.cash += 150;
        addFloat(p.x, p.y - 10, '+$150', '#8de39a');
      }
    }

    // Car-vs-car crashes: fast cars clip each other, both take damage and spark.
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (a.exploded || Math.abs(a.speed) < 150) continue;
      if (a.crashCd > 0) { a.crashCd -= dt; continue; }
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (b.exploded) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > 26) continue;
        damageVehicle(a, 6 + Math.abs(a.speed) * 0.05, ctx);
        damageVehicle(b, 6 + Math.abs(a.speed) * 0.06, ctx);
        a.crashCd = 0.5;
        b.crashCd = 0.5;
        addParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 5, '#ffe9a8', 90, 0.3, 2);
        if (audio) audio.crash();
        break;
      }
    }
  }

  /** Skid/impact smoke puff for a handbraking car. */
  function tireSmoke(v) {
    if (Math.random() < 0.35) addParticles(v.x, v.y, 1, 'rgba(220,210,190,0.7)', 20, 0.6, 3, -14);
  }

  return {
    bullets, particles, blasts, flashes, pickups, floats,
    initLoadout, giveWeapon, fire, update, addPickup, ensurePickups,
    spawnBullet, damageVehicle, damagePlayer, hurtEntity, explode, addFloat, tireSmoke,
  };
}
