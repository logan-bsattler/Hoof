// Guided first run: the same case, broken into small coached beats. Each beat
// names a tool, highlights where to work, says what to do, and shows progress.
// Pure data + predicates over hoof metrics — no DOM, so it can be tested.

import { CFG, tolOf } from './config.js';
import { CLAW, CLAW_NAME, LOOSE, GEOM, clawBox, clawWhere, dishRect, soundClaw } from './hoof.js';
import { STEPS } from './steps.js';
import { KNIFE_FLAT } from './tools.js';

const { target: T, dishTarget: D } = CFG.sole;
const step = (id) => STEPS.find((s) => s.id === id).done;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Progress from a start value toward a goal value (either direction).
const toward = (cur, start, goal) => (start === goal ? 1 : clamp01((start - cur) / (start - goal)));

// Coaching targets are built from the claw outlines, so they follow the case's layout.
const toeRect = (b) => ({ x: b.x - 2, y: b.y + b.h - 30, w: b.w + 5, h: 75 });
const soleRect = (b) => ({ x: b.x + 8, y: GEOM.heelY + 12, w: b.w - 15, h: 260 });
const clawRing = (b) => ({ x: b.cx, y: b.y + b.h * 0.54, r: 70 });

export function tutorialBeats(caseDef) {
  const L = caseDef.lesion;
  const H = caseDef.looseHorn;
  const side = caseDef.side ?? 'LH';
  const sound = soundClaw(caseDef);
  const box = (c) => clawBox(c, side);
  const where = (c) => clawWhere(c, side);
  const inner = (m) => m.claws[CLAW.INNER];
  const outer = (m) => m.claws[CLAW.OUTER];
  const TOL = tolOf(caseDef);
  // A routine cow (#2) has no lesion: the run has her test one of her marks instead, and has no
  // opening, block or treatment to teach.
  const M = L ?? caseDef.findings[0];
  // The ulcer's cap, ringed red on the steps that work that claw: grinder and dish keep off it.
  const capRing = L && { x: L.x, y: L.y, r: L.r * 1.75 };
  const avoidOn = (c) => (L?.claw === c ? { avoid: capRing } : {});
  const keepOff = (c, what) => (L?.claw === c ? ` ${what}` : '');
  // Paring the rim: the blade's centre on this ring keeps its flat clear of the open core.
  const pareR = L && L.r + CFG.tools.knife.radius * Math.sqrt(1 - KNIFE_FLAT) + 3;
  const beats = [
    {
      id: 'clean', tool: 'brush', title: 'Clean the foot',
      text: 'Hold the wire brush on the foot and scrub back and forth. You can’t read a dirty foot.',
      target: { kind: 'rect', x: 50, y: 180, w: 300, h: 450 },
      measure: (m) => m.mudMean, goal: 0.12,
      done: step('clean'),
    },
    {
      id: 'probe', tool: 'probe', title: L ? 'Test the dark patch' : 'Test the mark',
      text: L ? `Tap the circled spot on the ${where(L.claw)} claw with the hoof testers. If it springs, something soft is under there.`
        : `Tap the circled mark on the ${where(M.claw)} claw with the hoof testers. Something sore springs or makes her flinch; an old mark stays firm.`,
      target: { kind: 'ring', x: M.x, y: M.y, r: M.r * 2 },
      done: step('diagnose'),
    },
    {
      id: 'nipInner', tool: 'nippers', title: 'Nip the inner toe',
      text: `${cap(where(CLAW.INNER))} claw first. Bite the very tip of the long toe, then work back to the dashed trim line. Too deep a bite takes nothing.`,
      target: { kind: 'rect', ...toeRect(box(CLAW.INNER)) },
      measure: (m) => inner(m).deadRemain, goal: 0.12,
      done: (m) => inner(m).deadRemain < 0.12,
    },
    {
      id: 'grindInner', tool: 'grinder', title: 'Grind the inner sole',
      text: `Press and hold the grinder, gliding over the inner sole. Watch the gauge: stop near ${T} mm. Keep moving: lingering draws blood.${keepOff(CLAW.INNER, 'Keep the disc off the red ring: that’s knife work.')}`,
      target: { kind: 'rect', ...soleRect(box(CLAW.INNER)), ...avoidOn(CLAW.INNER) },
      measure: (m) => inner(m).wbMean, goal: T + TOL,
      done: step('step1'),
    },
    {
      id: 'nipOuter', tool: 'nippers', title: 'Nip the outer toe',
      text: `Same again on the ${where(CLAW.OUTER)} claw: start at the tip and bite back to the trim line.`,
      target: { kind: 'rect', ...toeRect(box(CLAW.OUTER)) },
      measure: (m) => outer(m).deadRemain, goal: 0.12,
      done: (m) => outer(m).deadRemain < 0.12,
    },
    {
      id: 'grindOuter', tool: 'grinder', title: 'Match the outer claw',
      text: `Grind the outer sole down until the balance beam at the top sits level. Matching the claws matters more than any one number.${keepOff(CLAW.OUTER, 'Keep the disc off the red ring.')}`,
      target: { kind: 'rect', ...soleRect(box(CLAW.OUTER)), ...avoidOn(CLAW.OUTER) },
      measure: (m) => Math.abs(m.levelDiff) + Math.max(0, outer(m).wbMean - T - TOL), goal: 0.6,
      done: step('step2'),
    },
    {
      id: 'dish', tool: 'knife', title: 'Dish out both claws',
      text: L ? 'With the hoof knife, press, hold and pull down the blue channels along the inner edge of each claw. That takes weight off the ulcer site. Dish around the red ring, not through it: the ulcer comes later.'
        : 'With the hoof knife, press, hold and pull down the blue channels along the inner edge of each claw. That takes weight off the spot where ulcers start.',
      target: { kind: 'rects', list: [dishRect(CLAW.INNER, side), dishRect(CLAW.OUTER, side)], ...(L ? { avoid: capRing } : {}) },
      measure: (m) => Math.max(inner(m).dishMean, outer(m).dishMean), goal: D + TOL,
      done: step('step3'),
    },
    {
      id: 'rasp', tool: 'rasp', title: 'Rasp it smooth',
      text: 'Scrub the rasp over both soles to true up the grinder marks before the block covers one.',
      target: { kind: 'rect', x: 50, y: 260, w: 300, h: 300 },
      measure: (m) => m.roughMean, goal: 0.15,
      done: step('finish'),
    },
    L && {
      id: 'openUlcer', tool: 'knife', title: 'Open the ulcer',
      text: 'Flick at the edge of the dark circle: short, quick strokes with the knife’s hook. The cap holds, then gives, and the knife comes off. Then flick the loose edge free with the knife on the ring, not inside it: the open ulcer is raw. Free it, but don’t strip the sole round it: if her block comes off, that ring is all she stands on.',
      target: { kind: 'ring', x: L.x, y: L.y, r: pareR },
      measure: (m) => m.looseRemain[LOOSE.ULCER], goal: 0.1,
      done: (m) => m.looseRemain[LOOSE.ULCER] < 0.1,
    },
    L && {
      id: 'block', tool: 'block', title: 'Block the sound claw',
      text: `Tap the ${where(sound)} claw to glue the block on. The sound claw takes her weight so the ulcer can rest.`,
      target: { kind: 'ring', ...clawRing(box(sound)) },
      done: step('step4'),
    },
    {
      id: 'heelHorn', tool: 'knife', title: 'Flick off the loose heel horn',
      text: `There’s a curl of loose horn at the ${CLAW_NAME[H.claw]} heel. One or two quick flicks of the knife lift it off. Leave the heel bulb itself alone.`,
      target: { kind: 'ring', x: H.x, y: H.y, r: H.r * 1.4 },
      measure: (m) => m.looseRemain[LOOSE.HEEL], goal: 0.1,
      done: step('step5'),
    },
    L && {
      id: 'spray', tool: 'spray', title: 'Flush the ulcer',
      text: 'Press and hold the spray bottle over the opened ulcer until it’s soaked.',
      target: { kind: 'ring', x: L.x, y: L.y, r: L.r * 1.75 },
      measure: (m) => -m.lesionTint, goal: -CFG.treat.tintMin,
      done: (m) => m.lesionTint >= CFG.treat.tintMin,
    },
    L && {
      id: 'wrap', tool: 'wrap', title: 'Pad and wrap',
      text: `Tap the treated ${CLAW_NAME[L.claw]} claw: the first tap presses on the white pad, the second wraps it in pink.`,
      target: { kind: 'ring', ...clawRing(box(L.claw)) },
      done: step('treat'),
    },
  ];
  // The beats that work the lesion are left out for a routine cow.
  return beats.filter(Boolean);
}

// Tracks which beat is current and how far along it is.
export class Tutorial {
  constructor(caseDef) {
    this.beats = tutorialBeats(caseDef);
    this.index = -1;
    this.start = 0;
    this.progress = 0;
  }

  get beat() { return this.beats[this.index] ?? null; }
  get finished() { return this.index >= this.beats.length; }

  // Re-evaluate against the latest metrics. Returns true when the beat changed.
  update(m, session, hoof) {
    const next = this.beats.findIndex((b) => !b.done(m, session, hoof));
    const idx = next < 0 ? this.beats.length : next;
    const changed = idx !== this.index;
    if (changed) {
      this.index = idx;
      const b = this.beat;
      this.start = b?.measure ? b.measure(m) : 0;
    }
    const b = this.beat;
    this.progress = !b ? 1 : b.measure ? toward(b.measure(m), this.start, b.goal) : 0;
    return changed;
  }
}
