// HUD: everything drawn over the world — health/armor bars, cash, wanted stars, weapon + ammo,
// the square minimap (north-up) with roads, district label, mission marker and police blips,
// the mission objective strip, district banner, story text, floating toasts, the pause screen
// and the title screen. Pure canvas 2D, no DOM.

import { MAP_H, MAP_W, PAL, ROAD_GAP, ROAD_W, TILE, VEHICLE, CAMERA_ZOOM, DISTRICTS } from './config.js';
import { T_ROAD, T_SIDEWALK, T_WATER, T_SAND } from './city.js';

const MINI = 168;   // minimap size in CSS px
const MINI_PAD = 14;

export function createHud(canvas, ctx) {
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PAL.hudBg;
    roundRect(x, y, w, h, 8);
    ctx.fill();
  }

  function bar(x, y, w, h, frac, color, bg) {
    ctx.fillStyle = bg || 'rgba(255,255,255,0.13)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function drawStars(x, y, wanted) {
    for (let i = 0; i < 5; i += 1) {
      const cx = x + i * 22;
      const on = i < wanted;
      ctx.fillStyle = on ? '#ffd24a' : 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      for (let k = 0; k < 10; k += 1) {
        const r = k % 2 === 0 ? 8 : 3.4;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const px = cx + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  /** Main in-game HUD. */
  function draw(state) {
    const { player, city, dayT, mission, wanted, weaponName, ammo, vehicleHealth } = state;
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // ---- top-left: health / armor / cash --------------------------------
    panel(12, 12, 268, 96);
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = PAL.hudText;
    ctx.fillText('HEALTH', 24, 32);
    bar(90, 22, 176, 11, player.health / 100, player.health > 40 ? '#63c26a' : '#e04f4f');
    ctx.fillStyle = PAL.hudText;
    ctx.fillText('ARMOR', 24, 52);
    bar(90, 42, 176, 9, player.armor / 100, '#4fa3e3');
    ctx.fillStyle = PAL.hudAccent;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`$${player.cash}`, 24, 88);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(245,233,208,0.6)';
    const hh = Math.floor(((dayT + 0.25) % 1) * 24).toString().padStart(2, '0');
    const mm = Math.floor(((((dayT + 0.25) % 1) * 24) % 1) * 60).toString().padStart(2, '0');
    ctx.fillText(`${hh}:${mm}`, 220, 88);

    // ---- top-right: wanted stars + weapon ------------------------------
    panel(W - 12 - 214, 12, 214, 96);
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = wanted > 0 ? PAL.danger : 'rgba(245,233,208,0.55)';
    ctx.fillText(wanted > 0 ? 'WANTED' : 'NO HEAT', W - 24, 30);
    drawStars(W - 24 - 4 * 22 - 8, 46, wanted);
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.hudText;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(weaponName, W - 214, 78);
    ctx.textAlign = 'right';
    ctx.fillStyle = PAL.hudAccent;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(ammo === null ? '—' : String(ammo), W - 24, 78);
    if (vehicleHealth !== null && vehicleHealth !== undefined) {
      ctx.textAlign = 'left';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(245,233,208,0.6)';
      ctx.fillText('CAR', W - 214, 96);
      bar(W - 186, 88, 162, 7, vehicleHealth / 100, vehicleHealth > 40 ? '#8ad0e0' : '#e04f4f');
    }

    // ---- objective strip, top centre ------------------------------------
    if (state.objective) {
      const text = state.objective;
      ctx.font = 'bold 15px system-ui, sans-serif';
      const wText = ctx.measureText(text).width;
      const bw = Math.min(W - 340, wText + 40);
      panel(W / 2 - bw / 2, 12, bw, 40);
      ctx.fillStyle = PAL.hudAccent;
      ctx.textAlign = 'center';
      ctx.fillText(text, W / 2, 38);
    }

    // ---- minimap, bottom-left -------------------------------------------
    drawMinimap(state);

    // ---- mission marker arrow on screen edge ---------------------------
    if (state.marker && state.markerScreen) {
      const { sx, sy, onScreen } = state.markerScreen;
      if (!onScreen) {
        const cx = W / 2;
        const cy = H / 2;
        const a = Math.atan2(sy - cy, sx - cx);
        const rx = Math.min(W / 2 - 48, Math.abs(Math.cos(a)) * (W / 2 - 48) + 1);
        const ry = Math.min(H / 2 - 48, Math.abs(Math.sin(a)) * (H / 2 - 48) + 1);
        const px = cx + Math.cos(a) * Math.min(rx, ry / Math.max(0.001, Math.abs(Math.sin(a))));
        const py = cy + Math.sin(a) * Math.min(rx, ry / Math.max(0.001, Math.abs(Math.cos(a))));
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(a);
        ctx.fillStyle = PAL.hudAccent;
        ctx.beginPath();
        ctx.moveTo(14, 0); ctx.lineTo(-8, -9); ctx.lineTo(-8, 9);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // ---- district banner ------------------------------------------------
    if (state.districtBanner > 0 && state.district) {
      const a = Math.min(1, state.districtBanner);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(15,12,20,0.72)';
      ctx.fillRect(W / 2 - 170, 66, 340, 54);
      ctx.fillStyle = PAL.hudAccent;
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.district.toUpperCase(), W / 2, 104);
      ctx.globalAlpha = 1;
    }

    // ---- story text / mission brief ------------------------------------
    if (state.storyText && state.storyTimer > 0) {
      ctx.globalAlpha = Math.min(1, state.storyTimer);
      const lines = wrap(state.storyText, 640, '15px system-ui, sans-serif');
      const bw = 680;
      const bh = lines.length * 22 + 30;
      panel(W / 2 - bw / 2, H - bh - 96, bw, bh);
      ctx.textAlign = 'left';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = PAL.hudText;
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2 - bw / 2 + 20, H - bh - 96 + 28 + i * 22));
      ctx.globalAlpha = 1;
    }

    // ---- toast ----------------------------------------------------------
    if (state.toast && state.toastTimer > 0) {
      ctx.globalAlpha = Math.min(1, state.toastTimer);
      const tw = ctx.measureText(state.toast).width;
      ctx.fillStyle = 'rgba(15,12,20,0.8)';
      ctx.fillRect(W / 2 - 260, H - 60, 520, 36);
      ctx.fillStyle = PAL.hudText;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.toast, W / 2, H - 36);
      ctx.globalAlpha = 1;
    }
  }

  function wrap(text, maxW, font) {
    ctx.font = font;
    const out = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW) { out.push(line); line = word; } else line = test;
      }
      out.push(line);
    }
    return out;
  }

  /** Minimap: a window of the city around the player, north-up, with blips. */
  function drawMinimap(state) {
    const { city, player, mission, wanted } = state;
    const H = canvas.height;
    const x0 = MINI_PAD;
    const y0 = H - MINI - MINI_PAD;
    const scale = 0.055; // world px -> minimap px
    const halfW = MINI / 2 / scale;

    ctx.save();
    ctx.fillStyle = 'rgba(10,10,16,0.86)';
    ctx.beginPath();
    ctx.arc(x0 + MINI / 2, y0 + MINI / 2, MINI / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0 + MINI / 2, y0 + MINI / 2, MINI / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    // Roads + water as terrain swatches (cheap: draw a coarse tile pass).
    const step = 3; // tiles per swatch
    for (let ty = 0; ty < MAP_H; ty += step) {
      for (let tx = 0; tx < MAP_W; tx += step) {
        const wx = (tx + 0.5) * TILE;
        const wy = (ty + 0.5) * TILE;
        if (Math.abs(wx - player.x) > halfW || Math.abs(wy - player.y) > halfW) continue;
        const t = city.tiles[ty * MAP_W + tx];
        let col = null;
        if (t === T_ROAD) col = '#6a6d78';
        else if (t === T_WATER) col = '#2b4f74';
        else if (t === T_SAND) col = '#7d6a4a';
        else if (t === T_SIDEWALK) col = '#55504a';
        if (!col) continue;
        const mx = x0 + MINI / 2 + (wx - player.x) * scale;
        const my = y0 + MINI / 2 + (wy - player.y) * scale;
        ctx.fillStyle = col;
        ctx.fillRect(mx - 3, my - 3, 6, 6);
      }
    }

    // Buildings as dark blocks.
    ctx.fillStyle = 'rgba(40,32,40,0.85)';
    for (const b of city.buildings) {
      if (Math.abs(b.x - player.x) > halfW + 100 || Math.abs(b.y - player.y) > halfW + 100) continue;
      const mx = x0 + MINI / 2 + (b.x - player.x) * scale;
      const my = y0 + MINI / 2 + (b.y - player.y) * scale;
      ctx.fillRect(mx, my, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
    }

    // Mission marker blip.
    if (mission) {
      const mx = x0 + MINI / 2 + (mission.x - player.x) * scale;
      const my = y0 + MINI / 2 + (mission.y - player.y) * scale;
      ctx.fillStyle = PAL.hudAccent;
      ctx.beginPath();
      ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Police blips.
    if (state.policeBlips) {
      for (const p of state.policeBlips) {
        const mx = x0 + MINI / 2 + (p.x - player.x) * scale;
        const my = y0 + MINI / 2 + (p.y - player.y) * scale;
        ctx.fillStyle = wanted >= 3 ? '#ff5f5f' : '#5fa8ff';
        ctx.fillRect(mx - 2.5, my - 2.5, 5, 5);
      }
    }

    // Player arrow (always centre, rotated to facing).
    ctx.save();
    ctx.translate(x0 + MINI / 2, y0 + MINI / 2);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -4.5); ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // Ring + compass.
    ctx.strokeStyle = 'rgba(245,233,208,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x0 + MINI / 2, y0 + MINI / 2, MINI / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,233,208,0.8)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', x0 + MINI / 2, y0 + 12);
  }

  /** Title screen: name, controls, prompt. */
  function drawTitle(t, seed) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Sunset gradient backdrop.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#241a3a');
    g.addColorStop(0.45, '#7a3350');
    g.addColorStop(0.72, '#d9713c');
    g.addColorStop(1, '#f2b25c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Sun.
    ctx.fillStyle = 'rgba(255,214,140,0.9)';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.62, Math.min(W, H) * 0.13, 0, Math.PI * 2);
    ctx.fill();
    // Skyline silhouette.
    ctx.fillStyle = 'rgba(28,18,32,0.92)';
    let x = 0;
    let i = 0;
    while (x < W) {
      const bw = 40 + ((i * 37) % 70);
      const bh = 60 + ((i * 53) % 150);
      ctx.fillRect(x, H * 0.66 - bh, bw, bh + H * 0.4);
      x += bw + 6;
      i += 1;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff3dc';
    ctx.font = `bold ${Math.round(Math.min(W, H) * 0.105)}px Georgia, serif`;
    ctx.fillText('SUNSET CITY', W / 2, H * 0.34);
    ctx.fillStyle = 'rgba(255,222,170,0.9)';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('A top-down open-world crime story at golden hour', W / 2, H * 0.4);

    ctx.font = '14px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,240,220,0.92)';
    const controls = [
      'WASD / Arrows — walk & drive        SHIFT — run        SPACE — handbrake',
      'E — enter / exit vehicle        Mouse — aim        Left click — shoot',
      '1 / 2 — fists / pistol / uzi        M — mute        F5 — save        F9 — load',
    ];
    controls.forEach((c, k) => ctx.fillText(c, W / 2, H * 0.53 + k * 24));

    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('CLICK or press ENTER to start', W / 2, H * 0.73);
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,240,220,0.55)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`world seed ${seed} · everything generated in code`, W / 2, H * 0.92);
  }

  /** Pause / game-over overlay. */
  function drawPause(title, subtitle) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = 'rgba(8,6,12,0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff3dc';
    ctx.font = 'bold 46px Georgia, serif';
    ctx.fillText(title, W / 2, H / 2 - 10);
    if (subtitle) {
      ctx.fillStyle = 'rgba(255,240,220,0.85)';
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillText(subtitle, W / 2, H / 2 + 30);
    }
  }

  return { draw, drawTitle, drawPause };
}

export { DISTRICTS };
