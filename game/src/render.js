// Renderer.
//
// Canvas 2D, world space first, screen space last. The ground is drawn tile by tile for the
// visible window, buildings get a cheap fake-3D lift (roof offset by storeys), cars and people
// are rotated primitives, and combat effects (skids, flashes, bullets, blast rings, particles,
// pickups, floating text) are painted from the arrays combat.js owns. endFrame() lays down the
// day tint and vignette that give the city its permanent golden hour.

import { CAM_ZOOM, GRID_H, GRID_W, PAL, ROAD_GAP, ROAD_WIDE, TILE, VEHICLE } from './config.js';
import {
  T_LOT, T_LAWN, T_LAWN_PARK, T_ROAD, T_SAND, T_WALK, T_WATER,
} from './city.js';
import { PICKUP_KINDS } from './combat.js';

const TILE_FILL = {
  [T_LAWN]: PAL.lawn,
  [T_LAWN_PARK]: PAL.lawnDark,
  [T_ROAD]: PAL.asphalt,
  [T_WALK]: PAL.sidewalk,
  [T_SAND]: PAL.sand,
  [T_WATER]: PAL.water,
  [T_LOT]: '#565a62',
};

// Day-tint keyframes for the perpetual late-afternoon clock.
const GOLDEN = { centre: 0.65, half: 0.2, rgb: 'rgba(255, 140, 60, ', peak: 0.2 };

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const skids = [];
  let shake = 0;
  let camX = 0;
  let camY = 0;

  function resize() {
    canvas.width = canvas.clientWidth || 1280;
    canvas.height = canvas.clientHeight || 720;
  }
  window.addEventListener('resize', resize);
  resize();

  function addShake(amount) {
    shake = Math.min(22, shake + amount);
  }

  // ---- camera -----------------------------------------------------------------

  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.width / 2) / CAM_ZOOM + camX,
      y: (sy - canvas.height / 2) / CAM_ZOOM + camY,
    };
  }

  function worldToScreen(x, y) {
    return {
      x: (x - camX) * CAM_ZOOM + canvas.width / 2,
      y: (y - camY) * CAM_ZOOM + canvas.height / 2,
    };
  }

  function beginFrame(camera) {
    camX = camera.x;
    camY = camera.y;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.lawnDark;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const joltX = shake > 0.1 ? (Math.random() - 0.5) * shake : 0;
    const joltY = shake > 0.1 ? (Math.random() - 0.5) * shake : 0;
    ctx.setTransform(
      CAM_ZOOM, 0, 0, CAM_ZOOM,
      canvas.width / 2 - camX * CAM_ZOOM + joltX,
      canvas.height / 2 - camY * CAM_ZOOM + joltY,
    );
  }

  function endFrame(dt, dayT) {
    shake = shake > 0.1 ? shake * Math.pow(0.02, dt) : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Warm wash around the golden-hour peak, blue-tinged near night.
    let tint = null;
    if (dayT > 0.5 && dayT < 0.85) {
      const k = 1 - Math.abs(dayT - GOLDEN.centre) / GOLDEN.half;
      if (k > 0) tint = [GOLDEN.rgb, GOLDEN.peak * k];
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

    const g = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, canvas.height * 0.35,
      canvas.width / 2, canvas.height / 2, canvas.height * 0.95,
    );
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(6,4,12,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ---- ground ------------------------------------------------------------------

  function visibleTiles(view) {
    return {
      tx0: Math.max(0, Math.floor(view.x0 / TILE)),
      ty0: Math.max(0, Math.floor(view.y0 / TILE)),
      tx1: Math.min(GRID_W - 1, Math.floor(view.x1 / TILE)),
      ty1: Math.min(GRID_H - 1, Math.floor(view.y1 / TILE)),
    };
  }

  function drawCity(city, view) {
    const { tx0, ty0, tx1, ty1 } = visibleTiles(view);
    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const t = city.tiles[ty * GRID_W + tx];
        const px = tx * TILE;
        const py = ty * TILE;
        ctx.fillStyle = TILE_FILL[t] || PAL.lawn;
        ctx.fillRect(px, py, TILE, TILE);

        if (t === T_ROAD) {
          // Dashes along the band axis, one in every other tile.
          const horizontal = (ty % ROAD_GAP) < ROAD_WIDE;
          ctx.fillStyle = PAL.line;
          if (horizontal) {
            if (tx % 2 === 0) ctx.fillRect(px, py + TILE / 2 - 1, TILE, 2);
          } else if (ty % 2 === 0) {
            ctx.fillRect(px + TILE / 2 - 1, py, 2, TILE);
          }
        } else if (t === T_SAND && (tx * 5 + ty * 3) % 7 === 0) {
          ctx.fillStyle = 'rgba(255,240,200,0.22)';
          ctx.fillRect(px + 6, py + 8, 4, 3);
        } else if (t === T_WATER && (tx + ty) % 5 === 0) {
          ctx.fillStyle = 'rgba(150,200,235,0.18)';
          ctx.fillRect(px + 3, py + 10, TILE - 6, 2);
        } else if (t === T_LAWN_PARK && (tx * 7 + ty * 13) % 11 === 0) {
          ctx.fillStyle = PAL.lawn;
          ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);
        }
      }
    }

    // Harbor lots painted over the ground, bay lines and all.
    for (const lot of city.lots) {
      if (lot.x > view.x1 || lot.x + lot.w < view.x0 || lot.y > view.y1 || lot.y + lot.h < view.y0) continue;
      ctx.fillStyle = TILE_FILL[T_LOT];
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.fillStyle = '#e8dfae';
      for (let lx = lot.x + 6; lx < lot.x + lot.w - 6; lx += TILE) {
        ctx.fillRect(lx, lot.y + 4, 2, lot.h - 8);
      }
    }
  }

  // ---- buildings and trees -------------------------------------------------------

  function drawBuildings(city, view) {
    for (const b of city.buildings) {
      if (b.x > view.x1 + 40 || b.x + b.w < view.x0 - 40) continue;
      if (b.y > view.y1 + 40 || b.y + b.h < view.y0 - 40) continue;
      const lift = b.storeys * 3;
      const rx = b.x - lift * 0.3;

      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(b.x + 3, b.y + 4, b.w, b.h); // ground shadow
      ctx.fillStyle = b.color;
      ctx.fillRect(rx, b.y - lift, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(rx, b.y - lift, b.w, 4); // roof lip

      if (b.windows) {
        ctx.fillStyle = 'rgba(255, 210, 130, 0.75)';
        for (let wy = b.y - lift + 10; wy < b.y - 8; wy += 14) {
          for (let wx = rx + 6; wx < b.x + b.w - 8; wx += 12) {
            if ((Math.floor(wx / 12) + Math.floor(wy / 14)) % 3 === 0) continue; // unlit mix
            ctx.fillRect(wx, wy, 6, 7);
          }
        }
      }
      if (b.shopfront) {
        ctx.fillStyle = b.roof;
        ctx.fillRect(b.x, b.y + b.h - 10, b.w, 10);
        ctx.fillStyle = '#ffe9a8';
        ctx.fillRect(b.x + 4, b.y + b.h - 8, Math.max(8, b.w - 8), 3);
      }
    }
  }

  function drawTrees(city, view) {
    for (const tr of city.trees) {
      if (tr.x > view.x1 + 20 || tr.x < view.x0 - 20 || tr.y > view.y1 + 20 || tr.y < view.y0 - 20) continue;
      const r = tr.palm ? 9 : 11;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(tr.x + 3, tr.y + 3, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(tr.x - 2, tr.y - 2, 4, 4);
      ctx.fillStyle = tr.palm ? '#7aa04a' : '#4c7a35';
      ctx.beginPath();
      ctx.arc(tr.x, tr.y - 6, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- people -------------------------------------------------------------------

  function drawPed(p) {
    if (p.dead) {
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
    ctx.rotate(p.angle + Math.PI / 2); // bodies face "up" in local space
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

    if (c.mode === 'aim') {
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
    const W = c.width || VEHICLE.width;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-L / 2 + 2, -W / 2 + 3, L, W);
    ctx.fillStyle = c.color;
    ctx.fillRect(-L / 2, -W / 2, L, W);

    if (c.role === 'police') {
      ctx.fillStyle = '#eef2f7';
      ctx.fillRect(-L / 2 + 6, -W / 2, 12, W);
      const blink = Math.sin(performance.now() / 130);
      ctx.fillStyle = blink > 0 ? '#ff3b3b' : '#3b6bff';
      ctx.fillRect(-3, -W / 2 - 3, 7, 4);
      ctx.fillStyle = blink > 0 ? '#3b6bff' : '#ff3b3b';
      ctx.fillRect(5, -W / 2 - 3, 7, 4);
    }

    ctx.fillStyle = 'rgba(30, 40, 60, 0.9)'; // glass
    ctx.fillRect(L / 2 - 14, -W / 2 + 2, 9, W - 4);
    ctx.fillRect(-L / 2 + 6, -W / 2 + 3, 6, W - 6);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; // wheels
    ctx.fillRect(-L / 2 + 4, -W / 2 - 2, 6, 3);
    ctx.fillRect(-L / 2 + 4, W / 2 - 1, 6, 3);
    ctx.fillRect(L / 2 - 10, -W / 2 - 2, 6, 3);
    ctx.fillRect(L / 2 - 10, W / 2 - 1, 6, 3);

    if (c.health < 60) {
      ctx.fillStyle = `rgba(20,16,14,${Math.min(0.55, (60 - c.health) / 100)})`;
      ctx.fillRect(-L / 2 + 2, -W / 2 + 1, L - 4, W - 2);
    }
    ctx.restore();

    if (c.health < 35 && Math.random() < 0.25) {
      ctx.fillStyle = 'rgba(70,70,78,0.5)';
      ctx.beginPath();
      ctx.arc(c.x + (Math.random() - 0.5) * 8, c.y - 4 - Math.random() * 6, 3 + Math.random() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPlayer(p) {
    if (p.inVehicle) return; // the car IS the player while driving
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-5, -2, 10, 10);
    ctx.fillStyle = PAL.player;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(-5, 3, 10, 3);
    ctx.fillStyle = PAL.playerSkin;
    ctx.fillRect(-3, -9, 6, 6);
    if (p.weapon && p.weapon !== 'fists') {
      ctx.rotate(-p.angle); // aim the barrel from world space
      ctx.fillStyle = '#2a2a30';
      ctx.fillRect(5, -1.5, 10, 3);
    }
    ctx.restore();
  }

  /** Pennant marker with a pulsing ground ring. */
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

  // ---- effects -------------------------------------------------------------------

  function addSkid(x, y, angle) {
    if (skids.length > 420) skids.shift();
    skids.push({ x, y, angle, t: 1 });
  }

  function drawSkids(dt) {
    ctx.strokeStyle = 'rgba(24,20,22,0.34)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = skids.length - 1; i >= 0; i -= 1) {
      const s = skids[i];
      s.t -= dt * 0.035;
      if (s.t <= 0) {
        skids.splice(i, 1);
        continue;
      }
      ctx.moveTo(s.x - Math.cos(s.angle) * 5, s.y - Math.sin(s.angle) * 5);
      ctx.lineTo(s.x + Math.cos(s.angle) * 5, s.y + Math.sin(s.angle) * 5);
    }
    ctx.stroke();
  }

  function drawCombat(combat) {
    for (const f of combat.flashes) {
      ctx.fillStyle = 'rgba(255,225,150,0.95)';
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(14, -5);
      ctx.lineTo(20, 0);
      ctx.lineTo(14, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.lineWidth = 2;
    for (const b of combat.bullets) {
      ctx.strokeStyle = b.color;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.stroke();
    }

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

    for (const p of combat.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 11px system-ui, sans-serif';
    for (const p of combat.pickups) {
      const def = PICKUP_KINDS[p.type] || { color: '#fff', label: '?' };
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

    ctx.font = 'bold 12px system-ui, sans-serif';
    for (const f of combat.floats) {
      ctx.globalAlpha = Math.min(1, f.t);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawReticle(x, y) {
    ctx.strokeStyle = 'rgba(255,240,220,0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.moveTo(x - 11, y);
    ctx.lineTo(x - 7, y);
    ctx.moveTo(x + 7, y);
    ctx.lineTo(x + 11, y);
    ctx.moveTo(x, y - 11);
    ctx.lineTo(x, y - 7);
    ctx.moveTo(x, y + 7);
    ctx.lineTo(x, y + 11);
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
