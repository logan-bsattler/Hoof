// Tool definitions and their effect on the hoof model. Each apply* call
// mutates the hoof and returns an events object; the game loop turns events
// into particles, sound, haptics and log entries. No DOM in here.

import { CFG } from './config.js';
import { Z, LOOSE, CLAW } from './hoof.js';
import { smoothstep } from './noise.js';

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
    hint: 'Press, hold and pull to take off a strip of horn. For the dish and for loose horn.',
  },
  rasp: {
    name: 'Rasp', icon: '🪵', mode: 'stroke', key: '6',
    hint: 'Scrub to smooth grinder marks and true the surface.',
  },
  block: {
    name: 'Block + glue', icon: '🧱', mode: 'tap', key: '7',
    hint: 'Tap a claw to glue on the block. It goes on the sound claw.',
  },
  spray: {
    name: 'Spray bottle', icon: '🧴', mode: 'hold', key: '8',
    hint: 'Hold to flush the opened lesion. Flush, pare, flush: fresh cuts need another rinse.',
  },
  wrap: {
    name: 'Pad + wrap', icon: '🩹', mode: 'tap', key: '9',
    hint: 'The last beat. Tap the treated claw: white pad first, then the pink wrap.',
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
    blood: false, bloodCells: 0, thin: false, lesionCut: false, grinderLesion: false,
    dirtyCut: false, nipLive: false, tooDeep: false, blockedSkip: false, claws: new Set(),
    sprayed: 0, sprayLesion: 0,
  };
}

// Remove `depth` mm from cell i, honouring the near-target resistance.
function cut(hoof, i, depth, ev, resist, resistThin = resist) {
  const z = hoof.zone[i];
  const t = hoof.thick[i];
  if (t <= 0) return 0;
  if (z & Z.LIVE) {
    if (t < CFG.sole.thin || (z & Z.ULCER)) depth *= resistThin;
    // The horn firms up over the last `ramp` mm, so a steady hand can stop on target.
    else depth *= resistAt(t, hoof.zoneTarget(i), resist);
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
    ev.bloodCells++;
  }
  return d;
}

// Cut-rate multiplier at thickness t: full speed above tgt + ramp, easing down to `resist` at tgt.
export function resistAt(t, tgt, resist) {
  return resist + (1 - resist) * smoothstep(tgt, tgt + CFG.sole.ramp, t);
}

function blocked(hoof, i, ev) {
  const c = hoof.claw[i];
  const covered = (hoof.block && c === hoof.block) || (hoof.wrap && c === hoof.wrapClaw);
  // The block and wrap cover the sole; the heel bulb behind them stays workable.
  if (covered && (hoof.zone[i] & Z.LIVE) && !(hoof.zone[i] & Z.HEEL)) {
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
      // Fresh cuts expose untreated tissue: the flush has to be repeated.
      hoof.tint[i] *= 1 - Math.min(1, CFG.tools.spray.pareWash * dist * f);
      if (clearLoose(hoof, i, ev)) return;
      // Flat-bottomed blade: an even strip across most of its width, feathered at the edges.
      const d = cut(hoof, i, cfg.rate * dist * Math.min(1, f * 2.5), ev, cfg.resist);
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
// ev.danger (0..1) rises as the thinnest live horn under the disc's core nears the thin line,
// so sound and haptics can tighten before any blood.
export function applyGrind(hoof, x, y, dt) {
  const ev = newEvents();
  const cfg = CFG.tools.grinder;
  ev.danger = 0;
  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (blocked(hoof, i, ev)) return;
    if (f > 0.5 && (hoof.zone[i] & Z.LIVE) && hoof.thick[i] > 0) {
      ev.danger = Math.max(ev.danger, 1 - smoothstep(CFG.sole.thin, hoof.zoneTarget(i), hoof.thick[i]));
    }
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

// Nippers: one bite, worked from the tip back toward the hoof. The jaws cut
// across the toe at y and take every scrap of dead horn distal to the cut
// (toes point down, so distal = larger y). It's all or nothing: if the horn
// beyond the cut runs deeper than the jaws can close on, nothing comes off.
export function applyBite(hoof, x, y) {
  const ev = newEvents();
  const cfg = CFG.tools.nippers;
  const { x0, y0, cell, cols, rows } = hoof.g;
  const c0 = Math.max(0, Math.floor((x - cfg.radius - x0) / cell));
  const c1 = Math.min(cols - 1, Math.floor((x + cfg.radius - x0) / cell));
  const r0 = Math.max(0, Math.floor((y - y0) / cell));
  const chunk = { [CLAW.OUTER]: [], [CLAW.INNER]: [] };
  const reach = { [CLAW.OUTER]: 0, [CLAW.INNER]: 0 };
  for (let cy = r0; cy < rows; cy++) {
    for (let cx = c0; cx <= c1; cx++) {
      const i = cy * cols + cx;
      if (!(hoof.zone[i] & Z.DEAD) || hoof.thick[i] <= 0.05) continue;
      const c = hoof.claw[i];
      chunk[c].push(i);
      reach[c] = Math.max(reach[c], hoof.cellY(i) - y);
    }
  }
  let bit = false;
  for (const c of [CLAW.OUTER, CLAW.INNER]) {
    if (!chunk[c].length) continue;
    if (reach[c] > cfg.jawDepth) { ev.tooDeep = true; continue; }
    bit = true;
    for (const i of chunk[c]) if (!blocked(hoof, i, ev)) cut(hoof, i, hoof.thick[i], ev, 1);
  }
  if (ev.tooDeep && !bit) return ev;

  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (hoof.zone[i] & Z.DEAD) return;
    if (blocked(hoof, i, ev)) return;
    // Only the middle of the jaws bites living horn; the edges just graze it.
    if (f < 1 - cfg.liveCore ** 2) return;
    clearLoose(hoof, i, ev);
    ev.nipLive = true;
    cut(hoof, i, cfg.liveBite, ev, 1);
    hoof.rough[i] = 0.9;
  });
  return ev;
}

// Spray bottle: held like the grinder. Soaks antiseptic into opened tissue
// (and a little into horn), and rinses residual muck.
export function applySpray(hoof, x, y, dt) {
  const ev = newEvents();
  const cfg = CFG.tools.spray;
  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (blocked(hoof, i, ev)) return;
    hoof.mud[i] = Math.max(0, hoof.mud[i] - cfg.rinse * dt * f);
    const opened = hoof.looseInit[i] === LOOSE.ULCER && !hoof.loose[i];
    const a = Math.min(1 - hoof.tint[i], (opened ? cfg.rate : cfg.hornRate) * dt * f);
    hoof.tint[i] += a;
    ev.sprayed += a;
    if (opened) ev.sprayLesion += a;
  });
  return ev;
}

// Pad + wrap: one tap pads the treated claw, the next wraps it.
// `m` is the current metrics; `ready` is true once the trim itself is finished.
// Returns { ok, stage } or { ok: false, reason }.
export function applyWrap(hoof, claw, m, ready) {
  const L = hoof.caseDef.lesion;
  if (!claw) return { ok: false, reason: 'miss' };
  if (claw !== L.claw) return { ok: false, reason: 'sound' };
  if (hoof.wrap >= 2) return { ok: false, reason: 'done' };
  if (m.looseRemain[LOOSE.ULCER] > 0.1) return { ok: false, reason: 'closed' };
  if (m.lesionTint < CFG.treat.tintMin) return { ok: false, reason: 'unflushed' };
  if (!ready) return { ok: false, reason: 'early' };
  hoof.wrapClaw = claw;
  hoof.wrap++;
  return { ok: true, stage: hoof.wrap };
}
