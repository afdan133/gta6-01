// Audio — everything is synthesized, nothing is downloaded.
//
// Two persistent loops: a sawtooth engine whose pitch follows the speedometer, and a square
// siren wobbled by an LFO. One-shots are filtered noise bursts (guns, crashes, explosions) or
// short tonal blips (pickups, damage, mission stingers). One master gain handles muting, and
// the whole module degrades to no-ops when WebAudio is missing, so headless runs stay silent.

const VOLUME = 0.8;

export function createAudio() {
  let ac = null;
  let bus = null;
  let mute = false;

  let engOsc = null;
  let engGain = null;
  let engFilter = null;

  let sirOsc = null;
  let sirGain = null;
  let sirLfo = null;
  let sirLfoDepth = null;

  // Lazily construct the graph; false when the platform has no WebAudio.
  function ensure() {
    if (ac) return true;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return false;
    ac = new Ctor();
    bus = ac.createGain();
    bus.gain.value = mute ? 0 : VOLUME;
    bus.connect(ac.destination);

    engOsc = ac.createOscillator();
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 60;
    engFilter = ac.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 420;
    engGain = ac.createGain();
    engGain.gain.value = 0;
    engOsc.connect(engFilter);
    engFilter.connect(engGain);
    engGain.connect(bus);
    engOsc.start();

    sirOsc = ac.createOscillator();
    sirOsc.type = 'square';
    sirOsc.frequency.value = 700;
    sirGain = ac.createGain();
    sirGain.gain.value = 0;
    sirLfo = ac.createOscillator();
    sirLfo.type = 'sine';
    sirLfo.frequency.value = 1.6;
    sirLfoDepth = ac.createGain();
    sirLfoDepth.gain.value = 180;
    sirLfo.connect(sirLfoDepth);
    sirLfoDepth.connect(sirOsc.frequency);
    sirOsc.connect(sirGain);
    sirGain.connect(bus);
    sirOsc.start();
    sirLfo.start();
    return true;
  }

  /** Resume after the first user gesture — browsers block audio until interaction. */
  function unlock() {
    if (!ensure()) return;
    if (ac.state === 'suspended') ac.resume();
  }

  function toggleMute(force) {
    mute = typeof force === 'boolean' ? force : !mute;
    if (bus) bus.gain.value = mute ? 0 : VOLUME;
    return mute;
  }

  /** Engine loop: speed01 in [0, 1]; on = throttle pedal pressed. */
  function engine(speed01, on) {
    if (!ac) return;
    const t = ac.currentTime;
    engOsc.frequency.setTargetAtTime(55 + speed01 * 130 + Math.sin(t * 30) * 3, t, 0.05);
    engGain.gain.setTargetAtTime(on ? 0.05 + speed01 * 0.06 : 0, t, 0.08);
  }

  /** Siren on/off; the LFO keeps sweeping while audible. */
  function siren(on) {
    if (!ac) return;
    const t = ac.currentTime;
    sirGain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.15);
    sirLfo.frequency.setTargetAtTime(on ? 1.6 : 0.2, t, 0.2);
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** White-noise burst with a linear decay envelope through a lowpass. */
  function burst(dur, vol, cutoff) {
    if (!ac) return;
    const t = ac.currentTime;
    const n = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, n, ac.sampleRate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i += 1) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(bus);
    src.start(t);
  }

  function gunshot(rapid = false) {
    burst(rapid ? 0.07 : 0.12, rapid ? 0.25 : 0.35, rapid ? 2200 : 1400);
    blip(rapid ? 220 : 160, 0.06, 'square', 0.12, 60);
  }

  function explosion() {
    burst(0.7, 0.6, 500);
    blip(90, 0.5, 'sawtooth', 0.3, 30);
  }

  function pickup() {
    blip(660, 0.09, 'square', 0.18, 990);
  }

  function hurt() {
    blip(200, 0.12, 'sawtooth', 0.2, 90);
  }

  function crash() {
    burst(0.15, 0.3, 800);
  }

  function punch() {
    burst(0.06, 0.18, 600);
  }

  /** Ascending four-note triangle fanfare. */
  function jingle() {
    [523, 659, 784, 1047].forEach((hz, i) => {
      setTimeout(() => blip(hz, 0.18, 'triangle', 0.2), i * 120);
    });
  }

  /** Descending three-note sting. */
  function fail() {
    [392, 330, 262].forEach((hz, i) => {
      setTimeout(() => blip(hz, 0.25, 'triangle', 0.2), i * 160);
    });
  }

  return {
    unlock,
    toggleMute,
    setMuted: (m) => toggleMute(m),
    get muted() {
      return mute;
    },
    engine,
    siren,
    gunshot,
    explosion,
    pickup,
    hurt,
    crash,
    punch,
    jingle,
    fail,
  };
}
