// City generation: a 96x96 tile map with a road grid every ROAD_GAP tiles, blocks of buildings
// between the roads, districts with names, a park, a beach on the east edge and a harbor on the
// south-east. The map is a flat Int8Array of terrain ids; buildings and props are separate lists
// the renderer and collision both read.

import {
  DISTRICTS, MAP_H, MAP_W, PAL, ROAD_GAP, ROAD_W, TILE, WORLD_H, WORLD_W,
} from './config.js';
import { createRandom } from './random.js';

export const T_GRASS = 0;
export const T_ROAD = 1;
export const T_SIDEWALK = 2;
export const T_PARK = 3;
export const T_SAND = 4;
export const T_WATER = 5;
export const T_DOCK = 6;
export const T_LOT = 7; // paved parking lot

export function createCity(seed) {
  const rng = createRandom(seed);
  const tiles = new Int8Array(MAP_W * MAP_H);

  // --- base terrain -------------------------------------------------------
  // Roads: horizontal band at ty % GAP < ROAD_W, vertical band at tx % GAP < ROAD_W.
  // Sidewalk = the one-tile ring around every road band.
  const gap = ROAD_GAP;
  const rw = ROAD_W;
  const onH = (ty) => (ty % gap) < rw;
  const onV = (tx) => (tx % gap) < rw;

  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = 0; tx < MAP_W; tx += 1) {
      let t = T_GRASS;
      const h = onH(ty);
      const v = onV(tx);
      if (h || v) t = T_ROAD;
      else if (onH(ty - 1) || onH(ty + 1) || onV(tx - 1) || onV(tx + 1)) t = T_SIDEWALK;
      tiles[ty * MAP_W + tx] = t;
    }
  }

  // Beach strip on the east edge (sand then water) and harbor docks at the south-east.
  const beachX = MAP_W - 8;
  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = beachX; tx < MAP_W; tx += 1) {
      const i = ty * MAP_W + tx;
      if (tiles[i] === T_ROAD || tiles[i] === T_SIDEWALK) continue; // roads run to the beach
      tiles[i] = tx >= MAP_W - 4 ? T_WATER : T_SAND;
    }
  }
  // Harbor: docks + water in the south-east corner.
  const harborY = MAP_H - 10;
  for (let ty = harborY; ty < MAP_H; ty += 1) {
    for (let tx = MAP_W - 26; tx < beachX; tx += 1) {
      const i = ty * MAP_W + tx;
      if (tiles[i] === T_ROAD || tiles[i] === T_SIDEWALK) continue;
      if (ty >= MAP_H - 6) tiles[i] = tx % 7 < 2 ? T_DOCK : T_WATER;
      else tiles[i] = T_DOCK;
    }
  }
  // Greenbelt park (grass + trees) inside its district, avoiding roads.
  const park = DISTRICTS.find((d) => d.name === 'Greenbelt Park');
  for (let ty = park.y + 1; ty < park.y + park.h - 1; ty += 1) {
    for (let tx = park.x + 1; tx < park.x + park.w - 1; tx += 1) {
      const i = ty * MAP_W + tx;
      if (tiles[i] === T_GRASS) tiles[i] = T_PARK;
    }
  }

  // --- buildings ----------------------------------------------------------
  // Each block is the region between two road bands; subdivide it into 1-4 buildings with
  // variety by district: downtown gets tall towers, Mercado/Neon Row get shops, others houses.
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

  const paletteFor = (district) => {
    if (district === 'Downtown') return { heights: [3, 6], size: [5, 8] };
    if (district === 'Palm Heights') return { heights: [2, 4], size: [4, 7] };
    if (district === 'Neon Row' || district === 'Little Mercado') return { heights: [1, 2], size: [3, 6] };
    if (district === 'Old Harbor') return { heights: [1, 3], size: [5, 8] };
    return { heights: [1, 2], size: [3, 5] };
  };

  for (let by = 0; by < MAP_H; by += gap) {
    for (let bx = 0; bx < MAP_W; bx += gap) {
      // Block interior: from bx+rw to bx+gap-1 (same for y), minus sidewalk ring handled below.
      const x0 = bx + rw + 1;
      const y0 = by + rw + 1;
      const x1 = bx + gap - 1;
      const y1 = by + gap - 1;
      if (x1 <= x0 || y1 <= y0) continue;

      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx * TILE, cy * TILE);
      const p = paletteFor(district);

      if (district === 'Greenbelt Park') continue; // park blocks stay green
      if (district === 'Sunset Beach') {
        // Beach blocks: a few palm trees, maybe a lifeguard hut.
        for (let k = 0; k < 3; k += 1) {
          trees.push({ x: rng.range(x0, x1 + 1) * TILE, y: rng.range(y0, y1 + 1) * TILE, palm: true });
        }
        continue;
      }
      if (district === 'Old Harbor' && rng.chance(0.25)) {
        lots.push({ x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
        continue; // container yards / lots at the harbor
      }

      // Subdivide: sometimes one big building, sometimes a split into two.
      const split = rng.chance(0.4);
      const make = (ax0, ay0, ax1, ay1) => {
        const inset = 1;
        const bx0 = ax0 + inset;
        const by0 = ay0 + inset;
        const bw = (ax1 - ax0) - inset * 2;
        const bh = (ay1 - ay0) - inset * 2;
        if (bw < 2 || bh < 2) return;
        const style = rng.int(0, 7);
        buildings.push({
          x: bx0 * TILE, y: by0 * TILE, w: bw * TILE, h: bh * TILE,
          color: PAL.buildings[style], roof: PAL.roofs[style],
          height: rng.int(p.heights[0], p.heights[1]),
          shop: district === 'Neon Row' || district === 'Little Mercado' || rng.chance(0.2),
          windows: rng.chance(0.85),
          district,
        });
      };
      if (split) {
        const vertical = rng.chance(0.5);
        if (vertical) {
          const mid = rng.int(x0 + 2, x1 - 2);
          make(x0, y0, mid, y1);
          make(mid + 1, y0, x1, y1);
        } else {
          const mid = rng.int(y0 + 2, y1 - 2);
          make(x0, y0, x1, mid);
          make(x0, mid + 1, x1, y1);
        }
      } else {
        make(x0, y0, x1, y1);
      }

      // Trees in leftover grass corners.
      if (rng.chance(0.35)) trees.push({ x: rng.range(x0, x1 + 1) * TILE, y: rng.range(y0, y1 + 1) * TILE, palm: false });
    }
  }

  // Park trees.
  for (let ty = park.y + 2; ty < park.y + park.h - 2; ty += 1) {
    for (let tx = park.x + 2; tx < park.x + park.w - 2; tx += 1) {
      if (tiles[ty * MAP_W + tx] === T_PARK && rng.chance(0.12)) {
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
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T_WATER;
      return tiles[ty * MAP_W + tx];
    },
    // Solid test for walking/driving: water is impassable, buildings block, docks/sand fine.
    solidAt(px, py) {
      const t = this.tileAt(px, py);
      return t === T_WATER;
    },
    pointInBuilding(px, py) {
      for (const b of buildings) {
        if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b;
      }
      return null;
    },
    // True when the point is on a road centre band and which lane axis to follow.
    isRoad(px, py) {
      return this.tileAt(px, py) === T_ROAD;
    },
    worldSize() { return { w: WORLD_W, h: WORLD_H }; },
  };
}

// Nearest lane centre: for traffic, snap to the middle of the road band it is on.
export function laneCenter(value) {
  const band = Math.floor(value / (ROAD_GAP * TILE)) * (ROAD_GAP * TILE);
  return band + (ROAD_W / 2) * TILE;
}
