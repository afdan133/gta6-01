// Missions: the story of Sunset City — eight missions from small errands to the finale.
//
// Each mission has a giver marker on the map, an intro quote, a sequence of objectives, and a
// cash reward (some unlock districts). Completing one unlocks the next; when all eight are done
// the game reaches its "complete" ending state.
//
// Objective types understood by updateMissions():
//   goto         walk/drive into pos within radius
//   gotoVehicle  be inside any car
//   stealCar     get into the mission's marked car
//   destroyCars  destroy `count` mission-tagged cars
//   survive      reach wanted 0
//   escort       drive the mission van to pos without it exploding
//   ramCar       damage the courier car below the stop threshold

const TILE_PX = 24; // matches config.TILE; kept local to avoid a config import in story data

// Story characters (all original).
const CAST = {
  fixer: 'Marisol Vega',    // the fixer who runs the player
  cousin: 'Tito',           // the player's cousin, small jobs
  dockboss: 'Chief Ibarra', // harbor boss
  rival: 'Denny Kross',     // the rival crew leader
};

const at = (tx, ty) => ({ tx, ty });

const MISSIONS = [
  {
    id: 'm1',
    name: 'First Light',
    giver: CAST.fixer,
    reward: 500,
    unlock: null,
    intro: `${CAST.fixer}: "Welcome to Sunset City, kid. Word is you drive fast and ask few questions. Grab a car and meet me at the plaza downtown. Don't keep me waiting."`,
    brief: 'Get any car and drive to the plaza marker in Downtown.',
    objectives: [
      { type: 'gotoVehicle', text: 'Steal any car (E to enter)', pos: null },
      { type: 'goto', text: 'Drive to the Downtown plaza', pos: at(46, 47), radius: 60 },
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
      { type: 'goto', text: 'Collect the package in Little Mercado', pos: at(19, 48), radius: 50 },
      { type: 'goto', text: "Deliver to Tito's garage in Neon Row", pos: at(23, 79), radius: 50 },
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
      { type: 'stealCar', text: 'Steal the silver coupe in Palm Heights', pos: at(47, 19), radius: 40 },
      { type: 'goto', text: 'Deliver the coupe to the Old Harbor dock', pos: at(78, 72), radius: 70 },
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
      { type: 'goto', text: 'Reach the harbor gate — beat the clock', pos: at(72, 88), radius: 60, timed: true },
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
    brief: "Escort the witness van from the courthouse to the harbor without letting it blow.",
    objectives: [
      { type: 'escort', text: 'Escort the witness van to the harbor', pos: at(78, 72), radius: 70 },
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
      { type: 'ramCar', text: 'Ram the courier car until it stops', pos: at(51, 77), radius: 40 },
      { type: 'goto', text: 'Meet Tito at Sunset Beach', pos: at(84, 30), radius: 60 },
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
      { type: 'goto', text: 'Leave the life behind — drive into the sunset', pos: at(88, 20), radius: 70 },
    ],
  },
];

// Giver spots (tile coords) — one per mission, chained so the story walks you across the city.
const GIVER_SPOTS = {
  m1: at(46, 47),
  m2: at(23, 79),
  m3: at(46, 47),
  m4: at(78, 72),
  m5: at(46, 47),
  m6: at(78, 72),
  m7: at(23, 79),
  m8: at(46, 47),
};

function giverSpot(m) {
  return GIVER_SPOTS[m.id] || at(46, 47);
}

/** Convert a {tx, ty} tile position to world pixels. */
function toWorld(pos) {
  return pos ? { x: (pos.tx + 0.5) * TILE_PX, y: (pos.ty + 0.5) * TILE_PX } : null;
}

export function createMissionState(player) {
  return {
    list: MISSIONS,
    index: 0,          // next mission to offer
    active: null,      // current mission object
    obj: 0,            // current objective index
    state: 'idle',     // idle | active
    timer: 0,          // countdown for timed objectives
    specialCar: null,  // the marked car for stealCar missions
    escortVan: null,
    targetCars: [],
    destroyed: 0,
    completed: [],
    unlockedDistricts: [],
    textTimer: 0,      // how long the story text stays on screen
    storyText: '',
    _player: player,
  };
}

export function currentMission(state) {
  return state.active;
}

/** Where the next mission's giver marker sits, or null when the story is finished. */
export function missionMarker(state) {
  if (state.index >= MISSIONS.length) return null;
  const spot = toWorld(giverSpot(MISSIONS[state.index]));
  return { ...spot, mission: MISSIONS[state.index] };
}

export function updateMissions(state, ctx, dt) {
  state.textTimer = Math.max(0, state.textTimer - dt);

  // Idle: wait for the player to walk/drive into the giver marker.
  if (state.state === 'idle') {
    const marker = missionMarker(state);
    if (marker && Math.hypot(ctx.player.x - marker.x, ctx.player.y - marker.y) < 34) {
      startMission(state, ctx);
    }
    return;
  }
  if (state.state !== 'active') return;

  const m = state.active;
  const o = m.objectives[state.obj];

  // Timed objectives fail when the clock runs out.
  if (o && o.timed) {
    state.timer -= dt;
    if (state.timer <= 0) {
      failMission(state, ctx, 'Out of time.');
      return;
    }
  }

  // Objective resolution.
  const pos = toWorld(o.pos);
  switch (o.type) {
    case 'goto':
      if (pos && Math.hypot(ctx.player.x - pos.x, ctx.player.y - pos.y) < o.radius) nextObjective(state, ctx);
      break;
    case 'gotoVehicle':
      if (ctx.player.inVehicle) nextObjective(state, ctx);
      break;
    case 'stealCar':
      if (state.specialCar && ctx.player.inVehicle === state.specialCar) {
        if (ctx.onCrime) ctx.onCrime(ctx.player.x, ctx.player.y, 'carjack');
        nextObjective(state, ctx);
      }
      break;
    case 'destroyCars':
      if (state.destroyed >= o.count) nextObjective(state, ctx);
      break;
    case 'survive':
      if (ctx.player.wanted === 0) nextObjective(state, ctx);
      break;
    case 'escort': {
      const van = state.escortVan;
      if (!van || van.exploded) { failMission(state, ctx, 'The witness van was destroyed.'); break; }
      if (ctx.player.inVehicle === van && pos && Math.hypot(van.x - pos.x, van.y - pos.y) < o.radius) {
        nextObjective(state, ctx);
      }
      break;
    }
    case 'ramCar': {
      const target = state.targetCars[0];
      if (!target || target.exploded || target.health <= 15) nextObjective(state, ctx);
      break;
    }
    default:
      nextObjective(state, ctx);
  }
}

/** The marker the HUD should point at right now (objective target or giver). */
export function activeMarker(state) {
  if (state.state === 'active' && state.active) {
    const o = state.active.objectives[state.obj];
    if (!o) return null;
    // Live markers track moving mission cars.
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

/** One-line objective text for the HUD strip. */
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

// ---- mission props -------------------------------------------------------------

/** Minimal parked-car shape for mission-spawned vehicles. */
function missionCar(x, y, angle, color, opts = {}) {
  return {
    x, y, angle,
    vx: 0, vy: 0, speed: 0,
    color,
    kind: 'parked',
    driver: null,
    health: opts.health ?? 100,
    stopTimer: 0,
    laneAxis: null,
    dir: 1,
    hornTimer: 0,
    length: opts.length ?? 36,
    width: opts.width ?? 16,
    ...opts.tags,
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

  // Spawn the props this mission needs.
  if (m.specialCar) {
    const p = toWorld(m.objectives.find((o) => o.type === 'stealCar').pos);
    state.specialCar = missionCar(p.x, p.y, Math.PI / 2, '#dcdcdc'); // the silver coupe
    ctx.traffic.cars.push(state.specialCar);
  }
  if (m.objectives.some((o) => o.type === 'escort')) {
    const first = m.objectives[0];
    const p = toWorld(first.pos || at(50, 50));
    state.escortVan = missionCar(p.x, p.y, 0, '#e8e4da', { health: 160, length: 44, width: 20 });
    ctx.traffic.cars.push(state.escortVan);
  }
  if (m.objectives.some((o) => o.type === 'destroyCars')) {
    const n = m.objectives.find((o) => o.type === 'destroyCars').count;
    for (let i = 0; i < n; i += 1) {
      const car = missionCar((44 + i * 2.2) * TILE_PX, (46 + (i % 2) * 2) * TILE_PX, Math.PI / 2, '#23232a', { health: 90, tags: { crew: true } });
      state.targetCars.push(car);
      ctx.traffic.cars.push(car);
    }
  }
  if (m.objectives.some((o) => o.type === 'ramCar')) {
    const p = toWorld(m.objectives.find((o) => o.type === 'ramCar').pos);
    const car = missionCar(p.x, p.y, 0, '#c9a24a', { health: 60, tags: { courier: true } });
    state.targetCars.push(car);
    ctx.traffic.cars.push(car);
  }
  if (ctx.audio) ctx.audio.jingle();
}

function nextObjective(state, ctx) {
  state.obj += 1;
  if (state.obj >= state.active.objectives.length) {
    completeMission(state, ctx);
  }
}

export function completeMission(state, ctx) {
  const m = state.active;
  state.completed.push(m.id);
  state.index += 1;
  state.state = 'idle';
  state.active = null;
  state.storyText = `MISSION COMPLETE — ${m.name}\n$${m.reward} earned. ${state.index < MISSIONS.length ? `Next: ${MISSIONS[state.index].name} — find the new marker.` : 'The city is yours. Thanks for playing.'}`;
  state.textTimer = 7;
  if (m.unlock && !state.unlockedDistricts.includes(m.unlock)) state.unlockedDistricts.push(m.unlock);
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

/** Called by combat when a mission-tagged car dies. */
export function onMissionCarDestroyed(state, car) {
  if (state.state !== 'active') return;
  if (state.targetCars.includes(car)) state.destroyed += 1;
  if (state.specialCar === car) state.specialCar = null; // stole it and wrecked it: steal fails softly
}

export { MISSIONS, CAST };
