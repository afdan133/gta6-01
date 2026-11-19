// Missions: the story of Sunset City — eight missions from small errands to the finale.
// Each mission has a giver marker, an intro text, a sequence of objectives, and a cash reward.
// Completing a mission unlocks the next and (for some) a new district to explore.

const TAU = Math.PI * 2;

// Story characters (all original).
const CAST = {
  fixer: 'Marisol Vega',     // the fixer who runs the player
  cousin: 'Tito',            // the player's cousin, small jobs
  dockboss: 'Chief Ibarra',  // harbor boss
  rival: 'Denny Kross',      // the rival crew leader
};

function dist(tx, ty) {
  return { tx, ty };
}

const MISSIONS = [
  {
    id: 'm1',
    name: 'First Light',
    giver: 'Marisol Vega',
    reward: 500,
    unlock: null,
    intro: `${CAST.fixer}: "Welcome to Sunset City, kid. Word is you drive fast and ask few questions. Grab a car and meet me at the plaza downtown. Don't keep me waiting."`,
    brief: 'Get any car and drive to the plaza marker in Downtown.',
    objectives: [
      { type: 'gotoVehicle', text: 'Steal any car (E to enter)', pos: null },
      { type: 'goto', text: 'Drive to the Downtown plaza', pos: dist(46, 47), radius: 60 },
    ],
  },
  {
    id: 'm2',
    name: 'Corner Store Run',
    giver: 'Tito',
    reward: 700,
    unlock: null,
    intro: `${CAST.cousin}: "Cousin! I owe the Mercado guys money and my knees hurt. Pick up the package in Little Mercado and bring it to my garage in Neon Row. No detours, no cops."`,
    brief: 'Pick up the package in Little Mercado, deliver it to Neon Row.',
    objectives: [
      { type: 'goto', text: 'Collect the package in Little Mercado', pos: dist(19, 48), radius: 50 },
      { type: 'goto', text: 'Deliver to Tito\'s garage in Neon Row', pos: dist(23, 79), radius: 50 },
    ],
  },
  {
    id: 'm3',
    name: 'The Silver Coupe',
    giver: 'Marisol Vega',
    reward: 900,
    unlock: 'Palm Heights',
    intro: `${CAST.fixer}: "A collector wants one specific car — the silver coupe parked up in Palm Heights. It will be hot the second you touch it, so drive it like you mean it."`,
    brief: 'Steal the silver coupe in Palm Heights and deliver it to the Old Harbor dock.',
    specialCar: true,
    objectives: [
      { type: 'stealCar', text: 'Steal the silver coupe in Palm Heights', pos: dist(47, 19), radius: 40 },
      { type: 'goto', text: 'Deliver the coupe to the Old Harbor dock', pos: dist(78, 72), radius: 70 },
    ],
  },
  {
    id: 'm4',
    name: 'Harbor Shift',
    giver: 'Chief Ibarra',
    reward: 1100,
    unlock: null,
    intro: `${CAST.dockboss}: "Containers are moving tonight and my forklift guy quit. Be at the harbor in two minutes or the job goes to someone slower than you."`,
    brief: 'Timed delivery: reach the harbor gate before the clock runs out.',
    timeLimit: 95,
    objectives: [
      { type: 'goto', text: 'Reach the harbor gate — beat the clock', pos: dist(72, 88), radius: 60, timed: true },
    ],
  },
  {
    id: 'm5',
    name: 'Bad Noise',
    giver: 'Marisol Vega',
    reward: 1400,
    unlock: 'Sunset Beach',
    intro: `${CAST.fixer}: "Kross's crew is shaking down shops on Neon Row. Go make some bad noise of your own — loosen a few of their cars and scare their people. Police will come. That's part of the job."`,
    brief: 'Cause chaos on Neon Row: destroy 3 cars and survive the heat.',
    objectives: [
      { type: 'destroyCars', text: 'Destroy 3 crew cars on Neon Row', count: 3 },
      { type: 'survive', text: 'Lose the cops (hide until stars fade)', },
    ],
  },
  {
    id: 'm6',
    name: 'The Escort',
    giver: 'Chief Ibarra',
    reward: 1600,
    unlock: null,
    intro: `${CAST.dockboss}: "A witness is talking to us from the courthouse. Drive her van. Keep it in one piece. Kross's people would love a headline."`,
    brief: 'Escort the witness van from the courthouse to the harbor without letting it blow.',
    objectives: [
      { type: 'escort', text: 'Escort the witness van to the harbor', pos: dist(78, 72), radius: 70 },
    ],
  },
  {
    id: 'm7',
    name: 'Kross Tax',
    giver: 'Tito',
    reward: 2000,
    unlock: 'Greenbelt Park',
    intro: `${CAST.cousin}: "Kross took our cut AND my stereo. His crew runs deliveries through the park at dusk. Hit their run, keep the take. I'll be at the beach thinking about my stereo."`,
    brief: 'Raid the courier run: ram and stop the courier car, then meet Tito at the beach.',
    objectives: [
      { type: 'ramCar', text: 'Ram the courier car until it stops', pos: dist(51, 77), radius: 40 },
      { type: 'goto', text: 'Meet Tito at Sunset Beach', pos: dist(84, 30), radius: 60 },
    ],
  },
  {
    id: 'm8',
    name: 'Last One Standing',
    giver: 'Marisol Vega',
    reward: 5000,
    unlock: null,
    intro: `${CAST.fixer}: "It ends tonight. Kross is holed up downtown with every car he has left. Take the streets, take the heat, and take him down. After this, kid, you're free."`,
    brief: 'Finale: destroy Denny Kross\'s convoy (3 cars) downtown and survive the wanted level.',
    objectives: [
      { type: 'destroyCars', text: 'Destroy Kross\'s convoy (3 cars)', count: 3 },
      { type: 'survive', text: 'Shake the police for good', },
      { type: 'goto', text: 'Leave the life behind — drive into the sunset', pos: dist(88, 20), radius: 70 },
    ],
  },
];

export function createMissionState(player) {
  return {
    list: MISSIONS,
    index: 0,          // next mission to offer
    active: null,      // current mission object
    obj: 0,            // current objective index
    state: 'idle',     // idle | offering | brief | active | complete | failed
    offerTimer: 0,
    timer: 0,
    specialCar: null,  // the marked car for stealCar missions
    escortVan: null,
    targetCars: [],
    destroyed: 0,
    completed: [],
    textTimer: 0,      // how long the story text stays on screen
    storyText: '',
  };
}

export function currentMission(state) {
  return state.active;
}

/** The next mission is available at the giver's marker when the player walks/drives into it. */
export function missionMarker(state, city) {
  if (state.index >= MISSIONS.length) return null;
  const m = MISSIONS[state.index];
  const spot = giverSpot(m);
  return { x: (spot.tx + 0.5) * 24, y: (spot.ty + 0.5) * 24, mission: m };
}

// Giver spots (tile coords) — one per mission, chosen near the prior finale for flow.
function giverSpot(m) {
  const spots = {
    m1: dist(46, 47),
    m2: dist(23, 79),
    m3: dist(46, 47),
    m4: dist(78, 72),
    m5: dist(46, 47),
    m6: dist(78, 72),
    m7: dist(23, 79),
    m8: dist(46, 47),
  };
  return spots[m.id] || dist(46, 47);
}

export function updateMissions(state, ctx, dt) {
  const { player, city, combat, traffic, police, audio, events } = ctx;
  state.textTimer = Math.max(0, state.textTimer - dt);

  // --- offering: player reached the giver marker ---------------------------
  if (state.state === 'idle') {
    const marker = missionMarker(state, city);
    if (marker && Math.hypot(player.x - marker.x, player.y - marker.y) < 34) {
      startMission(state, city, ctx);
    }
    return;
  }

  if (state.state !== 'active') return;
  const m = state.active;
  const o = m.objectives[state.obj];

  // Mission timer (timed objectives).
  if (o && o.timed) {
    state.timer -= dt;
    if (state.timer <= 0) { failMission(state, ctx, 'Out of time.'); return; }
  }

  // --- objective resolution -------------------------------------------------
  const pos = objectivePos(state, o);
  switch (o.type) {
    case 'goto': {
      if (pos && Math.hypot(player.x - pos.x, player.y - pos.y) < o.radius) nextObjective(state, ctx);
      break;
    }
    case 'gotoVehicle': {
      if (player.inVehicle) nextObjective(state, ctx);
      break;
    }
    case 'stealCar': {
      const car = state.specialCar;
      if (car && player.inVehicle === car) {
        if (events && events.onCrime) events.onCrime(player.x, player.y, 'carjack');
        nextObjective(state, ctx);
      }
      break;
    }
    case 'destroyCars': {
      if (state.destroyed >= o.count) nextObjective(state, ctx);
      break;
    }
    case 'survive': {
      if (player.wanted === 0) nextObjective(state, ctx);
      break;
    }
    case 'escort': {
      const van = state.escortVan;
      if (!van || van.exploded) { failMission(state, ctx, 'The witness van was destroyed.'); break; }
      if (player.inVehicle === van && pos && Math.hypot(van.x - pos.x, van.y - pos.y) < o.radius) {
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

function objectivePos(state, o) {
  if (!o || !o.pos) return null;
  return { x: (o.pos.tx + 0.5) * 24, y: (o.pos.ty + 0.5) * 24 };
}

/** The marker the HUD should point at right now (objective or giver). */
export function activeMarker(state, city) {
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
    const pos = objectivePos(state, o);
    return pos ? { x: pos.x, y: pos.y } : null;
  }
  if (state.state === 'idle') {
    return missionMarker(state, city);
  }
  return null;
}

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

function startMission(state, city, ctx) {
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

  // Spawn mission-specific props.
  if (m.specialCar) {
    const pos = m.objectives.find((o) => o.type === 'stealCar').pos;
    const car = {
      x: (pos.tx + 0.5) * 24, y: (pos.ty + 0.5) * 24,
      angle: Math.PI / 2, vx: 0, vy: 0, speed: 0,
      color: '#dcdcdc', kind: 'parked', driver: null,
      health: 100, stopTimer: 0, laneAxis: null, dir: 1, hornTimer: 0,
      length: 36, width: 16,
    };
    state.specialCar = car;
    ctx.traffic.cars.push(car);
  }
  if (m.objectives.some((o) => o.type === 'escort')) {
    const first = m.objectives[0];
    const pos = first.pos || { tx: 50, ty: 50 };
    const van = {
      x: (pos.tx + 0.5) * 24, y: (pos.ty + 0.5) * 24,
      angle: 0, vx: 0, vy: 0, speed: 0,
      color: '#e8e4da', kind: 'parked', driver: null,
      health: 160, stopTimer: 0, laneAxis: null, dir: 1, hornTimer: 0,
      length: 44, width: 20,
    };
    state.escortVan = van;
    ctx.traffic.cars.push(van);
  }
  if (m.objectives.some((o) => o.type === 'destroyCars')) {
    // Spawn the enemy cars near the objective area.
    const n = m.objectives.find((o) => o.type === 'destroyCars').count;
    for (let i = 0; i < n; i += 1) {
      const car = {
        x: (44 + i * 2.2) * 24, y: (46 + (i % 2) * 2) * 24,
        angle: Math.PI / 2, vx: 0, vy: 0, speed: 0,
        color: '#23232a', kind: 'parked', driver: null,
        health: 90, stopTimer: 0, laneAxis: null, dir: 1, hornTimer: 0,
        length: 36, width: 16, crew: true,
      };
      state.targetCars.push(car);
      ctx.traffic.cars.push(car);
    }
  }
  if (m.objectives.some((o) => o.type === 'ramCar')) {
    const pos = m.objectives.find((o) => o.type === 'ramCar').pos;
    const car = {
      x: (pos.tx + 0.5) * 24, y: (pos.ty + 0.5) * 24,
      angle: 0, vx: 0, vy: 0, speed: 0,
      color: '#c9a24a', kind: 'parked', driver: null,
      health: 60, stopTimer: 0, laneAxis: null, dir: 1, hornTimer: 0,
      length: 36, width: 16, courier: true,
    };
    state.targetCars.push(car);
    ctx.traffic.cars.push(car);
  }
  if (ctx.audio) ctx.audio.jingle();
}

function nextObjective(state, ctx) {
  state.obj += 1;
  const m = state.active;
  if (state.obj >= m.objectives.length) {
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
  if (m.unlock) state.unlockedDistricts = [...(state.unlockedDistricts || []), m.unlock];
  ctx.player.cash += m.reward;
  if (ctx.audio) ctx.audio.jingle();
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
  if (state.targetCars.includes(car)) {
    state.destroyed += 1;
  }
  if (state.specialCar === car) {
    // The special car is gone: the steal objective can no longer complete; fail softly.
    state.specialCar = null;
  }
}

export { MISSIONS, CAST };
