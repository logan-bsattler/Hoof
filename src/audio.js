// ASMR-leaning sound via WebAudio. Short CC0 recordings (audio/, see audio/CREDITS.md) carry
// the moo, the flinch, the knife, nips, block and spray; grinder, brush and rasp stay procedural
// with a recorded texture layered under. Every sound falls back to procedural if its file fails.
// Everything is quiet and textural; success is understated.

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
const loops = {};

const SAMPLE_FILES = [
  'knife1', 'knife2', 'knife3', 'snip', 'clunk', 'moo', 'moo-flinch', 'snort', 'sigh',
  'grinder', 'spray', 'brush', 'rasp',
];
const LOOP_SAMPLES = ['grinder', 'spray', 'brush', 'rasp'];
const buffers = {};
const lastPlayed = {};

function decodeAudio(data) {
  // Callback form: older Safari's decodeAudioData doesn't return a promise.
  return new Promise((res, rej) => ctx.decodeAudioData(data, res, rej));
}

// MP3 encoding pads both ends and fades the head in over ~45 ms, by an amount that depends on
// the decoder. The loops are steady textures, so loop only where the level (4 ms windows) is at
// least half the clip's overall level; otherwise every repeat would have a dropout.
function audibleSpan(buf) {
  const d = buf.getChannelData(0), w = Math.max(1, Math.round(buf.sampleRate * 0.004));
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  const floor = 0.25 * sum / d.length; // half the RMS, squared
  const level = (i) => { let q = 0; for (let k = 0; k < w; k++) q += d[i + k] * d[i + k]; return q / w; };
  let a = 0, b = d.length - w;
  while (a < b && level(a) < floor) a += w;
  while (b > a && level(b) < floor) b -= w;
  return [a / buf.sampleRate, (b + w) / buf.sampleRate];
}

function startRecordedLoop(name) {
  const buf = buffers[name];
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const [a, b] = audibleSpan(buf);
  s.loopStart = a; s.loopEnd = b;
  const g = ctx.createGain();
  g.gain.value = 0;
  s.connect(g).connect(master);
  s.start(0, a);
  loops[`${name}Rec`] = { s, g };
}

async function loadSamples() {
  await Promise.all(SAMPLE_FILES.map(async (name) => {
    try {
      const res = await fetch(`audio/${name}.mp3`);
      if (!res.ok) return;
      buffers[name] = await decodeAudio(await res.arrayBuffer());
      if (LOOP_SAMPLES.includes(name)) startRecordedLoop(name);
    } catch { /* stays procedural */ }
  }));
}

// Plays one of `names` (picked at random) with a little pitch and gain variation.
// Returns false when no recording is loaded so the caller can fall back.
function sample(names, { gain = 0.5, jitter = 0.06, delay = 0, minGap = 0 } = {}) {
  if (!ctx) return false;
  const list = (Array.isArray(names) ? names : [names]).filter((n) => buffers[n]);
  if (!list.length) return false;
  const key = list.join();
  const t = ctx.currentTime + delay;
  if (minGap && t - (lastPlayed[key] ?? -1) < minGap) return true;
  lastPlayed[key] = t;
  const s = ctx.createBufferSource();
  s.buffer = buffers[list[Math.floor(Math.random() * list.length)]];
  s.playbackRate.value = 1 + (Math.random() * 2 - 1) * jitter;
  const g = ctx.createGain();
  g.gain.value = gain * (0.85 + Math.random() * 0.15);
  s.connect(g).connect(master);
  s.start(t);
  return true;
}

function makeNoise() {
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseSource(loop = false) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = loop;
  return s;
}

function burst({ dur = 0.08, freq = 2000, q = 1, type = 'bandpass', gain = 0.25, attack = 0.003, delay = 0 }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const s = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

function tone({ freq = 440, to = null, dur = 0.2, type = 'sine', gain = 0.15, attack = 0.005, delay = 0, lp = null }) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = o.connect(g);
  if (lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 3;
    node = g.connect(f);
  }
  node.connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

function loopNoise(freq, q, type = 'bandpass') {
  const s = noiseSource(true);
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = 0;
  s.connect(f).connect(g).connect(master);
  s.start();
  return { s, f, g };
}

export const Sound = {
  init() {
    if (ctx) { ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.8 : 0;
    master.connect(ctx.destination);
    noiseBuf = makeNoise();

    // Barn room-tone.
    const amb = loopNoise(220, 0.5, 'lowpass');
    amb.g.gain.value = 0.05;

    loops.brush = loopNoise(2600, 0.8);
    loops.rasp = loopNoise(1300, 2.2);
    loops.grindNoise = loopNoise(3200, 1.2);
    loops.spray = loopNoise(6500, 0.7, 'highpass');
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 130;
    const og = ctx.createGain();
    og.gain.value = 0;
    const of = ctx.createBiquadFilter();
    of.type = 'lowpass'; of.frequency.value = 900;
    osc.connect(of).connect(og).connect(master);
    osc.start();
    loops.grindTone = { o: osc, g: og };
    loadSamples();
  },

  resume() {
    if (ctx && ctx.state !== 'running') ctx.resume();
  },

  setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
  },

  // Continuous friction for brush / rasp; level 0..1, called every frame.
  scrub(kind, level) {
    if (!ctx || !loops[kind]) return;
    const l = Math.min(1, level);
    loops[kind].g.gain.setTargetAtTime(l * 0.22, ctx.currentTime, 0.04);
    const rec = loops[`${kind}Rec`];
    if (rec) {
      rec.g.gain.setTargetAtTime(l * 0.3, ctx.currentTime, 0.04);
      rec.s.playbackRate.setTargetAtTime(0.9 + l * 0.2, ctx.currentTime, 0.1);
    }
  },

  // load 0..1: how much horn the disc is biting. danger 0..1: how close the horn under it is
  // to the thin line. Danger bogs the motor down and narrows the grind into a tight whine.
  grinder(on, load = 0, danger = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    loops.grindTone.g.gain.setTargetAtTime(on ? 0.06 + danger * 0.02 : 0, t, 0.05);
    loops.grindTone.o.frequency.setTargetAtTime(on ? 150 - load * 40 - danger * 45 : 130, t, 0.08);
    loops.grindNoise.g.gain.setTargetAtTime(on ? 0.05 + load * 0.12 + danger * 0.04 : 0, t, 0.05);
    loops.grindNoise.f.frequency.setTargetAtTime(3200 + danger * 2400, t, 0.06);
    loops.grindNoise.f.Q.setTargetAtTime(1.2 + danger * 5, t, 0.06);
    // The recorded disc bogs down with the procedural motor, so the danger cue survives.
    const rec = loops.grinderRec;
    if (rec) {
      rec.g.gain.setTargetAtTime(on ? 0.12 + load * 0.12 : 0, t, 0.05);
      rec.s.playbackRate.setTargetAtTime(on ? 1 - load * 0.06 - danger * 0.1 : 1, t, 0.08);
    }
  },

  spray(on) {
    if (!ctx) return;
    const rec = loops.sprayRec;
    if (rec) {
      rec.g.gain.setTargetAtTime(on ? 0.3 : 0, ctx.currentTime, 0.03);
      if (on) rec.s.playbackRate.setValueAtTime(0.96 + Math.random() * 0.08, ctx.currentTime);
    } else loops.spray.g.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 0.03);
  },

  bubbles() {
    for (let k = 0; k < 5; k++) tone({ freq: 900 + Math.random() * 900, to: 1600, dur: 0.04, gain: 0.025, delay: k * 0.07 + Math.random() * 0.05 });
  },

  pad() { burst({ dur: 0.12, freq: 900, type: 'lowpass', gain: 0.2, attack: 0.01 }); },

  wrap() {
    for (let k = 0; k < 6; k++) burst({ dur: 0.07, freq: 1800 + Math.random() * 1500, q: 0.9, gain: 0.12, delay: k * 0.09 });
  },

  knife() {
    if (sample(['knife1', 'knife2', 'knife3'], { gain: 0.32, jitter: 0.08, minGap: 0.08 })) return;
    burst({ dur: 0.07, freq: 3800 + Math.random() * 1200, q: 1.4, type: 'bandpass', gain: 0.22 });
  },
  snip() {
    if (sample('snip', { gain: 0.4, jitter: 0.1 })) return;
    burst({ dur: 0.04, freq: 2600, q: 0.8, type: 'highpass', gain: 0.3 });
    tone({ freq: 1700, dur: 0.03, gain: 0.05, type: 'square' });
  },
  tock() { tone({ freq: 420, to: 380, dur: 0.07, type: 'triangle', gain: 0.25 }); },
  spring() {
    tone({ freq: 300, to: 520, dur: 0.18, type: 'triangle', gain: 0.18 });
  },
  clunk() {
    tone({ freq: 90, to: 50, dur: 0.25, gain: 0.4 });
    if (sample('clunk', { gain: 0.5, jitter: 0.04 })) return;
    burst({ dur: 0.1, freq: 500, type: 'lowpass', gain: 0.25 });
  },
  release() {
    if (sample('sigh', { gain: 0.35, jitter: 0.04 })) return;
    burst({ dur: 0.5, freq: 700, q: 0.7, gain: 0.25, attack: 0.04 });
    tone({ freq: 320, to: 170, dur: 0.45, gain: 0.07 });
  },
  flake() { burst({ dur: 0.05, freq: 5000, q: 2, gain: 0.12 }); },
  step() {
    tone({ freq: 880, dur: 0.18, gain: 0.06 });
    tone({ freq: 1320, dur: 0.22, gain: 0.04, delay: 0.08 });
  },
  chime() {
    tone({ freq: 660, dur: 0.6, gain: 0.12 });
    tone({ freq: 990, dur: 0.8, gain: 0.09, delay: 0.14 });
  },
  warn() { tone({ freq: 220, dur: 0.12, type: 'triangle', gain: 0.1 }); },
  clop() {
    burst({ dur: 0.06, freq: 700, type: 'lowpass', gain: 0.3 });
    tone({ freq: 140, to: 90, dur: 0.06, gain: 0.12 });
  },
  moo(flinch = false) {
    if (!ctx) return;
    if (flinch) {
      // A sharp exhale, then the complaint.
      const snorted = sample('snort', { gain: 0.4, jitter: 0.05 });
      if (sample('moo-flinch', { gain: 0.45, jitter: 0.04, delay: snorted ? 0.18 : 0 })) return;
    } else if (sample('moo', { gain: 0.45, jitter: 0.03 })) return;
    const dur = flinch ? 0.55 : 1.2;
    const o = tone({ freq: flinch ? 200 : 140, to: flinch ? 150 : 100, dur, type: 'sawtooth', gain: flinch ? 0.2 : 0.14, attack: 0.12, lp: 650 });
    if (o) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5; lg.gain.value = 3;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(); lfo.stop(ctx.currentTime + dur);
    }
  },
};

export function buzz(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}
