// The story mode: eight missions, one giver marker each, escalating from errands to the finale.
//
// Missions are pure data (see MISSIONS below); a tiny interpreter in updateMissions() walks
// their objective lists. Objective kinds:
//   goto        — reach a world position
//   gotoVehicle — be behind the wheel
//   stealCar    — get into the mission's marked car
//   destroyCars — blow up N tagged cars
//   survive     — let the wanted level cool back to zero
//   escort      — drive the mission van to a point without wrecking it
//   ramCar      — batter a courier car until it stops running

import { GIVER_TILE, TILE } from './config.js';

const tile = (tx, ty) => ({ tx, ty });
const toWorld = (pos) => (pos ? { x: (pos.tx + 0.5) * TILE, y: (pos.ty + 0.5) * TILE } : null);

// The recurring cast — all original characters.
export const CAST = {
  fixer: 'Marisol Vega',
  cousin: 'Tito',
  dockboss: 'Chief Ibarra',
  rival: 'Denny Kross',
};

export const MISSIONS = [
  {
    id: 'm1',
    name: 'First Light',
    giver: CAST.fixer,
    reward: 500,
    unlock: null,
    intro: `${CAST.fixer}: "Welcome to Sunset City, kid. Word is you drive fast and ask few questions. Grab a car and meet me at the plaza downtown. Don't keep me waiting."`,
    brief: 'Get any car and drive to the plaza marker in Downtown.',
    objectives: [
      { type: 'gotoVehicle', text: 'Steal any car (press E)', pos: null },
      { type: 'goto', text: 'Drive to the Downtown plaza', pos: tile(46, 47), radius: 60 },
    ],
  },
  {
    id: 'm2',
    name: 'Corner Store Run',
    giver: CAST.cousin,
    reward: 700,
    unlock: null,
    intro: `${CAST.cousin}: "Cousin! I owe the Mercado guys money and my knees hurt. Pick up the package in Little Mercado and bring it to my garage in Neon Row. No detours, no cops."`,
    brief: 'Pick up the package in Little Mercado, deliver it to Neon Row.',
    objectives: [
      { type: 'goto', text: 'Collect the package in Little Mercado', pos: tile(19, 48), radius: 50 },
      { type: 'goto', text: "Deliver to Tito's garage in Neon Row", pos: tile(23, 79), radius: 50 },
    ],
  },
  {
    id: 'm3',
    name: 'The Silver Coupe',
    giver: CAST.fixer,
    reward: 900,
    unlock: 'Palm Heights',
    intro: `${CAST.fixer}: "A collector wants one specific car — the silver coupe parked up in Palm Heights. It will be hot the second you touch it, so drive it like you mean it."`,
    brief: 'Steal the silver coupe in Palm Heights and deliver it to the Old Harbor dock.',
    specialCar: true,
    objectives: [
      { type: 'stealCar', text: 'Steal the silver coupe in Palm Heights', pos: tile(47, 19), radius: 40 },
      { type: 'goto', text: 'Deliver the coupe to the Old Harbor dock', pos: tile(78, 72), radius: 70 },
    ],
  },
  {
    id: 'm4',
    name: 'Harbor Shift',
    giver: CAST.dockboss,
    reward: 1100,
    unlock: null,
    intro: `${CAST.dockboss}: "Containers are moving tonight and my forklift guy quit. Be at the harbor in two minutes or the job goes to someone slower than you."`,
    brief: 'Timed delivery: reach the harbor gate before the clock runs out.',
    timeLimit: 95,
    objectives: [
      { type: 'goto', text: 'Reach the harbor gate — beat the clock', pos: tile(72, 88), radius: 60, timed: true },
    ],
  },
  {
    id: 'm5',
    name: 'Bad Noise',
    giver: CAST.fixer,
    reward: 1400,
    unlock: 'Sunset Beach',
    intro: `${CAST.fixer}: "Kross's crew is shaking down shops on Neon Row. Go make some bad noise of your own — loosen a few of their cars and scare their people. Police will come. That's part of the job."`,
    brief: 'Cause chaos on Neon Row: destroy 3 cars and survive the heat.',
    objectives: [
      { type: 'destroyCars', text: 'Destroy 3 crew cars on Neon Row', count: 3 },
      { type: 'survive', text: 'Lose the cops (hide until stars fade)' },
    ],
  },
  {
    id: 'm6',
    name: 'The Escort',
    giver: CAST.dockboss,
    reward: 1600,
    unlock: null,
    intro: `${CAST.dockboss}: "A witness is talking to us from the courthouse. Drive her van. Keep it in one piece. Kross's people would love a headline."`,
    brief: 'Escort the witness van from the courthouse to the harbor without letting it blow.',
    objectives: [
      { type: 'escort', text: 'Escort the witness van to the harbor', pos: tile(78, 72), radius: 70 },
    ],
  },
  {
    id: 'm7',
    name: 'Kross Tax',
    giver: CAST.cousin,
    reward: 2000,
    unlock: 'Greenbelt Park',
    intro: `${CAST.cousin}: "Kross took our cut AND my stereo. His crew runs deliveries through the park at dusk. Hit their run, keep the take. I'll be at the beach thinking about my stereo."`,
    brief: 'Raid the courier run: ram and stop the courier car, then meet Tito at the beach.',
    objectives: [
      { type: 'ramCar', text: 'Ram the courier car until it stops', pos: tile(51, 77), radius: 40 },
      { type: 'goto', text: 'Meet Tito at Sunset Beach', pos: tile(84, 30), radius: 60 },
    ],
  },
  {
    id: 'm8',
    name: 'Last One Standing',
    giver: CAST.fixer,
    reward: 5000,
    unlock: null,
    intro: `${CAST.fixer}: "It ends tonight. Kross is holed up downtown with every car he has left. Take the streets, take the heat, and take him down. After this, kid, you're free."`,
    brief: "Finale: destroy Denny Kross's convoy (3 cars) downtown and survive the wanted level.",
    objectives: [
      { type: 'destroyCars', text: "Destroy Kross's convoy (3 cars)", count: 3 },
      { type: 'survive', text: 'Shake the police for good' },
      { type: 'goto', text: 'Leave the life behind — drive into the sunset', pos: tile(88, 20), radius: 70 },
    ],
  },
];

// Where each story beat is handed out; the chain walks the player across the city.
const GIVER_SPOTS = {
  m1: GIVER_TILE,
  m2: tile(23, 79),
  m3: GIVER_TILE,
  m4: tile(78, 72),
  m5: GIVER_TILE,
  m6: tile(78, 72),
  m7: tile(23, 79),
  m8: GIVER_TILE,
};

function giverSpot(m) {
  return GIVER_SPOTS[m.id] || GIVER_TILE;
}

// ---- state ------------------------------------------------------------------

export function createMissionState(player) {
  return {
    list: MISSIONS,
    index: 0,
    active: null,
    obj: 0,
    state: 'idle',
    timer: 0,
    specialCar: null,
    escortVan: null,
    targetCars: [],
    destroyed: 0,
    completed: [],
    unlockedDistricts: [],
    textTimer: 0,
    storyText: '',
    player,
  };
}

export function currentMission(state) {
  return state.active;
}

/** World position of the next giver marker, or null once the story is finished. */
export function missionMarker(state) {
  if (state.index >= MISSIONS.length) return null;
  const m = MISSIONS[state.index];
  return { ...toWorld(giverSpot(m)), mission: m };
}

export function updateMissions(state, ctx, dt) {
  state.textTimer = Math.max(0, state.textTimer - dt);

  if (state.state === 'idle') {
    const marker = missionMarker(state);
    if (marker && Math.hypot(ctx.player.x - marker.x, ctx.player.y - marker.y) < 34) {
      startMission(state, ctx);
    }
    return;
  }
  if (state.state !== 'active' || !state.active) return;

  const o = state.active.objectives[state.obj];
  if (!o) return;

  if (o.timed) {
    state.timer -= dt;
    if (state.timer <= 0) {
      failMission(state, ctx, 'Out of time.');
      return;
    }
  }

  const pos = toWorld(o.pos);
  switch (o.type) {
    case 'goto':
      if (pos && Math.hypot(ctx.player.x - pos.x, ctx.player.y - pos.y) < o.radius) {
        advance(state, ctx);
      }
      break;
    case 'gotoVehicle':
      if (ctx.player.inVehicle) advance(state, ctx);
      break;
    case 'stealCar':
      if (state.specialCar && ctx.player.inVehicle === state.specialCar) {
        if (ctx.onCrime) ctx.onCrime(ctx.player.x, ctx.player.y, 'carjack');
        advance(state, ctx);
      }
      break;
    case 'destroyCars':
      if (state.destroyed >= o.count) advance(state, ctx);
      break;
    case 'survive':
      if (ctx.player.wanted === 0) advance(state, ctx);
      break;
    case 'escort': {
      const van = state.escortVan;
      if (!van || van.exploded) {
        failMission(state, ctx, 'The witness van was destroyed.');
        break;
      }
      if (ctx.player.inVehicle === van && pos && Math.hypot(van.x - pos.x, van.y - pos.y) < o.radius) {
        advance(state, ctx);
      }
      break;
    }
    case 'ramCar': {
      const target = state.targetCars[0];
      if (!target || target.exploded || target.health <= 15) advance(state, ctx);
      break;
    }
    default:
      advance(state, ctx);
  }
}

/** The one marker the HUD blip should track right now. */
export function activeMarker(state) {
  if (state.state === 'active' && state.active) {
    const o = state.active.objectives[state.obj];
    if (!o) return null;
    if (o.type === 'stealCar' && state.specialCar && !state.specialCar.exploded) {
      return { x: state.specialCar.x, y: state.specialCar.y };
    }
    if (o.type === 'ramCar' && state.targetCars[0] && !state.targetCars[0].exploded) {
      return { x: state.targetCars[0].x, y: state.targetCars[0].y };
    }
    if (o.type === 'escort' && state.escortVan && !state.escortVan.exploded) {
      return { x: state.escortVan.x, y: state.escortVan.y };
    }
    return toWorld(o.pos);
  }
  if (state.state === 'idle') return missionMarker(state);
  return null;
}

/** Single line of objective text for the HUD. */
export function objectiveText(state) {
  if (state.state === 'active' && state.active) {
    const o = state.active.objectives[state.obj];
    if (!o) return state.active.brief;
    let t = o.text;
    if (o.timed) t += ` — ${Math.ceil(state.timer)}s`;
    if (o.type === 'destroyCars') t += ` (${state.destroyed}/${o.count})`;
    return t;
  }
  if (state.state === 'idle' && state.index < MISSIONS.length) {
    return `Visit the marker to start: ${MISSIONS[state.index].name}`;
  }
  return '';
}

// ---- mission props -----------------------------------------------------------

/** A bare parked-car object with the fields traffic/collision expect. */
function propCar(x, y, angle, color, opts = {}) {
  return {
    x, y, angle,
    vx: 0, vy: 0, speed: 0, lat: 0,
    color,
    role: 'parked',
    driver: null,
    health: opts.health ?? 100,
    junctionTimer: 0,
    laneAxis: null,
    laneDir: 1,
    siren: 0,
    exploded: false,
    ...opts,
  };
}

function startMission(state, ctx) {
  const m = MISSIONS[state.index];
  state.active = m;
  state.obj = 0;
  state.state = 'active';
  state.destroyed = 0;
  state.specialCar = null;
  state.escortVan = null;
  state.targetCars = [];
  state.storyText = m.intro;
  state.textTimer = 6.5;
  if (m.timeLimit) state.timer = m.timeLimit;

  const find = (type) => m.objectives.find((o) => o.type === type);

  if (m.specialCar) {
    const p = toWorld(find('stealCar').pos);
    state.specialCar = propCar(p.x, p.y, Math.PI / 2, '#dcdcdc'); // the silver coupe
    ctx.traffic.cars.push(state.specialCar);
  }
  if (find('escort')) {
    const p = toWorld(m.objectives[0].pos || tile(50, 50));
    state.escortVan = propCar(p.x, p.y, 0, '#e8e4da', { health: 160 });
    ctx.traffic.cars.push(state.escortVan);
  }
  const destroy = find('destroyCars');
  if (destroy) {
    for (let i = 0; i < destroy.count; i += 1) {
      const car = propCar(
        (44 + i * 2.2) * TILE,
        (46 + (i % 2) * 2) * TILE,
        Math.PI / 2,
        '#23232a',
        { health: 90, crew: true },
      );
      state.targetCars.push(car);
      ctx.traffic.cars.push(car);
    }
  }
  const ram = find('ramCar');
  if (ram) {
    const p = toWorld(ram.pos);
    const car = propCar(p.x, p.y, 0, '#c9a24a', { health: 60, courier: true });
    state.targetCars.push(car);
    ctx.traffic.cars.push(car);
  }
  if (ctx.audio) ctx.audio.jingle();
}

function advance(state, ctx) {
  state.obj += 1;
  if (state.obj >= state.active.objectives.length) completeMission(state, ctx);
}

export function completeMission(state, ctx) {
  const m = state.active;
  state.completed.push(m.id);
  state.index += 1;
  state.state = 'idle';
  state.active = null;
  const next = state.index < MISSIONS.length
    ? `Next: ${MISSIONS[state.index].name} — find the new marker.`
    : 'The city is yours. Thanks for playing.';
  state.storyText = `MISSION COMPLETE — ${m.name}\n$${m.reward} earned. ${next}`;
  state.textTimer = 7;
  if (m.unlock && !state.unlockedDistricts.includes(m.unlock)) {
    state.unlockedDistricts.push(m.unlock);
  }
  ctx.player.cash += m.reward;
  if (ctx.audio) ctx.audio.jingle();
  if (ctx.onMissionEvent) ctx.onMissionEvent();
}

export function failMission(state, ctx, reason) {
  const m = state.active;
  state.state = 'idle';
  state.active = null;
  state.storyText = `MISSION FAILED — ${m.name}\n${reason || 'Try again from the marker.'}`;
  state.textTimer = 6;
  if (ctx.audio) ctx.audio.fail();
}

/** Combat calls this whenever a car dies; mission-tagged cars feed their counters. */
export function onMissionCarDestroyed(state, car) {
  if (state.state !== 'active') return;
  if (state.targetCars.includes(car)) state.destroyed += 1;
  if (state.specialCar === car) state.specialCar = null;
}
