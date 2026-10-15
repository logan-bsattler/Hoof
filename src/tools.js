// Tool definitions and their effect on the hoof model. Each apply* call
// mutates the hoof and returns an events object; the game loop turns events
// into particles, sound, haptics and log entries. No DOM in here.

import { CFG } from './config.js';
import { Z, LOOSE, CLAW, TRACT } from './hoof.js';
import { smoothstep } from './noise.js';

export const TOOLS = {
  brush: {
    name: 'Wire brush', mode: 'stroke', key: '1',
    hint: 'Scrub back and forth to clear the muck. Can’t cut horn.',
  },
  probe: {
    name: 'Hoof testers', mode: 'tap', key: '2',
    hint: 'Tap a spot to test it. Reads sole thickness; springs on a soft lesion.',
  },
  nippers: {
    name: 'Nippers', mode: 'bite', key: '3',
    hint: 'Tap or drag to bite off overgrown toe. Too blunt for the sole.',
  },
  grinder: {
    name: 'Grinder', mode: 'hold', key: '4',
    hint: 'Press, hold and glide to level the sole. Linger and you’ll draw blood.',
  },
  knife: {
    name: 'Hoof knife', mode: 'stroke', key: '5',
    hint: 'Press, hold and pull to take off a strip of horn. For the dish and for loose horn.',
  },
  rasp: {
    name: 'Rasp', mode: 'stroke', key: '6',
    hint: 'Scrub to smooth grinder marks and true the surface.',
  },
  block: {
    name: 'Block + glue', mode: 'tap', key: '7',
    hint: 'Tap a claw to glue on the block. It goes on the sound claw.',
  },
  spray: {
    name: 'Spray bottle', mode: 'hold', key: '8',
    hint: 'Hold to flush the opened lesion. Flush, pare, flush: fresh cuts need another rinse.',
  },
  wrap: {
    name: 'Pad + wrap', mode: 'tap', key: '9',
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
    loose: { [LOOSE.ULCER]: 0, [LOOSE.HEEL]: 0, [LOOSE.TRACT]: 0, [LOOSE.NECRO]: 0, [LOOSE.DOUBLE]: 0 },
    blood: false, bloodCells: 0, thin: false, lesionCut: false, grinderLesion: false,
    dirtyCut: false, nipLive: false, nipSole: false, tooDeep: false, blockedSkip: false, claws: new Set(),
    sprayed: 0, sprayLesion: 0,
    // White-line abscess: drain fires once, when the pared track reaches the pocket of pus.
    // offTrack: the knife dug at the pocket's sole without following the track there.
    // dry: it was a burst abscess (WP15.3), so the drain has no pus and no release.
    drain: false, dry: false, offTrack: false,
    // Sole ulcer: how far the closed cap has been worked toward giving (0..1), and the stamp it gave.
    capStrain: 0, capPop: false,
    // A blade (knife, grinder, nippers) bit into the skin of the heel cleft.
    cleftCut: false,
    // Thinnest living sole a tool cut into this stamp (mm): the cow's flinch reads it.
    minLive: Infinity,
    // Deep sepsis (WP13.3): a blade in the old hole, and a cut aimed at the swollen claw.
    holeCut: false, sepsisCut: false, sepsisTaken: 0,
  };
}

// Remove `depth` mm from cell i, honouring the near-target resistance.
// `wall` scales the cut on living wall: the wall is harder horn than the sole.
function cut(hoof, i, depth, ev, resist, resistThin = resist, wall = 1) {
  const z = hoof.zone[i];
  // The deep sepsis hole takes no blade: opening it further is the vet's work.
  if (z & Z.SEPSIS) { if (depth > 0.005) ev.holeCut = true; return 0; }
  const t = hoof.thick[i];
  // Under a tempting bruise the corium sits `lift` mm closer than the horn's thickness says.
  const lift = hoof.lift[i];
  if (t - lift <= 0) return 0;
  if ((z & Z.WALL) && !(z & Z.DEAD)) depth *= wall;
  if (z & Z.LIVE) {
    if (t - lift < CFG.sole.thin || (z & Z.ULCER)) depth *= resistThin;
    // The horn firms up over the last `ramp` mm, so a steady hand can stop on target.
    else depth *= resistAt(t, hoof.zoneTarget(i), resist);
  }
  const d = Math.min(depth, t - lift);
  hoof.thick[i] = t - d;
  ev.removed += d;
  if (hoof.claw[i] === hoof.sepsisClaw) ev.sepsisTaken += d;

  if (z & Z.DEAD) {
    ev.dead += d;
    return d;
  }
  if (d > 0.005) ev.claws.add(hoof.claw[i]);
  if (hoof.mud[i] > 0.5) ev.dirtyCut = true;
  if (z & Z.ULCER) ev.lesionCut = true;
  else {
    const live = hoof.thick[i] - lift;
    if (live < CFG.sole.thin) ev.thin = true;
    if (d > 0.005 && live < ev.minLive) ev.minLive = live;
  }
  if (hoof.thick[i] - lift <= 0.05) {
    hoof.thick[i] = lift;
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
  const covered = (hoof.block && c === hoof.block) || hoof.wrappedOn(c) > 0;
  // The block and wrap cover the sole; the heel bulb behind them stays workable.
  if (covered && (hoof.zone[i] & Z.LIVE) && !(hoof.zone[i] & Z.HEEL)) {
    ev.blockedSkip = true;
    return true;
  }
  return false;
}

// The heel cleft is skin: blades take nothing off it, but they hurt, and the raw DD patch
// bleeds at a touch. True when cell i is cleft (the caller skips it); only the tool's core counts.
function inCleft(hoof, i, f, ev) {
  if (!(hoof.zone[i] & Z.CLEFT)) return false;
  if (f > 0.5) {
    ev.cleftCut = true;
    if (hoof.zone[i] & Z.DD) hoof.blood[i] = 1;
  }
  return true;
}

function clearLoose(hoof, i, ev) {
  if (!hoof.loose[i]) return false;
  ev.loose[hoof.loose[i]]++;
  hoof.loose[i] = 0;
  return true;
}

// A cut aimed at the swollen claw (WP13.3): horn came off it, with the tool centred on it. A
// disc working the sound claw's axial edge can graze it without counting.
function aimedAtSepsis(hoof, x, y, ev) {
  const i = hoof.cellAt(x, y);
  if (ev.sepsisTaken > 0.01 && i >= 0 && hoof.claw[i] === hoof.sepsisClaw) ev.sepsisCut = true;
  return ev;
}

// Where the knife cuts at full depth (stamp falloff f >= this): the flat of the blade.
export const KNIFE_FLAT = CFG.tools.knife.flat;

// A sole ulcer's cap of loose horn, not yet given way.
const closedCap = (hoof, i) => !hoof.capOpenAt[hoof.claw[i]] && hoof.loose[i] && hoof.looseInit[i] === LOOSE.ULCER;

// The knife working the closed cap on `claw`: it holds, then gives all at once. The core lifts
// out with the horn round the blade; the undermined rim is left to pare back cell by cell.
function workCap(hoof, claw, x, y, amount, ev) {
  const give = CFG.tools.knife.capGive;
  hoof.capWorkAt[claw] += amount;
  ev.capStrain = Math.max(ev.capStrain, Math.min(1, hoof.capWorkAt[claw] / give));
  if (hoof.capWorkAt[claw] < give) return;
  hoof.capOpenAt[claw] = true;
  ev.capPop = true;
  const lift = CFG.tools.knife.capLift * hoof.lesionOn(claw).r;
  for (let i = 0; i < hoof.n; i++) {
    if (hoof.looseInit[i] !== LOOSE.ULCER || !hoof.loose[i] || hoof.claw[i] !== claw) continue;
    if ((hoof.zone[i] & Z.ULCER) || Math.hypot(hoof.cellX(i) - x, hoof.cellY(i) - y) < lift) clearLoose(hoof, i, ev);
  }
}

// How far below its trim target the pared-out track and the opened pocket sit (mm).
const GROOVE = { [TRACT.ENTRY]: 1.5, [TRACT.TRACK]: 1.5, [TRACT.POCKET]: 2.5 };
// A puncture is pared as a funnel: deepest on the mark, shallower round it.
const FUNNEL = { [TRACT.ENTRY]: 2.5, [TRACT.POCKET]: 1.5 };
// A burst abscess's pocket (WP15.3): it drained itself a while back, so less to open.
export const BURST_POCKET = 1.5;

// Knife on the white-line tract. Under-run horn lifts away only where it joins an opened cell,
// so the track has to be followed from the wall. Elsewhere it is ordinary sole: false, cut it.
function pareTract(hoof, i, ev) {
  if (hoof.looseInit[i] !== LOOSE.TRACT || !hoof.loose[i]) return false;
  if (!hoof.tractOpenable(i)) {
    if (hoof.tract[i] === TRACT.POCKET && hoof.thick[i] <= hoof.zoneTarget(i) + 0.3) ev.offTrack = true;
    return false;
  }
  clearLoose(hoof, i, ev);
  const L = hoof.lesionOn(hoof.claw[i]);
  // A burst abscess (WP15.3) has emptied itself: its pocket is shallower.
  const depth = L.type === 'foreign' ? FUNNEL[hoof.tract[i]] : L.stage === 'burst' && hoof.tract[i] === TRACT.POCKET ? BURST_POCKET : GROOVE[hoof.tract[i]];
  hoof.thick[i] = Math.min(hoof.thick[i], hoof.zoneTarget(i) - depth);
  if (!hoof.drained && hoof.tract[i] === TRACT.POCKET) {
    let n = 0, open = 0;
    for (let j = 0; j < hoof.n; j++) if (hoof.tract[j] === TRACT.POCKET) { n++; if (!hoof.loose[j]) open++; }
    if (open >= n * 0.5) { hoof.drained = true; ev.drain = true; if (L.stage === 'burst') ev.dry = true; }
  }
  return true;
}

// Toe necrosis: the blade lifts the dead black horn away, down to healthy horn under it.
function pareNecro(hoof, i, ev) {
  if (!hoof.loose[i] || hoof.looseInit[i] !== LOOSE.NECRO) return false;
  clearLoose(hoof, i, ev);
  hoof.thick[i] = Math.min(hoof.thick[i], hoof.zoneTarget(i) - 1.5);
  return true;
}

// Double sole: the blade gets under the false sole's edge and it lifts away, leaving the new
// sole a touch above trim height.
function pareDouble(hoof, i, ev) {
  if (!hoof.loose[i] || hoof.looseInit[i] !== LOOSE.DOUBLE) return false;
  clearLoose(hoof, i, ev);
  hoof.thick[i] = Math.min(hoof.thick[i], hoof.zoneTarget(i) + 0.2);
  return true;
}

// WP9 J2: a knife tap on last visit's block levers it a little further off; the last tap cracks
// it free. Returns null when the tap isn't on a block still glued on, else { taps, off }.
export function applyPry(hoof, x, y) {
  const ob = hoof.oldBlock;
  const i = hoof.cellAt(x, y);
  if (!ob?.on || i < 0 || hoof.claw[i] !== ob.claw) return null;
  ob.taps++;
  if (ob.taps >= CFG.tools.knife.pryTaps) {
    ob.on = false;
    hoof.block = CLAW.NONE;
    hoof.blockKind = 'rubber';
  }
  return { taps: ob.taps, off: !ob.on };
}

// Stroke tools: called with the distance travelled since the last stamp. `knife` is the blade in
// hand, { sand, wear }: on a sand farm (WP12.4) the horn it pares wears it, and a worn blade cuts
// slower. Elsewhere, or without one, the knife stays sharp.
export function applyStroke(hoof, tool, x, y, dist, knife = null) {
  const ev = newEvents();
  const cfg = CFG.tools[tool];
  if (tool === 'brush') {
    hoof.stamp(x, y, cfg.radius, (i, f) => {
      const a = Math.min(hoof.mud[i], (cfg.mudRate / hoof.mudHard) * dist * f);
      hoof.mud[i] -= a;
      ev.mud += a;
    });
  } else if (tool === 'knife') {
    // Flat-of-blade cells on a closed cap, per claw.
    const onCap = { [CLAW.OUTER]: 0, [CLAW.INNER]: 0 };
    const rate = knife?.sand ? cfg.rate * (1 - (1 - cfg.dull) * knife.wear) : cfg.rate;
    hoof.stamp(x, y, cfg.radius, (i, f) => {
      if (blocked(hoof, i, ev) || inCleft(hoof, i, f, ev)) return;
      hoof.mud[i] = Math.max(0, hoof.mud[i] - 0.03 * dist * f);
      // Fresh cuts expose untreated tissue: the flush has to be repeated.
      hoof.tint[i] *= 1 - Math.min(1, CFG.tools.spray.pareWash * dist * f);
      // The cap and the open core answer only to the flat of the blade; its feathered edge rides over them.
      if (closedCap(hoof, i)) { if (f >= KNIFE_FLAT) onCap[hoof.claw[i]]++; return; }
      if ((hoof.zone[i] & Z.ULCER) && f < KNIFE_FLAT) return;
      if (pareTract(hoof, i, ev) || pareNecro(hoof, i, ev) || pareDouble(hoof, i, ev)) return;
      if (hoof.looseInit[i] !== LOOSE.TRACT && clearLoose(hoof, i, ev)) return;
      // Flat-bottomed blade: an even strip across most of its width, feathered at the edges.
      const d = cut(hoof, i, rate * dist * Math.min(1, f / KNIFE_FLAT), ev, cfg.resist, cfg.resist, cfg.wall);
      // A clean knife pass leaves a smooth surface.
      hoof.rough[i] = hoof.rough[i] * (1 - Math.min(1, d * 2)) + d * 0.02;
    });
    for (const c of [CLAW.OUTER, CLAW.INNER]) if (onCap[c]) workCap(hoof, c, x, y, dist * Math.min(1, onCap[c] / 6), ev);
    if (knife?.sand) knife.wear = Math.min(1, knife.wear + ev.removed * cfg.wearPer);
  } else if (tool === 'rasp') {
    hoof.stamp(x, y, cfg.radius, (i, f) => {
      // The rasp has no edge to bite skin: it just rides over the cleft.
      if (blocked(hoof, i, ev) || (hoof.zone[i] & Z.CLEFT)) return;
      hoof.mud[i] = Math.max(0, hoof.mud[i] - 0.01 * dist * f);
      // The rasp lifts no loose horn, but trues the sole over the white-line track.
      if (hoof.loose[i] && hoof.looseInit[i] !== LOOSE.TRACT) return;
      hoof.rough[i] = Math.max(0, hoof.rough[i] - cfg.smooth * dist * f);
      cut(hoof, i, cfg.rate * dist * f, ev, 0.3);
    });
  }
  return aimedAtSepsis(hoof, x, y, ev);
}

// Grinder: continuous removal while held, scaled by time.
// ev.danger (0..1) rises as the thinnest live horn under the disc's core nears the thin line,
// so sound and haptics can tighten before any blood.
export function applyGrind(hoof, x, y, dt) {
  const ev = newEvents();
  const cfg = CFG.tools.grinder;
  ev.danger = 0;
  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (blocked(hoof, i, ev) || inCleft(hoof, i, f, ev)) return;
    if (f > 0.5 && (hoof.zone[i] & Z.LIVE) && hoof.thick[i] > 0) {
      ev.danger = Math.max(ev.danger, 1 - smoothstep(CFG.sole.thin, hoof.zoneTarget(i), hoof.thick[i] - hoof.lift[i]));
    }
    hoof.mud[i] = Math.max(0, hoof.mud[i] - 2 * dt * f);
    if (hoof.zone[i] & Z.ULCER) ev.grinderLesion = true;
    // The disc can't open the cap: it just skates over it. That's knife work.
    if (closedCap(hoof, i)) { ev.grinderLesion = true; return; }
    // The disc tears through a false sole and on into the thinner new sole under it.
    if (hoof.loose[i] && hoof.looseInit[i] === LOOSE.DOUBLE) {
      ev.grinderLesion = true;
      clearLoose(hoof, i, ev);
      hoof.thick[i] = Math.min(hoof.thick[i], hoof.zoneTarget(i) - 1.2);
      hoof.rough[i] = 0.8;
      return;
    }
    // The disc levels over the white-line track but can't follow it: that's knife work.
    // Nor can it tell dead black horn from live: it grinds the necrosis as horn, still black.
    if (hoof.looseInit[i] !== LOOSE.TRACT && hoof.looseInit[i] !== LOOSE.NECRO && clearLoose(hoof, i, ev)) {
      hoof.rough[i] = 0.8;
      return;
    }
    const d = cut(hoof, i, cfg.rate * dt * f, ev, cfg.resist, cfg.resistThin, cfg.wall);
    // The disc leaves swirl marks the rasp has to true up.
    hoof.rough[i] += (0.45 - hoof.rough[i]) * Math.min(1, d * 2);
  });
  return aimedAtSepsis(hoof, x, y, ev);
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
  if (ev.tooDeep && !bit) return aimedAtSepsis(hoof, x, y, ev);
  // Jaws centred on living horn: that's nipping the sole, not grazing the trim line from the toe.
  const at = hoof.cellAt(x, y);
  const onSole = at >= 0 && hoof.claw[at] && !(hoof.zone[at] & Z.DEAD);

  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (hoof.zone[i] & Z.DEAD) return;
    if (blocked(hoof, i, ev)) return;
    // Only the middle of the jaws bites living horn; the edges just graze it.
    if (f < 1 - cfg.liveCore ** 2) return;
    if (inCleft(hoof, i, 1, ev)) return;
    // The jaws take the black toe tip off cleanly, like dead toe horn.
    if (pareNecro(hoof, i, ev)) return;
    if (hoof.looseInit[i] !== LOOSE.TRACT) clearLoose(hoof, i, ev);
    ev.nipLive = true;
    if (onSole) ev.nipSole = true;
    cut(hoof, i, cfg.liveBite, ev, 1);
    hoof.rough[i] = 0.9;
  });
  return aimedAtSepsis(hoof, x, y, ev);
}

// Spray bottle: held like the grinder. Soaks antiseptic into opened tissue
// (and a little into horn), and rinses residual muck.
export function applySpray(hoof, x, y, dt) {
  const ev = newEvents();
  const cfg = CFG.tools.spray;
  hoof.stamp(x, y, cfg.radius, (i, f) => {
    if (blocked(hoof, i, ev)) return;
    hoof.mud[i] = Math.max(0, hoof.mud[i] - cfg.rinse * dt * f);
    // Opened ulcer tissue, or the raw skin of DD or foot rot in the cleft, soaks it up.
    const opened = ((hoof.looseInit[i] === LOOSE.ULCER || hoof.looseInit[i] === LOOSE.TRACT) && !hoof.loose[i]) || !!(hoof.zone[i] & (Z.DD | Z.ROT));
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
  if (!L) return { ok: false, reason: 'nothing' };
  // Deep sepsis: the vet will want to see that claw as it is.
  if (L.type === 'dds') return { ok: false, reason: 'vet' };
  if (hoof.caseDef.requires?.treat === false) return { ok: false, reason: 'untreated' };
  if (hoof.caseDef.requires?.wrap === false) return { ok: false, reason: 'nowrap' };
  if (!claw) return { ok: false, reason: 'miss' };
  if (hoof.lesions().length > 1) return wrapPair(hoof, claw, m, ready);
  if (claw !== L.claw) return { ok: false, reason: 'sound' };
  if (hoof.wrap >= 2) return { ok: false, reason: 'done' };
  if (L.type === 'ulcer' && m.looseRemain[LOOSE.ULCER] > 0.1) return { ok: false, reason: 'closed' };
  if (L.type === 'foreign' && !hoof.drained) return { ok: false, reason: 'closed' };
  if (m.lesionTint < CFG.treat.tintMin) return { ok: false, reason: 'unflushed' };
  if (!ready) return { ok: false, reason: 'early' };
  hoof.wrapClaw = claw;
  hoof.wrap++;
  return { ok: true, stage: hoof.wrap };
}

// A lesion on each claw (J3): each claw is padded and wrapped on its own, once its own lesion
// is open and flushed.
function wrapPair(hoof, claw, m, ready) {
  const L = hoof.lesionOn(claw);
  if (!L) return { ok: false, reason: 'miss' };
  if (hoof.wrapAt[claw] >= 2) return { ok: false, reason: hoof.wrapped ? 'done' : 'other' };
  if (L.type === 'ulcer' && m.looseRemainAt[claw] > 0.1) return { ok: false, reason: 'closed' };
  if (L.type === 'whiteline' && !hoof.drained) return { ok: false, reason: 'closed' };
  if (m.lesionTintAt[claw] < CFG.treat.tintMin) return { ok: false, reason: 'unflushed' };
  if (!ready) return { ok: false, reason: 'early' };
  hoof.wrapAt[claw]++;
  return { ok: true, stage: hoof.wrapAt[claw], claw };
}
