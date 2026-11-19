// SUNSET CITY — global constants and the palette that gives the game its sunset identity.

export const TILE = 24;              // pixels per tile
export const MAP_W = 96;             // city width in tiles
export const MAP_H = 96;             // city height in tiles
export const WORLD_W = MAP_W * TILE; // world width in px
export const WORLD_H = MAP_H * TILE;

// Road grid: a road every ROAD_GAP tiles, ROAD_W tiles wide (2 lanes).
export const ROAD_GAP = 12;
export const ROAD_W = 3;

// Player on foot.
export const PLAYER = {
  walkSpeed: 150,       // px/s
  runSpeed: 220,
  radius: 7,
  maxHealth: 100,
  maxArmor: 100,
};

// Vehicle physics (px/s, px/s^2).
export const VEHICLE = {
  accel: 320,
  brake: 520,
  reverseAccel: 180,
  maxSpeed: 330,
  maxReverse: 110,
  turnRate: 2.6,        // rad/s at full lock
  driftGrip: 6.0,       // lateral velocity damping (higher = grippier)
  handbrakeGrip: 1.2,   // grip while handbraking (drift)
  length: 34,
  width: 16,
  trafficSpeed: 110,    // traffic cruise speed px/s
  stopTime: 2.5,        // seconds traffic stops at an intersection
};

export const PED = {
  speed: 34,
  fleeSpeed: 95,
  radius: 5,
  count: 90,
};

export const TRAFFIC_CARS = 26;

// Camera zoom (world px -> screen px scale).
export const CAMERA_ZOOM = 1.6;

// Time of day: full cycle in seconds; 0.55-0.8 = sunset (identity), else day/night.
export const DAY_LENGTH = 300;
export const START_DAY_T = 0.62; // begin at golden hour

// Palette — flat, warm, high-contrast sunset look.
export const PAL = {
  grass: '#5e7d43',
  grassDark: '#526e39',
  park: '#6d8a4a',
  road: '#3a3d45',
  roadLine: '#c9b458',
  sidewalk: '#8f8b83',
  sand: '#d8b978',
  water: '#2f5f8a',
  dock: '#7a6a52',
  buildings: ['#b8656a', '#a85f8a', '#7f6fb0', '#5f8bb0', '#c78d5a', '#9aa0a8', '#8a9a7f', '#c7b25a'],
  roofs: ['#8a4a52', '#7c4766', '#5b4f80', '#456880', '#996a40', '#72767c', '#66755c', '#998a40'],
  player: '#f2e6c9',
  playerSkin: '#c98d5a',
  carColors: ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'],
  pedShirts: ['#d98880', '#7fb3d5', '#82e0aa', '#f7dc6f', '#bb8fce', '#f0b27a'],
  pedPants: ['#34495e', '#5d6d7e', '#6e2c00', '#4a235a'],
  hudBg: 'rgba(15, 12, 20, 0.78)',
  hudText: '#f5e9d0',
  hudAccent: '#ffb454',
  danger: '#e04f4f',
};

// Districts: name + tile rect (x, y, w, h) in tiles; shown as a banner when entered.
export const DISTRICTS = [
  { name: 'Downtown',     x: 34, y: 34, w: 30, h: 26 },
  { name: 'Old Harbor',   x: 64, y: 62, w: 32, h: 22 },
  { name: 'Sunset Beach', x: 74, y: 10, w: 22, h: 40 },
  { name: 'Palm Heights', x: 30, y: 6,  w: 34, h: 26 },
  { name: 'Little Mercado', x: 6, y: 34, w: 26, h: 28 },
  { name: 'Neon Row',     x: 6,  y: 64, w: 34, h: 30 },
  { name: 'Greenbelt Park', x: 40, y: 62, w: 22, h: 30 },
];

/** The simulation's fixed step, in seconds. */
export const STEP = 1 / 60;
