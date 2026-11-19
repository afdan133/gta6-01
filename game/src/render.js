// World rendering: camera transform, ground tiles, buildings (fake-3D roofs offset by height),
// trees, vehicles, people, and the effects layer — skid marks, muzzle flashes, bullets,
// explosion rings, particles, pickups and floating text.
//
// The look is flat colour with warm sunset light; the day tint + vignette in endFrame() are what
// sell golden hour. Everything is drawn in world space; the HUD paints over it in screen space.

import { CAMERA_ZOOM, MAP_H, MAP_W, PAL, ROAD_GAP, ROAD_W, TILE, VEHICLE } from './config.js';
import {
  T_DOCK, T_GRASS, T_LOT, T_PARK, T_ROAD, T_SAND, T_SIDEWALK, T_WATER,
} from './city.js';
import { PICKUP_TYPES } from './combat.js';

const TILE_COLORS = {
  [T_GRASS]: PAL.grass,
  [T_ROAD]: PAL.road,
  [T_SIDEWALK]: PAL.sidewalk,
  [T_PARK]: PAL.park,
  [T_SAND]: PAL.sand,
  [T_WATER]: PAL.water,
  [T_DOCK]: PAL.dock,
  [T_LOT]: '#565a62',
};

// Day-tint keyframes: [centre, half-width, rgba prefix, peak alpha].
const SUNSET_TINT = { centre: 0.65, half: 0.2, rgb: 'rgba(255, 140, 60, ', alpha: 0.2 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let shake = 0;
  let camX = 0;
  let camY = 0;
  const skids = []; // {x, y, angle, t} — tyre marks, oldest first

  function resize() {
    canvas.width = canvas.clientWidth || 1280;
    canvas.height = canvas.clientHeight || 720;
  }
  window.addEventListener('resize', resize);
  resize();

  function addShake(amount) { shake = Math.min(22, shake + amount); }

  // ---- camera -----------------------------------------------------------------

  /** Convert screen (CSS px) to world px. */
  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.width / 2) / CAMERA_ZOOM + camX,
      y: (sy - canvas.height / 2) / CAMERA_ZOOM + camY,
    };
  }

  function worldToScreen(x, y) {
    return {
      x: (x - camX) * CAMERA_ZOOM + canvas.width / 2,
      y: (y - camY) * CAMERA_ZOOM + canvas.height / 2,
    };
  }

  function beginFrame(camera) {
    camX = camera.x;
    camY = camera.y;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.grassDark;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // Screen shake is applied to the camera translation, then zoom is baked in.
    const sx = shake > 0.1 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0.1 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(CAMERA_ZOOM, 0, 0, CAMERA_ZOOM,
      canvas.width / 2 - camX * CAMERA_ZOOM + sx,
      canvas.height / 2 - camY * CAMERA_ZOOM + sy);
  }

  function endFrame(dt, dayT) {
    shake = shake > 0.1 ? shake * Math.pow(0.02, dt) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Day tint: warm orange at sunset, pale blue pre-dawn, deep blue at night.
    let tint = null;
    if (dayT > 0.5 && dayT < 0.85) {
      const k = 1 - Math.abs(dayT - SUNSET_TINT.centre) / SUNSET_TINT.half;
      if (k > 0) tint = [SUNSET_TINT.rgb, SUNSET_TINT.alpha * k];
    }
    if (dayT >= 0.85 || dayT < 0.12) {
      const k = dayT >= 0.85 ? (dayT - 0.85) / 0.15 : (0.12 - dayT) / 0.12;
      tint = ['rgba(10, 20, 60, ', 0.45 * Math.min(1, k)];
    } else if (dayT < 0.3) {
      tint = ['rgba(120, 140, 220, ', 0.15 * ((0.3 - dayT) / 0.3)];
    }
    if (tint) {
      ctx.fillStyle = tint[0] + tint[1].toFixed(3) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Vignette for a cinematic frame.
    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.95,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(6,4,12,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---- ground -------------------------------------------------------------------

  /** Visible tile range for a world-space view rect, clamped to the map. */
  function tileBounds(view) {
    return {
      tx0: Math.max(0, Math.floor(view.x0 / TILE)),
      ty0: Math.max(0, Math.floor(view.y0 / TILE)),
      tx1: Math.min(MAP_W - 1, Math.floor(view.x1 / TILE)),
      ty1: Math.min(MAP_H - 1, Math.floor(view.y1 / TILE)),
    };
  }

  function drawCity(city, view) {
    const { tx0, ty0, tx1, ty1 } = tileBounds(view);

    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const t = city.tiles[ty * MAP_W + tx];
        const px = tx * TILE;
        const py = ty * TILE;
        ctx.fillStyle = TILE_COLORS[t] || PAL.grass;
        ctx.fillRect(px, py, TILE, TILE);

        if (t === T_ROAD) {
          // Lane dashes run along the band's axis.
          const horizontal = (ty % ROAD_GAP) < ROAD_W;
          ctx.fillStyle = PAL.roadLine;
          if (horizontal) {
            if (tx % 2 === 0) ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
          } else if (ty % 2 === 0) {
            ctx.fillRect(px + TILE / 2 - 1, py, 2, TILE);
          }
        } else if (t === T_PARK) {
          // Sparse mown patches so the lawn isn't a flat slab.
          if ((tx * 7 + ty * 13) % 11 === 0) {
            ctx.fillStyle = PAL.grassDark;
            ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
          }
        } else if (t === T_SAND) {
          if ((tx * 5 + ty * 3) % 7 === 0) {
            ctx.fillStyle = 'rgba(255,240,200,0.22)';
            ctx.fillRect(px + 6, py + 8, 4, 3);
          }
        } else if (t === T_WATER) {
          if ((tx + ty) % 5 === 0) {
            ctx.fillStyle = 'rgba(150,200,235,0.18)'; // wave streak
            ctx.fillRect(px + 3, py + 10, TILE - 6, 2);
          }
        }
      }
    }

    // Parking lots painted over the grass, with bay lines.
    ctx.fillStyle = TILE_COLORS[T_LOT];
    for (const lot of city.lots) {
      if (lot.x > view.x1 || lot.x + lot.w < view.x0 || lot.y > view.y1 || lot.y + lot.h < view.y0) continue;
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.fillStyle = '#e8dfae';
      for (let lx = lot.x + 6; lx < lot.x + lot.w - 6; lx += TILE) ctx.fillRect(lx, lot.y + 4, 2, lot.h - 8);
      ctx.fillStyle = TILE_COLORS[T_LOT];
    }
  }

  // ---- buildings & trees ----------------------------------------------------------

  function drawBuildings(city, view) {
    const { x0, y0, x1, y1 } = view;
    for (const b of city.buildings) {
      if (b.x > x1 + 40 || b.x + b.w < x0 - 40 || b.y > y1 + 40 || b.y + b.h < y0 - 40) continue;
      const off = b.height * 3;   // taller buildings lean further, cheap perspective
      const rx = b.x - off * 0.3; // roof x offset

      ctx.fillStyle = 'rgba(0,0,0,0.18)'; // ground shadow
      ctx.fillRect(b.x + 3, b.y + 4, b.w, b.h);

      ctx.fillStyle = b.color;
      ctx.fillRect(rx, b.y - off, b.w, b.h);
      ctx.fillStyle = b.roof;             // roof lip
      ctx.fillRect(rx, b.y - off, b.w, 4);

      if (b.windows) {
        ctx.fillStyle = 'rgba(255, 210, 130, 0.75)';
        for (let wy = b.y - off + 10; wy < b.y - 8; wy += 14) {
          for (let wx = rx + 6; wx < b.x + b.w - 8; wx += 12) {
            if ((Math.floor(wx / 12) + Math.floor(wy / 14)) % 3 === 0) continue; // lit/unlit mix
            ctx.fillRect(wx, wy, 6, 7);
          }
        }
      }

      if (b.shop) {
        // Awning + warm shopfront light along the street-facing edge.
        ctx.fillStyle = b.roof;
        ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(b.x + 4, b.y + b.h - 8, Math.max(8, b.w - 8), 3);
      }
    }
  }

  function drawTrees(city, view) {
    const { x0, y0, x1, y1 } = view;
    for (const tr of city.trees) {
      if (tr.x > x1 + 20 || tr.x < x0 - 20 || tr.y > y1 + 20 || tr.y < y0 - 20) continue;
      const r = tr.palm ? 9 : 11;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(tr.x + 3, tr.y + 3, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a4632'; // trunk
      ctx.fillRect(tr.x - 2, tr.y - 2, 4, 4);
      ctx.fillStyle = tr.palm ? '#7aa04a' : '#4c7a35';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y - 6, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- actors -------------------------------------------------------------------

  function drawPed(p) {
    if (p.dead) {
      // Downed-body mark: a dark stain plus a flat figure.
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(120,30,40,0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.shirt;
      ctx.fillRect(-7, -2, 14, 4);
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2); // sprites are authored facing "up"
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-4, -2, 8, 8);
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = p.pants;
    ctx.fillRect(-4, 2, 8, 4);
    ctx.fillStyle = PAL.playerSkin;
    ctx.fillRect(-2.5, -7, 5, 5);
    ctx.restore();
  }

  /** Cops on foot: navy uniform plus a blue shoulder light so they read instantly. */
  function drawCop(c) {
    if (c.dead) {
      drawPed({ ...c, shirt: '#20304a', pants: '#1a2233' });
      return;
    }
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-4.5, -2, 9, 9);
    ctx.fillStyle = '#25324a';
    ctx.fillRect(-4.5, -4.5, 9, 9);
    ctx.fillStyle = '#0f1725';
    ctx.fillRect(-4.5, 2.5, 9, 4);
    ctx.fillStyle = PAL.playerSkin;
    ctx.fillRect(-2.5, -7.5, 5, 5);
    ctx.fillStyle = '#5fb0ff'; // shoulder light
    ctx.fillRect(-4.5, -4.5, 3, 2);
    ctx.restore();

    if (c.state === 'aim') {
      // Faint aim line: a readable tell before the shot lands.
      ctx.strokeStyle = 'rgba(255,90,90,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x + Math.cos(c.angle) * 280, c.y + Math.sin(c.angle) * 280);
      ctx.stroke();
    }
  }

  function drawCar(c) {
    if (c.exploded) {
      // Burnt husk.
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.angle);
      ctx.fillStyle = '#2a2622';
      ctx.fillRect(-c.length / 2, -c.width / 2, c.length, c.width);
      ctx.fillStyle = '#4a4038';
      ctx.fillRect(-c.length / 2 + 6, -c.width / 2 + 3, c.length - 12, c.width - 6);
      ctx.restore();
      return;
    }

    const L = c.length || VEHICLE.length;
    const Wd = c.width || VEHICLE.width;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.28)'; // shadow
    ctx.fillRect(-L / 2 + 2, -Wd / 2 + 3, L, Wd);
    ctx.fillStyle = c.color;            // body
    ctx.fillRect(-L / 2, -Wd / 2, L, Wd);

    if (c.kind === 'police') {
      // White door stripe + alternating lightbar.
      ctx.fillStyle = '#eef2f7';
      ctx.fillRect(-L / 2 + 6, -Wd / 2, 12, Wd);
      const t = performance.now() / 130;
      ctx.fillStyle = Math.sin(t) > 0 ? '#ff3b3b' : '#3b6bff';
      ctx.fillRect(-3, -Wd / 2 - 3, 7, 4);
      ctx.fillStyle = Math.sin(t + Math.PI) > 0 ? '#ff3b3b' : '#3b6bff';
      ctx.fillRect(5, -Wd / 2 - 3, 7, 4);
    }

    ctx.fillStyle = 'rgba(30, 40, 60, 0.9)'; // windscreen + rear window
    ctx.fillRect(L / 2 - 14, -Wd / 2 + 2, 9, Wd - 4);
    ctx.fillRect(-L / 2 + 6, -Wd / 2 + 3, 6, Wd - 6);

    ctx.fillStyle = 'rgba(0,0,0,0.6)';       // wheels
    ctx.fillRect(-L / 2 + 4, -Wd / 2 - 2, 6, 3);
    ctx.fillRect(-L / 2 + 4, Wd / 2 - 1, 6, 3);
    ctx.fillRect(L / 2 - 10, -Wd / 2 - 2, 6, 3);
    ctx.fillRect(L / 2 - 10, Wd / 2 - 1, 6, 3);

    if (c.health < 60) {                     // soot builds up as the car is hurt
      ctx.fillStyle = `rgba(20,16,14,${Math.min(0.55, (60 - c.health) / 100)})`;
      ctx.fillRect(-L / 2 + 2, -Wd / 2 + 1, L - 4, Wd - 2);
    }
    ctx.restore();

    // Smoke plume from a badly damaged car.
    if (c.health < 35 && Math.random() < 0.25) {
      ctx.fillStyle = 'rgba(70,70,78,0.5)';
      ctx.beginPath();
      ctx.arc(c.x + (Math.random() - 0.5) * 8, c.y - 4 - Math.random() * 6, 3 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(p) {
    if (p.inVehicle) return; // the car is the body while driving
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-5, -2, 10, 10);
    ctx.fillStyle = PAL.player;   // jacket
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#2c3e50';    // trousers
    ctx.fillRect(-5, 3, 10, 3);
    ctx.fillStyle = PAL.playerSkin; // head
    ctx.fillRect(-3, -9, 6, 6);
    if (p.weapon && p.weapon !== 'fists') {
      // Gun barrel pokes out in the aim direction (undo the sprite rotation first).
      ctx.rotate(-p.angle);
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(5, -1.5, 10, 3);
    }
    ctx.restore();
  }

  /** Floating mission marker: a filled pennant with a pulsing ground ring. */
  function drawMarker(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x - 9, y - 30);
    ctx.lineTo(x + 9, y - 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ---- effects --------------------------------------------------------------------

  function addSkid(x, y, angle) {
    if (skids.length > 420) skids.shift();
    skids.push({ x, y, angle, t: 1 });
  }

  /** Fade and stroke every skid mark in a single path (one stroke call per frame). */
  function drawSkids(dt) {
    ctx.strokeStyle = 'rgba(24,20,22,0.34)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      const s = skids[i];
      s.t -= dt * 0.035;
      if (s.t <= 0) { skids.splice(i, 1); continue; }
      ctx.moveTo(s.x - Math.cos(s.angle) * 5, s.y - Math.sin(s.angle) * 5);
      ctx.lineTo(s.x + Math.cos(s.angle) * 5, s.y + Math.sin(s.angle) * 5);
    }
    ctx.stroke();
  }

  function drawCombat(combat) {
    // Muzzle flashes.
    ctx.fillStyle = 'rgba(255,225,150,0.95)';
    for (const f of combat.flashes) {
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(14, -5); ctx.lineTo(20, 0); ctx.lineTo(14, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Bullets: short bright streaks trailing back along their velocity.
    ctx.lineWidth = 2;
    for (const b of combat.bullets) {
      ctx.strokeStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }

    // Explosion rings: expanding shockwave plus a hot core.
    for (const bl of combat.blasts) {
      const a = Math.max(0, bl.t / bl.max);
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = '#ffce7a';
      ctx.lineWidth = 6 * a + 1;
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = a * 0.35;
      ctx.fillStyle = '#ff8a3c';
      ctx.beginPath();
      ctx.arc(bl.x, bl.y, bl.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Particles (fire, blood, dust, smoke) fade out over their life.
    for (const p of combat.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    // Pickups: bobbing ring with a type letter.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px system-ui, sans-serif';
    for (const p of combat.pickups) {
      const def = PICKUP_TYPES[p.type] || { color: '#fff', label: '?' };
      const bob = Math.sin(p.t * 3) * 2;
      ctx.fillStyle = 'rgba(10,10,16,0.55)';
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = def.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y + bob, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = def.color;
      ctx.fillText(def.label, p.x, p.y + bob + 1);
    }
    ctx.textBaseline = 'alphabetic';

    // Floating damage / cash text.
    ctx.font = 'bold 12px system-ui, sans-serif';
    for (const f of combat.floats) {
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  /** Aim reticle at a world point. */
  function drawReticle(x, y) {
    ctx.strokeStyle = 'rgba(255,240,220,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.moveTo(x - 11, y); ctx.lineTo(x - 7, y);
    ctx.moveTo(x + 7, y); ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11); ctx.lineTo(x, y - 7);
    ctx.moveTo(x, y + 7); ctx.lineTo(x, y + 11);
    ctx.stroke();
  }

  return {
    ctx,
    canvas,
    screenToWorld,
    worldToScreen,
    addShake,
    beginFrame,
    endFrame,
    drawCity,
    drawBuildings,
    drawTrees,
    drawPed,
    drawCop,
    drawCar,
    drawPlayer,
    drawMarker,
    drawSkids,
    addSkid,
    drawCombat,
    drawReticle,
  };
}
