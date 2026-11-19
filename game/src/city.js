// City generation.
//
// The map is a flat Int8Array of terrain ids over a 96x96 tile grid: a road band every
// ROAD_GAP tiles with a one-tile sidewalk ring, blocks of buildings in between, districts by
// name, a park, a beach on the east edge and a harbor in the south-east. Buildings, trees and
// parking lots are separate lists that both the renderer and collision read, so nothing has to
// re-derive geometry at runtime.

import {
  DISTRICTS, MAP_H, MAP_W, PAL, ROAD_GAP, ROAD_W, TILE, WORLD_H, WORLD_W,
} from './config.js';
import { createRandom } from './random.js';

// Terrain ids (also used as indices into the renderer's colour table).
export const T_GRASS = 0;
export const T_ROAD = 1;
export const T_SIDEWALK = 2;
export const T_PARK = 3;
export const T_SAND = 4;
export const T_WATER = 5;
export const T_DOCK = 6;
export const T_LOT = 7; // paved parking lot

const ROAD_BAND = ROAD_GAP * TILE; // band width in px

export function createCity(seed) {
  const rng = createRandom(seed);
  const tiles = new Int8Array(MAP_W * MAP_H);

  // --- base terrain -------------------------------------------------------
  // A tile is road when its row or column falls inside the road band; the one-tile ring
  // around every band becomes sidewalk, everything else starts as grass.
  const inHorizBand = (ty) => (ty % ROAD_GAP) < ROAD_W;
  const inVertBand = (tx) => (tx % ROAD_GAP) < ROAD_W;

  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = 0; tx < MAP_W; tx += 1) {
      let t = T_GRASS;
      if (inHorizBand(ty) || inVertBand(tx)) {
        t = T_ROAD;
      } else if (inHorizBand(ty - 1) || inHorizBand(ty + 1) || inVertBand(tx - 1) || inVertBand(tx + 1)) {
        t = T_SIDEWALK;
      }
      tiles[ty * MAP_W + tx] = t;
    }
  }

  // Beach strip on the east edge (sand, then water) — roads still run onto the sand.
  const beachX = MAP_W - 8;
  for (let ty = 0; ty < MAP_H; ty += 1) {
    for (let tx = beachX; tx < MAP_W; tx += 1) {
      const i = ty * MAP_W + tx;
      if (tiles[i] === T_ROAD || tiles[i] === T_SIDEWALK) continue;
      tiles[i] = tx >= MAP_W - 4 ? T_WATER : T_SAND;
    }
  }

  // Harbor: docks and water in the south-east corner, with slipways cut into the water line.
  const harborY = MAP_H - 10;
  for (let ty = harborY; ty < MAP_H; ty += 1) {
    for (let tx = MAP_W - 26; tx < beachX; tx += 1) {
      const i = ty * MAP_W + tx;
      if (tiles[i] === T_ROAD || tiles[i] === T_SIDEWALK) continue;
      if (ty >= MAP_H - 6) tiles[i] = tx % 7 < 2 ? T_DOCK : T_WATER;
      else tiles[i] = T_DOCK;
    }
  }

  // Greenbelt Park: grass becomes park lawn inside its district, minus the road ring.
  const park = DISTRICTS.find((d) => d.name === 'Greenbelt Park');
  for (let ty = park.y + 1; ty < park.y + park.h - 1; ty += 1) {
    for (let tx = park.x + 1; tx < park.x + park.w - 1; tx += 1) {
      const i = ty * MAP_W + tx;
      if (tiles[i] === T_GRASS) tiles[i] = T_PARK;
    }
  }

  // --- buildings, trees, lots --------------------------------------------
  // Every block is the region between two road bands. Blocks are subdivided into one or two
  // buildings, with per-district character: downtown towers, Mercado/Neon Row low shops,
  // Sunset Beach palms, Old Harbor container yards.
  const buildings = [];
  const trees = [];
  const lots = [];

  const districtNameAt = (px, py) => {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    for (const d of DISTRICTS) {
      if (tx >= d.x && tx < d.x + d.w && ty >= d.y && ty < d.y + d.h) return d.name;
    }
    return 'Sunset Flats';
  };

  // Building height range (in storeys) and footprint range (in tiles) per district.
  const styleFor = (district) => {
    if (district === 'Downtown') return { heights: [3, 6], size: [5, 8] };
    if (district === 'Palm Heights') return { heights: [2, 4], size: [4, 7] };
    if (district === 'Neon Row' || district === 'Little Mercado') return { heights: [1, 2], size: [3, 6] };
    if (district === 'Old Harbor') return { heights: [1, 3], size: [5, 8] };
    return { heights: [1, 2], size: [3, 5] };
  };

  for (let by = 0; by < MAP_H; by += ROAD_GAP) {
    for (let bx = 0; bx < MAP_W; bx += ROAD_GAP) {
      // Block interior in tiles: inside the sidewalk ring, up to the next band.
      const x0 = bx + ROAD_W + 1;
      const y0 = by + ROAD_W + 1;
      const x1 = bx + ROAD_GAP - 1;
      const y1 = by + ROAD_GAP - 1;
      if (x1 <= x0 || y1 <= y0) continue;

      const district = districtNameAt(((x0 + x1) / 2) * TILE, ((y0 + y1) / 2) * TILE);
      const style = styleFor(district);

      if (district === 'Greenbelt Park') continue; // park blocks stay green

      if (district === 'Sunset Beach') {
        // Beach blocks: scatter palms; no buildings on the sand.
        for (let k = 0; k < 3; k += 1) {
          trees.push({ x: rng.range(x0, x1 + 1) * TILE, y: rng.range(y0, y1 + 1) * TILE, palm: true });
        }
        continue;
      }
      if (district === 'Old Harbor' && rng.chance(0.25)) {
        // Container yards / open lots instead of buildings.
        lots.push({ x: x0 * TILE, y: y0 * TILE, w: (x1 - x0) * TILE, h: (y1 - y0) * TILE });
        continue;
      }

      const addBuilding = (ax0, ay0, ax1, ay1) => {
        const inset = 1; // leave a walkable gap between neighbouring buildings
        const bw = (ax1 - ax0) - inset;
        const bh = (ay1 - ay0) - inset;
        if (bw < 2 || bh < 2) return;
        const palette = rng.int(0, 7);
        buildings.push({
          x: (ax0 + inset) * TILE,
          y: (ay0 + inset) * TILE,
          w: bw * TILE,
          h: bh * TILE,
          color: PAL.buildings[palette],
          roof: PAL.roofs[palette],
          height: rng.int(style.heights[0], style.heights[1]),
          shop: district === 'Neon Row' || district === 'Little Mercado' || rng.chance(0.2),
          windows: rng.chance(0.85),
          district,
        });
      };

      // Sometimes one big building, sometimes two sharing the block.
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

      // An occasional street tree in the block's leftover grass.
      if (rng.chance(0.35)) {
        trees.push({ x: rng.range(x0, x1 + 1) * TILE, y: rng.range(y0, y1 + 1) * TILE, palm: false });
      }
    }
  }

  // Park trees: sparse, so the lawn still reads as open space.
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
      return districtNameAt(px, py);
    },

    tileAt(px, py) {
      const tx = Math.floor(px / TILE);
      const ty = Math.floor(py / TILE);
      if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return T_WATER; // void counts as water
      return tiles[ty * MAP_W + tx];
    },

    /** Impassable terrain: only water. Buildings are checked separately by entities. */
    solidAt(px, py) {
      return this.tileAt(px, py) === T_WATER;
    },

    pointInBuilding(px, py) {
      for (const b of buildings) {
        if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h) return b;
      }
      return null;
    },

    isRoad(px, py) {
      return this.tileAt(px, py) === T_ROAD;
    },

    worldSize() { return { w: WORLD_W, h: WORLD_H }; },
  };
}

/** Snap a coordinate to the centre of the road band it sits in (lane keeping for traffic). */
export function laneCenter(value) {
  const band = Math.floor(value / ROAD_BAND) * ROAD_BAND;
  return band + (ROAD_W / 2) * TILE;
}
