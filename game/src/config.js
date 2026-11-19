// Sunset City — central tuning file.
// All constants the simulation and renderer share live here so gameplay modules never
// hard-code magic numbers. Units: pixels, seconds, radians unless noted.

// ---- world ------------------------------------------------------------------
export const TILE = 24;                 // one city tile, in pixels
export const GRID_W = 96;               // tiles across
export const GRID_H = 96;               // tiles down
export const WORLD_W = TILE * GRID_W;
export const WORLD_H = TILE * GRID_H;

// Road bands: every GAP tiles there is a WIDE-tile road strip, two lanes plus curbs.
export const ROAD_GAP = 12;
export const ROAD_WIDE = 3;
export const LANE_OFFSET = 6;           // px from road centre to lane centre

export const TILE_ID = {
  ASPHALT: 0,
  SIDEWALK: 1,
  LOT: 2,
  WALL: 3,
  LAWN: 4,
  SAND: 5,
  WATER: 6,
};

// ---- palette ----------------------------------------------------------------
// A permanent golden hour: warm light, long shadows, teal shadows on asphalt.
export const PAL = {
  asphalt: '#3c3b42',
  asphaltWarm: '#46403f',
  line: '#d8b557',
  sidewalk: '#8b857b',
  sidewalkAlt: '#948d82',
  lawn: '#5d7c3f',
  lawnDark: '#516d37',
  lot: '#6b6157',
  sand: '#d9bb7c',
  water: '#2c5c86',
  wall: ['#b8656a', '#a85f8a', '#7f6fb0', '#5f8bb0', '#c78d5a', '#9aa0a8', '#8a9a7f', '#c7b25a'],
  roof: ['#8a4a52', '#7c4766', '#5b4f80', '#456880', '#996a40', '#72767c', '#66755c', '#998a40'],
  glow: 'rgba(255, 205, 120, 0.5)',
  shade: 'rgba(24, 20, 34, 0.22)',
  blood: 'rgba(148, 20, 20, 0.8)',
  smoke: 'rgba(70, 62, 58, 0.45)',
  fireA: '#ffe08a',
  fireB: '#ff9838',
  fireC: '#ef5a2a',
  tracer: '#ffedbe',
  player: '#f4e8ca',
  playerSkin: '#c98d5a',
  playerShirt: '#c4502e',
  cop: '#6f93d6',
  copCar: '#1d2937',
  carColors: ['#c0392b', '#2980b9', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085'],
  pedShirts: ['#d98880', '#7fb3d5', '#82e0aa', '#f7dc6f', '#bb8fce', '#f0b27a'],
  pedPants: ['#34495e', '#5d6d7e', '#6e2c00', '#4a235a'],
  hudBg: 'rgba(16, 13, 22, 0.8)',
  hudText: '#f6ecd2',
  hudAccent: '#ffb454',
  hudGood: '#8fdc7a',
  hudBad: '#e05252',
  star: '#ffcc4d',
};

// ---- districts (tile rects; entering one pops a banner) ----------------------
export const DISTRICTS = [
  { name: 'Downtown', x: 34, y: 34, w: 30, h: 26 },
  { name: 'Old Harbor', x: 64, y: 62, w: 32, h: 22 },
  { name: 'Sunset Beach', x: 74, y: 10, w: 22, h: 40 },
  { name: 'Palm Heights', x: 30, y: 6, w: 34, h: 26 },
  { name: 'Little Mercado', x: 6, y: 34, w: 26, h: 28 },
  { name: 'Neon Row', x: 6, y: 64, w: 34, h: 30 },
  { name: 'Greenbelt Park', x: 40, y: 62, w: 22, h: 30 },
];

// ---- actors -----------------------------------------------------------------
export const PLAYER = {
  walk: 150,
  run: 220,
  radius: 7,
  maxHealth: 100,
  maxArmor: 100,
};

export const VEHICLE = {
  accel: 320,
  brake: 540,
  reverseAccel: 180,
  maxSpeed: 330,
  maxReverse: 115,
  turnRate: 2.6,
  grip: 6.0,
  handbrakeGrip: 1.2,
  length: 34,
  width: 16,
  trafficSpeed: 112,
  junctionPause: 2.2,
  bumpRestitution: 0.35,
};

export const PED = {
  speed: 34,
  fleeSpeed: 98,
  radius: 5,
  count: 90,
};

export const TRAFFIC_CARS = 26;

// ---- combat -----------------------------------------------------------------
export const WEAPONS = {
  fists: { label: 'Fists', dmg: 12, rate: 0.38, range: 36, spread: 0, speed: 0, slot: 1 },
  pistol: { label: 'Pistol', dmg: 30, rate: 0.28, range: 620, spread: 0.04, speed: 960, slot: 2 },
  uzi: { label: 'Uzi', dmg: 16, rate: 0.085, range: 520, spread: 0.13, speed: 900, slot: 3 },
};
export const CAR_HP = 190;
export const EXPLOSION = { radius: 96, dmg: 85, particles: 34 };

// ---- wanted system -----------------------------------------------------------
export const WANTED = {
  heatToStars: [0, 6, 18, 36, 58, 84],   // heat >= N means that many stars
  coolDelay: 6,
  coolRate: 3.4,
  carsAtStars: 1,
  footCopsAtStars: 2,
  maxCars: 7,
  maxFoot: 12,
};

// ---- camera & time -----------------------------------------------------------
export const CAM_ZOOM = 1.6;
export const DAY_LENGTH = 300;
export const START_DAY_T = 0.62;        // golden hour

// ---- persistence --------------------------------------------------------------
export const SAVE_KEY = 'sunset-city-v1';

// Mission giver stands on this tile; smoke test uses the same coordinates.
export const GIVER_TILE = { x: 46, y: 47 };

export const STEP = 1 / 60;             // fixed simulation step

// ---- small math ---------------------------------------------------------------
export const TAU = Math.PI * 2;

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(a, b, k, dt) {
  return lerp(a, b, 1 - Math.exp(-k * dt));
}

export function wrapAngle(a) {
  a %= TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

export function turnToward(cur, target, maxStep) {
  const d = wrapAngle(target - cur);
  return cur + clamp(d, -maxStep, maxStep);
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function distance2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function fmtMoney(n) {
  return '$' + Math.max(0, Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
