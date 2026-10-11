// Guided first run: the same case, broken into small coached beats. Each beat
// names a tool, highlights where to work, says what to do, and shows progress.
// Pure data + predicates over hoof metrics — no DOM, so it can be tested.

import { CFG, tolOf } from './config.js';
import { CLAW, CLAW_NAME, LOOSE, GEOM, clawBox, clawWhere, dishRect, soundClaw } from './hoof.js';
import { STEPS } from './steps.js';

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
  return [
    {
      id: 'clean', tool: 'brush', title: 'Clean the foot',
      text: 'Hold the wire brush on the foot and scrub back and forth. You can’t read a dirty foot.',
      target: { kind: 'rect', x: 50, y: 180, w: 300, h: 450 },
      measure: (m) => m.mudMean, goal: 0.12,
      done: step('clean'),
    },
    {
      id: 'probe', tool: 'probe', title: 'Test the dark patch',
      text: `Tap the circled spot on the ${where(L.claw)} claw with the hoof testers. If it springs, something soft is under there.`,
      target: { kind: 'ring', x: L.x, y: L.y, r: L.r * 2 },
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
      text: `Press and hold the grinder, gliding over the inner sole. Watch the gauge: stop near ${T} mm. Keep moving: lingering draws blood.`,
      target: { kind: 'rect', ...soleRect(box(CLAW.INNER)) },
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
      text: 'Grind the outer sole down until the balance beam at the top sits level. Matching the claws matters more than any one number.',
      target: { kind: 'rect', ...soleRect(box(CLAW.OUTER)) },
      measure: (m) => Math.abs(m.levelDiff) + Math.max(0, outer(m).wbMean - T - TOL), goal: 0.6,
      done: step('step2'),
    },
    {
      id: 'dish', tool: 'knife', title: 'Dish out both claws',
      text: 'With the hoof knife, press, hold and pull down the blue channels along the inner edge of each claw. That takes weight off the ulcer site.',
      target: { kind: 'rects', list: [dishRect(CLAW.INNER, side), dishRect(CLAW.OUTER, side)] },
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
    {
      id: 'openUlcer', tool: 'knife', title: 'Open the ulcer',
      text: 'Pull the knife across the circle to flake off the loose horn capping the ulcer. Stop when the ring fills. Open it, don’t carve it.',
      target: { kind: 'ring', x: L.x, y: L.y, r: L.r * 1.75 },
      measure: (m) => m.looseRemain[LOOSE.ULCER], goal: 0.1,
      done: (m) => m.looseRemain[LOOSE.ULCER] < 0.1,
    },
    {
      id: 'block', tool: 'block', title: 'Block the sound claw',
      text: `Tap the ${where(sound)} claw to glue the block on. The sound claw takes her weight so the ulcer can rest.`,
      target: { kind: 'ring', ...clawRing(box(sound)) },
      done: step('step4'),
    },
    {
      id: 'heelHorn', tool: 'knife', title: 'Flick off the loose heel horn',
      text: `There’s a curl of loose horn at the ${CLAW_NAME[H.claw]} heel. One or two short pulls with the knife flick it off. Leave the heel bulb itself alone.`,
      target: { kind: 'ring', x: H.x, y: H.y, r: H.r * 1.4 },
      measure: (m) => m.looseRemain[LOOSE.HEEL], goal: 0.1,
      done: step('step5'),
    },
    {
      id: 'spray', tool: 'spray', title: 'Flush the ulcer',
      text: 'Press and hold the spray bottle over the opened ulcer until it’s soaked.',
      target: { kind: 'ring', x: L.x, y: L.y, r: L.r * 1.75 },
      measure: (m) => -m.lesionTint, goal: -CFG.treat.tintMin,
      done: (m) => m.lesionTint >= CFG.treat.tintMin,
    },
    {
      id: 'wrap', tool: 'wrap', title: 'Pad and wrap',
      text: `Tap the treated ${CLAW_NAME[L.claw]} claw: the first tap presses on the white pad, the second wraps it in pink.`,
      target: { kind: 'ring', ...clawRing(box(L.claw)) },
      done: step('treat'),
    },
  ];
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
