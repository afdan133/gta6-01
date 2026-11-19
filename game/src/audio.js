// Audio: every sound is synthesized with WebAudio — no files, no network.
//
// Loops: an engine whose pitch tracks vehicle speed, and a two-tone police siren (a square
// oscillator wobbled by an LFO). One-shots: gunshots and crashes (filtered noise bursts),
// explosions, pickup blips, hurt grunts, and the mission jingle/fail stingers.
// Everything runs through one master gain so M mutes the whole game. Without WebAudio
// (headless smoke tests, old browsers) every call degrades to a no-op.

const MASTER_VOLUME = 0.8;

export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;

  // Engine loop: sawtooth through a lowpass; frequency and gain set per frame.
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;

  // Siren: square oscillator + sine LFO wobbling its frequency between two tones.
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let sirenLfoGain = null;

  /** Build the audio graph on first use; returns false when WebAudio is unavailable. */
  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER_VOLUME;
    master.connect(ctx.destination);

    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 400;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter).connect(engineGain).connect(master);
    engineOsc.start();

    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'square';
    sirenOsc.frequency.value = 700;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'sine';
    sirenLfo.frequency.value = 1.6;
    sirenLfoGain = ctx.createGain();
    sirenLfoGain.gain.value = 180;
    sirenLfo.connect(sirenLfoGain).connect(sirenOsc.frequency);
    sirenOsc.connect(sirenGain).connect(master);
    sirenOsc.start();
    sirenLfo.start();
    return true;
  }

  /** Call once on the first user gesture — browsers only allow audio after interaction. */
  function unlock() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function setMuted(m) {
    muted = m;
    if (master) master.gain.value = muted ? 0 : MASTER_VOLUME;
  }

  /** Engine loop: speed01 in [0, 1]; `on` true while driving. */
  function engine(speed01, on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = 55 + speed01 * 130 + Math.sin(t * 30) * 3; // slight growl
    engineOsc.frequency.setTargetAtTime(f, t, 0.05);
    engineGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.08);
  }

  /** Siren: on while the player is wanted and units are in play. */
  function siren(on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.15);
    sirenLfo.frequency.setTargetAtTime(on ? 1.6 : 0.2, t, 0.2);
  }

  /** Short tonal blip, optionally sliding down to `slide` Hz. */
  function blip(freq, dur, type, vol, slide) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Decaying white-noise burst through a lowpass — gunshots, crashes, explosions. */
  function noiseBurst(dur, vol, filterFreq) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(t);
  }

  function gunshot(uzi = false) {
    noiseBurst(uzi ? 0.07 : 0.12, uzi ? 0.25 : 0.35, uzi ? 2200 : 1400);
    blip(uzi ? 220 : 160, 0.06, 'square', 0.12, 60);
  }

  function explosion() {
    noiseBurst(0.7, 0.6, 500);
    blip(90, 0.5, 'sawtooth', 0.3, 30);
  }

  function pickup() { blip(660, 0.09, 'square', 0.18, 990); }
  function hurt() { blip(200, 0.12, 'sawtooth', 0.2, 90); }
  function crash() { noiseBurst(0.15, 0.3, 800); }

  /** Rising triangle stinger: mission complete / game start. */
  function jingle() {
    [523, 659, 784, 1047].forEach((n, i) => setTimeout(() => blip(n, 0.18, 'triangle', 0.2), i * 120));
  }

  /** Falling stinger: wasted, busted, mission failed. */
  function fail() {
    [392, 330, 262].forEach((n, i) => setTimeout(() => blip(n, 0.25, 'triangle', 0.2), i * 160));
  }

  return {
    unlock, setMuted,
    get muted() { return muted; },
    engine, siren, gunshot, explosion, pickup, hurt, crash, jingle, fail,
  };
}
