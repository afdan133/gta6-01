// World rendering: camera, ground tiles, buildings (with a fake-3D roof offset by height),
// trees, entities, day-night tint, and screen shake. One draw call per layer, nothing fancy —
// the look is flat colours with warm sunset light.

import { CAMERA_ZOOM, MAP_H, MAP_W, PAL, ROAD_GAP, ROAD_W, TILE } from './config.js';
import {
  T_DOCK, T_GRASS, T_LOT, T_PARK, T_ROAD, T_SAND, T_SIDEWALK, T_WATER,
} from './city.js';

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

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let shake = 0;
  let camX = 0;
  let camY = 0;

  function resize() {
    canvas.width = canvas.clientWidth || 1280;
    canvas.height = canvas.clientHeight || 720;
  }
  window.addEventListener('resize', resize);
  resize();

  function addShake(amount) { shake = Math.min(20, shake + amount); }

  // Convert screen (CSS px) to world px.
  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.width / 2) / CAMERA_ZOOM + camX,
      y: (sy - canvas.height / 2) / CAMERA_ZOOM + camY,
    };
  }

  function beginFrame(camera) {
    camX = camera.x;
    camY = camera.y;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = PAL.grassDark;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (shake > 0.1) {
      ctx.setTransform(1, 0, 0, 1, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    }
    ctx.setTransform(CAMERA_ZOOM, 0, 0, CAMERA_ZOOM,
      canvas.width / 2 - camX * CAMERA_ZOOM, canvas.height / 2 - camY * CAMERA_ZOOM);
  }

  function endFrame(dt, dayT) {
    if (shake > 0.1) shake *= Math.pow(0.02, dt);
    else shake = 0;
    // Day tint: warm orange at sunset (t ~0.55-0.8), pale blue dawn, dark blue night.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    let tint = null;
    if (dayT > 0.5 && dayT < 0.85) {
      const k = 1 - Math.abs(dayT - 0.65) / 0.2; // peak at 0.65
      if (k > 0) tint = ['rgba(255, 140, 60, ', 0.20 * k];
    }
    if (dayT >= 0.85 || dayT < 0.12) {
      const k = dayT >= 0.85 ? (dayT - 0.85) / 0.15 : (0.12 - dayT) / 0.12;
      tint = ['rgba(10, 20, 60, ', 0.45 * Math.min(1, k)];
    } else if (dayT < 0.3) {
      const k = (0.3 - dayT) / 0.3;
      tint = ['rgba(120, 140, 220, ', 0.15 * k];
    }
    if (tint) {
      ctx.fillStyle = tint[0] + tint[1].toFixed(3) + ')';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawCity(city, view) {
    const { x0, y0, x1, y1 } = view;
    const tx0 = Math.max(0, Math.floor(x0 / TILE));
    const ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(MAP_W - 1, Math.floor(x1 / TILE));
    const ty1 = Math.min(MAP_H - 1, Math.floor(y1 / TILE));

    for (let ty = ty0; ty <= ty1; ty += 1) {
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const t = city.tiles[ty * MAP_W + tx];
        ctx.fillStyle = TILE_COLORS[t] || PAL.grass;
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        if (t === T_ROAD) {
          // Lane dashes along the band axis.
          const onH = (ty % ROAD_GAP) < ROAD_W;
          ctx.fillStyle = PAL.roadLine;
          if (onH) {
            if ((tx % 2) === 0) ctx.fillRect(tx * TILE, ty * TILE + TILE / 2 - 1, TILE, 2);
          } else if ((ty % 2) === 0) ctx.fillRect(tx * TILE + TILE / 2 - 1, ty * TILE, 2, TILE);
        } else if (t === T_PARK && ((tx * 7 + ty * 13) % 11 === 0)) {
          ctx.fillStyle = PAL.grassDark;
          ctx.fillRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8);
        }
      }
    }
    // Parking lots.
    ctx.fillStyle = TILE_COLORS[T_LOT];
    for (const lot of city.lots) {
      if (lot.x > x1 || lot.x + lot.w < x0 || lot.y > y1 || lot.y + lot.h < y0) continue;
      ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
      ctx.fillStyle = '#e8dfae';
      for (let lx = lot.x + 6; lx < lot.x + lot.w - 6; lx += TILE) {
        ctx.fillRect(lx, lot.y + 4, 2, lot.h - 8);
      }
      ctx.fillStyle = TILE_COLORS[T_LOT];
    }
  }

  function drawBuildings(city, view) {
    const { x0, y0, x1, y1 } = view;
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      // Roof offset: taller buildings shift their roof up-left for a cheap 3D read.
      const off = b.height * 3;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x - off * 0.3, b.y - off, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x - off * 0.3, b.y - off, b.w, 4);
      if (b.windows) {
        ctx.fillStyle = 'rgba(255, 210, 130, 0.75)';
        for (let wy = b.y - off + 10; wy < b.y - 6; wy += 14) {
          for (let wx = b.x - off * 0.3 + 6; wx < b.x + b.w - 8; wx += 12) {
            if ((Math.floor(wx / 12) + Math.floor(wy / 14)) % 3 !== 0) continue;
            ctx.fillRect(wx, wy, 6, 7);
          }
        }
      }
      if (b.shop) {
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
      if (tr.x > x1 || tr.x < x0 || tr.y > y1 || tr.y < y0) continue;
      ctx.fillStyle = '#5a4632';
      ctx.fillRect(tr.x - 2, tr.y - 2, 4, 4);
      ctx.fillStyle = tr.palm ? '#7aa04a' : '#4c7a35';
      const r = tr.palm ? 9 : 11;
      ctx.beginPath();
      ctx.arc(tr.x, tr.y - 6, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPed(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = p.shirt;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = PAL.playerSkin;
    ctx.fillRect(-2.5, -7, 5, 5);
    ctx.restore();
  }

  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.length / 2, -c.width / 2, c.length, c.width);
    ctx.fillStyle = 'rgba(30, 40, 60, 0.9)';
    ctx.fillRect(-c.length / 2 + 7, -c.width / 2 + 2, 9, c.width - 4); // windshield
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(-c.length / 2 - 2, -c.width / 2, 3, 4);
    ctx.fillRect(-c.length / 2 - 2, c.width / 2 - 4, 3, 4);
    ctx.fillRect(c.length / 2 - 1, -c.width / 2, 3, 4);
    ctx.fillRect(c.length / 2 - 1, c.width / 2 - 4, 3, 4);
    ctx.restore();
  }

  function drawPlayer(p) {
    if (p.inVehicle) return;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle + Math.PI / 2);
    // Shadow + body + head, facing up before rotation.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-5, -3, 10, 10);
    ctx.fillStyle = PAL.player;
    ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = PAL.playerSkin;
    ctx.fillRect(-3, -9, 6, 6);
    ctx.restore();
  }

  function drawMarker(x, y, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 14);
    ctx.lineTo(x - 9, y - 30);
    ctx.lineTo(x + 9, y - 30);
    ctx.closePath();
    ctx.fill();
  }

  return {
    ctx,
    canvas,
    screenToWorld,
    addShake,
    beginFrame,
    endFrame,
    drawCity,
    drawBuildings,
    drawTrees,
    drawPed,
    drawCar,
    drawPlayer,
    drawMarker,
  };
}
