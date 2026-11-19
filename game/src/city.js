// City generation.
//
// A 96x96 tile Int8 grid. Road bands run every ROAD_GAP tiles in both axes; a one-tile
// sidewalk ring frames each band; the block interiors get buildings whose character depends
// on the district. The east edge is beach, the south-east corner is a working harbor, and
// Greenbelt Park stays lawn. Buildings, trees and lots are separate lists shared with the
// renderer and the collision code so geometry is derived once, at build time.

import {
  DISTRICTS, GRID_H, GRID_W, PAL, ROAD_GAP, ROAD_WIDE, TILE,
  WORLD_H, WORLD_W,
} from './config.js';
import { createRandom } from './random.js';

// Terrain ids.
export const T_ROAD = 0;
export const T_WALK = 1;
export const T_LOT = 2;
export const T_WALL = 3;
export const T_LAWN = 4;
export const T_LAWN_PARK = 7; // tended park lawn, distinct from wild grass
export const T_SAND = 5;
export const T_WATER = 6;

export const BAND_PX = ROAD_GAP * TILE;

export function createCity(seed) {
  const rng = createRandom(seed);
  const tiles = new Int8Array(GRID_W * GRID_H);

  const horizonBand = (ty) => (ty % ROAD_GAP) < ROAD_WIDE;
  const verticalBand = (tx) => (tx % ROAD_GAP) < ROAD_WIDE;
  const besideHoriz = (ty) => horizonBand(ty - 1) || horizonBand(ty + 1);
  const besideVert = (tx) => verticalBand(tx - 1) || verticalBand(tx + 1);

  // --- lay the base terrain ------------------------------------------------
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = 0; tx < GRID_W; tx += 1) {
      let id = T_LAWN;
      if (horizonBand(ty) || verticalBand(tx)) id = T_ROAD;
      else if (besideHoriz(ty) || besideVert(tx)) id = T_WALK;
      tiles[ty * GRID_W + tx] = id;
    }
  }

  // Beach on the east rim: sand, then open water; roads still reach the shore.
  const surfX = GRID_W - 8;
  for (let ty = 0; ty < GRID_H; ty += 1) {
    for (let tx = surfX; tx < GRID_W; tx += 1) {
      const i = ty * GRID_W + tx;
      if (tiles[i] === T_ROAD || tiles[i] === T_WALK) continue;
      tiles[i] = tx >= GRID_W - 4 ? T_WATER : T_SAND;
    }
  }

  // Harbor in the south-east: dock planks with slipways cut through them.
  const pierTop = GRID_H - 10;
  for (let ty = pierTop; ty < GRID_H; ty += 1) {
    for (let tx = GRID_W - 26; tx < surfX; tx += 1) {
      const i = ty * GRID_W + tx;
      if (tiles[i] === T_ROAD || tiles[i] === T_WALK) continue;
      tiles[i] = ty >= GRID_H - 6 && tx % 7 < 2 ? T_WATER : T_LOT;
    }
  }

  // Greenbelt Park lawn inside its district ring.
  const park = DISTRICTS.find((d) => d.name === 'Greenbelt Park');
  for (let ty = park.y + 1; ty < park.y + park.h - 1; ty += 1) {
    for (let tx = park.x + 1; tx < park.x + park.w - 1; tx += 1) {
      const i = ty * GRID_W + tx;
      if (tiles[i] === T_LAWN) tiles[i] = T_LAWN_PARK;
    }
  }
  // (lawn id 4 = T_LAWN; the loop above keeps roads/sidewalks through the park intact)

  // --- fill the blocks ------------------------------------------------------
  const buildings = [];
  const trees = [];
  const lots = [];

  const districtAt = (px, py) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (const d of DISTRICTS) {
      if (tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h) return d.name;
    }
    return 'Sunset Flats';
  };

  const styleFor = (name) => {
    if (name === 'Downtown') return { storeys: [3, 6], span: [5, 8] };
    if (name === 'Palm Heights') return { storeys: [2, 4], span: [4, 7] };
    if (name === 'Neon Row' || name === 'Little Mercado') return { storeys: [1, 2], span: [3, 6] };
    if (name === 'Old Harbor') return { storeys: [1, 3], span: [5, 8] };
    return { storeys: [1, 2], span: [3, 5] };
  };

  for (let by = 0; by < GRID_H; by += ROAD_GAP) {
    for (let bx = 0; bx < GRID_W; bx += ROAD_GAP) {
      // Interior of one block: past the sidewalk ring, before the next band.
      const x0 = bx + ROAD_WIDE + 1;
      const y0 = by + ROAD_WIDE + 1;
      const x1 = bx + ROAD_GAP - 1;
      const y1 = by + ROAD_GAP - 1;
      if (x1 <= x0 || y1 <= y0) continue;

      const name = districtAt(((x0 + x1) / 2) * TILE, ((y0 + y1) / 2) * TILE);
      if (name === 'Greenbelt Park') continue;

      if (name === 'Sunset Beach') {
        for (let k = 0; k < 3; k += 1) {
          trees.push({ x: rng.range(x0, x1 + 1) * TILE, y: rng.range(y0, y1 + 1) * TILE, palm: true });
        }
        continue;
      }
      if (name === 'Old Harbor' && rng.chance(0.25)) {
        lots.push({ x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
        continue;
      }

      const style = styleFor(name);
      const addBuilding = (ax0, ay0, ax1, ay1) => {
        const gap = 1;
        const bw = ax1 - ax0 - gap;
        const bh = ay1 - ay0 - gap;
        if (bw < 2 || bh < 2) return;
        const pal = rng.int(0, PAL.wall.length - 1);
        buildings.push({
          x: (ax0 + gap) * TILE,
          y: (ay0 + gap) * TILE,
          w: bw * TILE,
          h: bh * TILE,
          color: PAL.wall[pal],
          roof: PAL.roof[pal],
          storeys: rng.int(style.storeys[0], style.storeys[1]),
          shopfront: name === 'Neon Row' || name === 'Little Mercado' || rng.chance(0.2),
          windows: rng.chance(0.85),
          district: name,
        });
      };

      if (rng.chance(0.4)) {
        if (rng.chance(0.5)) {
          const mid = rng.int(x0 + 2, x1 - 2);
          addBuilding(x0, y0, mid, y1);
          addBuilding(mid, y0, x1, y1);
        } else {
          const mid = rng.int(y0 + 2, y1 - 2);
          addBuilding(x0, y0, x1, mid);
          addBuilding(x0, mid, x1, y1);
        }
      } else {
        addBuilding(x0, y0, x1, y1);
      }

      if (rng.chance(0.35)) {
        trees.push({ x: rng.range(x0, x1 + 1) * TILE, y: rng.range(y0, y1 + 1) * TILE, palm: false });
      }
    }
  }

  // Sparse trees across the park lawn.
  for (let ty = park.y + 2; ty < park.y + park.h - 2; ty += 1) {
    for (let tx = park.x + 2; tx < park.x + park.w - 2; tx += 1) {
      if ((tiles[ty * GRID_W + tx] === T_LAWN || tiles[ty * GRID_W + tx] === T_LAWN_PARK) && rng.chance(0.12)) {
        trees.push({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, palm: false });
      }
    }
  }

  return {
    seed,
    tiles,
    buildings,
    trees,
    lots,
    districts: DISTRICTS,

    districtAt(px, py) {
      return districtAt(px, py);
    },

    tileAt(px, py) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= GRID_W || ty >= GRID_H) return T_WATER;
      return tiles[ty * GRID_W + tx];
    },

    isRoad(px, py) {
      return this.tileAt(px, py) === T_ROAD;
    },

    solidAt(px, py) {
      return this.tileAt(px, py) === T_WATER;
    },

    pointInBuilding(px, py) {
      for (const b of buildings) {
        if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b;
      }
      return null;
    },

    worldSize() {
      return { w: WORLD_W, h: WORLD_H };
    },
  };
}

/** Snap a coordinate to the middle of its road band (lane keeping for traffic AI). */
export function laneCenter(value) {
  const band = Math.floor(value / BAND_PX) * BAND_PX;
  return band + (ROAD_WIDE / 2) * TILE;
}
