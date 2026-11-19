// Save: localStorage persistence of the run — player stats, mission progress, day time and
// settings. Auto-saves every ~10 s while playing; F5 saves and Q/F9 load on demand (see main.js).
// The mute flag travels with the save so sound settings survive reloads. All storage access is
// guarded: private-mode browsers and quota errors degrade to "save failed", never a crash.

const KEY = 'sunset-city-save-v1';

export function createSaveSystem() {
  let autoTimer = 0;

  /** Snapshot the current run into a plain JSON object. */
  function capture(game) {
    return {
      v: 1,
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
        unlockedDistricts: [...(game.missionState.unlockedDistricts || [])],
      },
      muted: game.audio.muted,
      time: Date.now(),
    };
  }

  function save(game) {
    try {
      localStorage.setItem(KEY, JSON.stringify(capture(game)));
      return true;
    } catch {
      return false;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return null; // unknown version: ignore
      return data;
    } catch {
      return null;
    }
  }

  function hasSave() { return load() !== null; }

  /** Apply a loaded snapshot to the live game (positions, stats, missions, settings). */
  function apply(data, game) {
    if (!data) return false;
    game.player.x = data.player.x;
    game.player.y = data.player.y;
    game.player.health = data.player.health;
    game.player.armor = data.player.armor;
    game.player.cash = data.player.cash;
    game.player.weapon = data.player.weapon;
    game.player.ammo = { ...data.player.ammo };
    game.missionState.index = data.missions.index;
    game.missionState.completed = [...data.missions.completed];
    game.missionState.unlockedDistricts = [...(data.missions.unlockedDistricts || [])];
    game.dayT = data.dayT;
    if (game.audio && typeof data.muted === 'boolean') game.audio.setMuted(data.muted);
    game.camera.x = game.player.x; // snap the camera so we don't glide across the map
    game.camera.y = game.player.y;
    return true;
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch { /* private mode */ }
  }

  /** Called once per simulated step; auto-save every 10 s while playing. */
  function tick(game, dt) {
    autoTimer += dt;
    if (autoTimer >= 10) {
      autoTimer = 0;
      save(game);
    }
  }

  /** Save immediately after mission milestones so progress can't be lost. */
  function onMissionEvent(game) { save(game); }

  return { save, load, apply, hasSave, clear, tick, onMissionEvent, capture };
}
