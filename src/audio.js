// Procedural ASMR-leaning sound via WebAudio — no audio files needed.
// Everything is quiet and textural; success is understated.

let ctx = null;
let master = null;
let noiseBuf = null;
let enabled = true;
const loops = {};

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
  },

  setEnabled(on) {
    enabled = on;
    if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.05);
  },

  // Continuous friction for brush / rasp; level 0..1, called every frame.
  scrub(kind, level) {
    if (!ctx || !loops[kind]) return;
    loops[kind].g.gain.setTargetAtTime(Math.min(1, level) * 0.22, ctx.currentTime, 0.04);
  },

  grinder(on, load = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    loops.grindTone.g.gain.setTargetAtTime(on ? 0.06 : 0, t, 0.05);
    loops.grindTone.o.frequency.setTargetAtTime(on ? 150 - load * 40 : 130, t, 0.08);
    loops.grindNoise.g.gain.setTargetAtTime(on ? 0.05 + load * 0.12 : 0, t, 0.05);
  },

  spray(on) {
    if (!ctx) return;
    loops.spray.g.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 0.03);
  },

  bubbles() {
    for (let k = 0; k < 5; k++) tone({ freq: 900 + Math.random() * 900, to: 1600, dur: 0.04, gain: 0.025, delay: k * 0.07 + Math.random() * 0.05 });
  },

  pad() { burst({ dur: 0.12, freq: 900, type: 'lowpass', gain: 0.2, attack: 0.01 }); },

  wrap() {
    for (let k = 0; k < 6; k++) burst({ dur: 0.07, freq: 1800 + Math.random() * 1500, q: 0.9, gain: 0.12, delay: k * 0.09 });
  },

  knife() { burst({ dur: 0.07, freq: 3800 + Math.random() * 1200, q: 1.4, type: 'bandpass', gain: 0.22 }); },
  snip() {
    burst({ dur: 0.04, freq: 2600, q: 0.8, type: 'highpass', gain: 0.3 });
    tone({ freq: 1700, dur: 0.03, gain: 0.05, type: 'square' });
  },
  tock() { tone({ freq: 420, to: 380, dur: 0.07, type: 'triangle', gain: 0.25 }); },
  spring() {
    tone({ freq: 300, to: 520, dur: 0.18, type: 'triangle', gain: 0.18 });
  },
  clunk() {
    tone({ freq: 90, to: 50, dur: 0.25, gain: 0.4 });
    burst({ dur: 0.1, freq: 500, type: 'lowpass', gain: 0.25 });
  },
  release() {
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
