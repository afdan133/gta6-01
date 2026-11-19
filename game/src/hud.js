// HUD and overlays. Pure canvas 2D, no DOM.
//
// Screen-space layer: health/armor/cash/clock, wanted stars, weapon and car condition, the
// north-up minimap with terrain and police blips, objective strip, off-screen marker arrow,
// district banner, story box and toasts. Also the title screen and the WASTED/BUSTED/COMPLETE
// overlays.

import { GRID_H, GRID_W, PAL, TILE } from './config.js';
import { T_ROAD, T_SAND, T_WALK, T_WATER } from './city.js';

const MINI = 168;        // diameter in CSS px
const MINI_PAD = 14;
const MINI_SCALE = 0.055; // world px -> minimap px

export function createHud(canvas, ctx) {
  // ---- primitives ----

  function rounded(x, y, w, h, r) {
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
    rounded(x, y, w, h, 8);
    ctx.fill();
  }

  function bar(x, y, w, h, frac, color, bg = 'rgba(255,255,255,0.13)') {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
  }

  function stars(x, y, wanted) {
    for (let i = 0; i < 5; i += 1) {
      const cx = x + i * 22;
      ctx.fillStyle = i < wanted ? PAL.star : 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      for (let k = 0; k < 10; k += 1) {
        const r = k % 2 === 0 ? 8 : 3.4;
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const px = cx + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function wrap(text, maxW, font) {
    ctx.font = font;
    const lines = [];
    for (const para of String(text).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > maxW) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  // ---- in-game layer ----

  function draw(state) {
    const { player, dayT, wanted, weaponName, ammo, vehicleHealth } = state;
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Top-left: vitals, wallet, clock.
    panel(12, 12, 268, 96);
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillStyle = PAL.hudText;
    ctx.fillText('HEALTH', 24, 32);
    bar(90, 22, 176, 11, player.health / 100, player.health > 40 ? '#63c26a' : PAL.hudBad);
    ctx.fillText('ARMOR', 24, 52);
    bar(90, 42, 176, 9, player.armor / 100, '#4fa3e3');
    ctx.fillStyle = PAL.hudAccent;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText(`$${player.cash}`, 24, 88);
    const clock = (dayT + 0.25) % 1; // dayT 0.25 == midday
    const hh = String(Math.floor(clock * 24)).padStart(2, '0');
    const mm = String(Math.floor((clock * 24 % 1) * 60)).padStart(2, '0');
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(245,233,208,0.6)';
    ctx.fillText(`${hh}:${mm}`, 220, 88);

    // Top-right: wanted stars, weapon, car condition.
    panel(W - 226, 12, 214, 96);
    ctx.textAlign = 'right';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.fillStyle = wanted > 0 ? PAL.hudBad : 'rgba(245,233,208,0.55)';
    ctx.fillText(wanted > 0 ? 'WANTED' : 'NO HEAT', W - 24, 30);
    stars(W - 24 - 4 * 22 - 8, 46, wanted);
    ctx.textAlign = 'left';
    ctx.fillStyle = PAL.hudText;
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(weaponName, W - 214, 78);
    ctx.textAlign = 'right';
    ctx.fillStyle = PAL.hudAccent;
    ctx.fillText(ammo === null ? '—' : String(ammo), W - 24, 78);
    if (vehicleHealth !== null && vehicleHealth !== undefined) {
      ctx.textAlign = 'left';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(245,233,208,0.6)';
      ctx.fillText('CAR', W - 214, 96);
      bar(W - 186, 88, 162, 7, vehicleHealth / 100, vehicleHealth > 40 ? '#8ad0e0' : PAL.hudBad);
    }

    // Objective strip, top centre.
    if (state.objective) {
      ctx.font = 'bold 15px system-ui, sans-serif';
      const bw = Math.min(W - 340, ctx.measureText(state.objective).width + 40);
      panel(W / 2 - bw / 2, 12, bw, 40);
      ctx.fillStyle = PAL.hudAccent;
      ctx.textAlign = 'center';
      ctx.fillText(state.objective, W / 2, 38);
    }

    drawMinimap(state);

    // Off-screen marker arrow clamped to the screen edge.
    if (state.marker && state.markerScreen && !state.markerScreen.onScreen) {
      const { sx, sy } = state.markerScreen;
      const cx = W / 2;
      const cy = H / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const t = Math.min(
        (W / 2 - 48) / Math.max(0.001, Math.abs(Math.cos(a))),
        (H / 2 - 48) / Math.max(0.001, Math.abs(Math.sin(a))),
      );
      ctx.save();
      ctx.translate(cx + Math.cos(a) * t, cy + Math.sin(a) * t);
      ctx.rotate(a);
      ctx.fillStyle = PAL.hudAccent;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // District banner when entering a new part of town.
    if (state.districtBanner > 0 && state.district) {
      ctx.globalAlpha = Math.min(1, state.districtBanner);
      ctx.fillStyle = 'rgba(15,12,20,0.72)';
      ctx.fillRect(W / 2 - 170, 66, 340, 54);
      ctx.fillStyle = PAL.hudAccent;
      ctx.font = 'bold 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.district.toUpperCase(), W / 2, 104);
      ctx.globalAlpha = 1;
    }

    // Story / mission brief, bottom centre.
    if (state.storyText && state.storyTimer > 0) {
      ctx.globalAlpha = Math.min(1, state.storyTimer);
      const lines = wrap(state.storyText, 640, '15px system-ui, sans-serif');
      const bw = 680;
      const bh = lines.length * 22 + 30;
      const by = H - bh - 96;
      panel(W / 2 - bw / 2, by, bw, bh);
      ctx.textAlign = 'left';
      ctx.font = '15px system-ui, sans-serif';
      ctx.fillStyle = PAL.hudText;
      lines.forEach((ln, i) => ctx.fillText(ln, W / 2 - bw / 2 + 20, by + 28 + i * 22));
      ctx.globalAlpha = 1;
    }

    // Toast line.
    if (state.toast && state.toastTimer > 0) {
      ctx.globalAlpha = Math.min(1, state.toastTimer);
      ctx.fillStyle = 'rgba(15,12,20,0.8)';
      ctx.fillRect(W / 2 - 260, H - 60, 520, 36);
      ctx.fillStyle = PAL.hudText;
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(state.toast, W / 2, H - 36);
      ctx.globalAlpha = 1;
    }
  }

  /** Circular, player-centred north-up minimap. */
  function drawMinimap(state) {
    const { city, player, mission, wanted } = state;
    const x0 = MINI_PAD;
    const y0 = canvas.height - MINI - MINI_PAD;
    const cx = x0 + MINI / 2;
    const cy = y0 + MINI / 2;
    const halfW = MINI / 2 / MINI_SCALE;

    ctx.save();
    ctx.fillStyle = 'rgba(10,10,16,0.86)';
    ctx.beginPath();
    ctx.arc(cx, cy, MINI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, MINI / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    // Coarse terrain pass: one swatch per three tiles.
    for (let ty = 0; ty < GRID_H; ty += 3) {
      for (let tx = 0; tx < GRID_W; tx += 3) {
        const wx = (tx + 0.5) * TILE;
        const wy = (ty + 0.5) * TILE;
        if (Math.abs(wx - player.x) > halfW || Math.abs(wy - player.y) > halfW) continue;
        const t = city.tiles[ty * GRID_W + tx];
        let col = null;
        if (t === T_ROAD) col = '#6a6d78';
        else if (t === T_WATER) col = '#2b4f74';
        else if (t === T_SAND) col = '#7d6a4a';
        else if (t === T_WALK) col = '#55504a';
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(cx + (wx - player.x) * MINI_SCALE - 3, cy + (wy - player.y) * MINI_SCALE - 3, 6, 6);
      }
    }

    ctx.fillStyle = 'rgba(40,32,40,0.85)';
    for (const b of city.buildings) {
      if (Math.abs(b.x - player.x) > halfW + 100 || Math.abs(b.y - player.y) > halfW + 100) continue;
      ctx.fillRect(
        cx + (b.x - player.x) * MINI_SCALE,
        cy + (b.y - player.y) * MINI_SCALE,
        Math.max(2, b.w * MINI_SCALE), Math.max(2, b.h * MINI_SCALE),
      );
    }

    if (mission) {
      ctx.fillStyle = PAL.hudAccent;
      ctx.beginPath();
      ctx.arc(cx + (mission.x - player.x) * MINI_SCALE, cy + (mission.y - player.y) * MINI_SCALE, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.policeBlips) {
      ctx.fillStyle = wanted >= 3 ? '#ff5f5f' : '#5fa8ff';
      for (const p of state.policeBlips) {
        ctx.fillRect(cx + (p.x - player.x) * MINI_SCALE - 2.5, cy + (p.y - player.y) * MINI_SCALE - 2.5, 5, 5);
      }
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(player.angle);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -4.5);
    ctx.lineTo(-5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();

    ctx.strokeStyle = 'rgba(245,233,208,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, MINI / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(245,233,208,0.8)';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, y0 + 12);
  }

  // ---- overlays ----

  /** Title screen: gradient, sun, procedural skyline, controls, prompt. */
  function drawTitle(t, seed) {
    const W = canvas.width;
    const H = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#241a3a');
    g.addColorStop(0.45, '#7a3350');
    g.addColorStop(0.72, '#d9713c');
    g.addColorStop(1, '#f2b25c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,214,140,0.9)';
    ctx.beginPath();
    ctx.arc(W / 2, H * 0.62, Math.min(W, H) * 0.13, 0, Math.PI * 2);
    ctx.fill();

    // Deterministic silhouette, no assets.
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
    [
      'WASD / Arrows — walk & drive        SHIFT — run        SPACE — handbrake',
      'E — enter / exit vehicle        Mouse — aim        Left click — shoot',
      '1 / 2 / 3 — fists / pistol / uzi        M — mute        F5 — save        Q / F9 — load',
    ].forEach((c, k) => ctx.fillText(c, W / 2, H * 0.53 + k * 24));

    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 3);
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
