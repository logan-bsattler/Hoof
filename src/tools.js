// Tool definitions and their effect on the hoof model. Each apply* call
// mutates the hoof and returns an events object; the game loop turns events
// into particles, sound, haptics and log entries. No DOM in here.

import { CFG } from './config.js';
import { Z, LOOSE } from './hoof.js';

export const TOOLS = {
  brush: {
    name: 'Wire brush', icon: '🖌️', mode: 'stroke', key: '1',
    hint: 'Scrub back and forth to clear the muck. Can’t cut horn.',
  },
  probe: {
    name: 'Hoof testers', icon: '🧪', mode: 'tap', key: '2',
    hint: 'Tap a spot to test it. Reads sole thickness; springs on a soft lesion.',
  },
  nippers: {
    name: 'Nippers', icon: '✂️', mode: 'bite', key: '3',
    hint: 'Tap or drag to bite off overgrown toe. Too blunt for the sole.',
  },
  grinder: {
    name: 'Grinder', icon: '⚙️', mode: 'hold', key: '4',
    hint: 'Press, hold and glide to level the sole. Linger and you’ll draw blood.',
  },
  knife: {
    name: 'Hoof knife', icon: '🔪', mode: 'stroke', key: '5',
    hint: 'Short swipes pare thin horn. For the dish and for loose horn.',
  },
  rasp: {
    name: 'Rasp', icon: '🪵', mode: 'stroke', key: '6',
    hint: 'Scrub to smooth grinder marks and true the surface.',
  },
  block: {
    name: 'Block + glue', icon: '🧱', mode: 'tap', key: '7',
    hint: 'Tap a claw to glue on the block. It goes on the sound claw.',
  },
};

export const TOOL_ORDER = Object.keys(TOOLS);

export function toolRadius(id) {
  return CFG.tools[id]?.radius ?? 0;
}

function newEvents() {
  return {
    removed: 0, mud: 0, dead: 0,
    loose: { [LOOSE.ULCER]: 0, [LOOSE.HEEL]: 0 },
    blood: false, thin: false, lesionCut: false, grinderLesion: false,
    dirtyCut: false, nipLive: false, blockedSkip: false, claws: new Set(),
  };
}

// Remove `depth` mm from cell i, honouring the near-target resistance.
function cut(hoof, i, depth, ev, resist, resistThin = resist) {
  const z = hoof.zone[i];
  const t = hoof.thick[i];
  if (t <= 0) return 0;
  if (z & Z.LIVE) {
    const tgt = hoof.zoneTarget(i);
    if (t < CFG.sole.thin || (z & Z.ULCER)) depth *= resistThin;
    else if (t <= tgt - 0.25 || tgt === Infinity) depth *= resist;
  }
  const d = Math.min(depth, t);
  hoof.thick[i] = t - d;
  ev.removed += d;

  if (z & Z.DEAD) {
    ev.dead += d;
    return d;
  }
  if (d > 0.005) ev.claws.add(hoof.claw[i]);
  if (hoof.mud[i] > 0.5) ev.dirtyCut = true;
  if (z & Z.ULCER) ev.lesionCut = true;
  else if (hoof.thick[i] < CFG.sole.thin) ev.thin = true;
  if (hoof.thick[i] <= 0.05) {
    hoof.thick[i] = 0;
    hoof.blood[i] = 1;
    ev.blood = true;
  }
  return d;
}

function blocked(hoof, i, ev) {
  if (hoof.block && hoof.claw[i] === hoof.block && (hoof.zone[i] & Z.LIVE)) {
    ev.blockedSkip = true;
    return true;
  }
  return false;
}

function clearLoose(hoof, i, ev) {
  if (!hoof.loose[i]) return false;
  ev.loose[hoof.loose[i]]++;
  hoof.loose[i] = 0;
  return true;
}

// Stroke tools: called with the distance travelled since the last stamp.
export function applyStroke(hoof, tool, x, y, dist) {
  const ev = newEvents();
  const cfg = CFG.tools[tool];
  if (tool === 'brush') {
    hoof.stamp(x, y, cfg.radius, (i, f) => {
      const a = Math.min(hoof.mud[i], cfg.mudRate * dist * f);
      hoof.mud[i] -= a;
      ev.mud += a;
    });
  } else if (tool === 'knife') {
    hoof.stamp(x, y, cfg.radius, (i, f) => {
      if (blocked(hoof, i, ev)) return;
      hoof.mud[i] = Math.max(0, hoof.mud[i] - 0.03 * dist * f);
      if (clearLoose(hoof, i, ev)) return;
      const d = cut(hoof, i, cfg.rate * dist * f, ev, cfg.resist);
      // A clean knife pass leaves a smooth surface.
      hoof.rough[i] = hoof.rough[i] * (1 - Math.min(1, d * 2)) + d * 0.02;
    });
  } else if (tool === 'rasp') {
    hoof.stamp(x, y, cfg.radius, (i, f) => {
      if (blocked(hoof, i, ev)) return;
      hoof.mud[i] = Math.max(0, hoof.mud[i] - 0.01 * dist * f);
      if (hoof.loose[i]) return;
      hoof.rough[i] = Math.max(0, hoof.rough[i] - cfg.smooth * dist * f);
      cut(hoof, i, cfg.rate * dist * f, ev, 0.3);
    });
  }
  return ev;
}

// Grinder: continuous removal while held, scaled by time.
export function applyGrind(hoof, x, y, dt) {
  const ev = newEvents();
  const cfg = CFG.tools.grinder;
  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (blocked(hoof, i, ev)) return;
    hoof.mud[i] = Math.max(0, hoof.mud[i] - 2 * dt * f);
    if (hoof.zone[i] & Z.ULCER) ev.grinderLesion = true;
    if (clearLoose(hoof, i, ev)) {
      hoof.rough[i] = 0.8;
      return;
    }
    const d = cut(hoof, i, cfg.rate * dt * f, ev, cfg.resist, cfg.resistThin);
    // The disc leaves swirl marks the rasp has to true up.
    hoof.rough[i] += (0.45 - hoof.rough[i]) * Math.min(1, d * 2);
  });
  return ev;
}

// Nippers: one bite. Dead toe horn goes entirely; living horn loses a chunk.
export function applyBite(hoof, x, y) {
  const ev = newEvents();
  const cfg = CFG.tools.nippers;
  hoof.stamp(x, y, cfg.radius, (i) => {
    if (blocked(hoof, i, ev)) return;
    if (hoof.zone[i] & Z.DEAD) {
      cut(hoof, i, hoof.thick[i], ev, 1);
      return;
    }
    clearLoose(hoof, i, ev);
    ev.nipLive = true;
    cut(hoof, i, cfg.liveBite, ev, 1);
    hoof.rough[i] = 0.9;
  });
  return ev;
}
