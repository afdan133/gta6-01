// Persistence.
//
// The run's state — player stats, mission progress, clock, mute flag — serialises to one JSON
// blob in localStorage. Auto-save runs on a 10-second cadence while playing, F5/Q force it by
// hand, and mission milestones save immediately. Every storage touch is guarded so private
// browsing or a full quota degrades to a plain `false`, never an exception.

import { SAVE_KEY } from './config.js';

const VERSION = 1;

function snapshot(game) {
  return {
    v: VERSION,
    seed: game.seed,
    dayT: game.dayT,
    player: {
      x: game.player.x,
      y: game.player.y,
      health: game.player.health,
      armor: game.player.armor,
      cash: game.player.cash,
      weapon: game.player.weapon,
      ammo: { ...game.player.ammo },
    },
    missions: {
      index: game.missionState.index,
      completed: [...game.missionState.completed],
      unlocked: [...(game.missionState.unlockedDistricts || [])],
    },
    muted: game.audio ? game.audio.muted : false,
    stamp: Date.now(),
  };
}

export function createSaveSystem() {
  let autoClock = 0;

  function save(game) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot(game)));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data && data.v === VERSION ? data : null; // ignore foreign versions
    } catch {
      return null;
    }
  }

  function hasSave() {
    return load() !== null;
  }

  /** Pour a snapshot back into the live game objects. */
  function apply(data, game) {
    if (!data || !data.player || !data.missions) return false;
    const p = data.player;
    game.player.x = p.x;
    game.player.y = p.y;
    game.player.health = p.health;
    game.player.armor = p.armor ?? 0;
    game.player.cash = p.cash ?? 0;
    game.player.weapon = p.weapon ?? 'fists';
    game.player.ammo = { pistol: 0, uzi: 0, ...(p.ammo || {}) };
    game.missionState.index = data.missions.index ?? 0;
    game.missionState.completed = [...(data.missions.completed || [])];
    game.missionState.unlockedDistricts = [...(data.missions.unlocked || [])];
    if (typeof data.dayT === 'number') game.dayT = data.dayT;
    if (game.audio && typeof data.muted === 'boolean') game.audio.setMuted(data.muted);
    // Snap the camera so loading doesn't glide across the map.
    if (game.camera) {
      game.camera.x = game.player.x;
      game.camera.y = game.player.y;
    }
    return true;
  }

  function clear() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* nothing to clean up in private mode */
    }
  }

  /** Auto-save every 10 simulated seconds. */
  function tick(game, dt) {
    autoClock += dt;
    if (autoClock >= 10) {
      autoClock = 0;
      save(game);
    }
  }

  /** Mission milestones write through immediately. */
  function onMissionEvent(game) {
    save(game);
  }

  return { save, load, apply, hasSave, clear, tick, onMissionEvent, capture: snapshot };
}
