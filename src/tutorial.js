// Guided first run: the same case, broken into small coached beats. Each beat
// names a tool, highlights where to work, says what to do, and shows progress.
// Pure data + predicates over hoof metrics — no DOM, so it can be tested.

import { CFG } from './config.js';
import { CLAW, LOOSE, GEOM } from './hoof.js';
import { STEPS } from './steps.js';

const { target: T, dishTarget: D, tolerance: TOL } = CFG.sole;
const step = (id) => STEPS.find((s) => s.id === id).done;
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// Progress from a start value toward a goal value (either direction).
const toward = (cur, start, goal) => (start === goal ? 1 : clamp01((start - cur) / (start - goal)));

// Mirror an inner-claw x onto the outer claw.
const out = (x) => CFG.view.w - x;

export function tutorialBeats(caseDef) {
  const L = caseDef.lesion;
  const H = caseDef.looseHorn;
  const inner = (m) => m.claws[CLAW.INNER];
  const outer = (m) => m.claws[CLAW.OUTER];
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
      text: 'Tap the circled spot on the outer (left) claw with the hoof testers. If it springs, something soft is under there.',
      target: { kind: 'ring', x: L.x, y: L.y, r: L.r * 2 },
      done: step('diagnose'),
    },
    {
      id: 'nipInner', tool: 'nippers', title: 'Nip the inner toe',
      text: 'Inner (right) claw first. Bite at the very tip of the overgrown toe, then work back toward the dashed trim line. A bite that’s too deep takes nothing.',
      target: { kind: 'rect', x: 205, y: 555, w: 150, h: 75 },
      measure: (m) => inner(m).deadRemain, goal: 0.12,
      done: (m) => inner(m).deadRemain < 0.12,
    },
    {
      id: 'grindInner', tool: 'grinder', title: 'Grind the inner sole',
      text: `Press and hold the grinder, gliding over the inner sole. Watch the gauge: stop near ${T} mm. Keep moving: lingering draws blood.`,
      target: { kind: 'rect', x: 215, y: 270, w: 130, h: 260 },
      measure: (m) => inner(m).wbMean, goal: T + TOL,
      done: step('step1'),
    },
    {
      id: 'nipOuter', tool: 'nippers', title: 'Nip the outer toe',
      text: 'Same again on the outer (left) claw: start at the tip and bite back to the trim line.',
      target: { kind: 'rect', x: out(355), y: 555, w: 150, h: 75 },
      measure: (m) => outer(m).deadRemain, goal: 0.12,
      done: (m) => outer(m).deadRemain < 0.12,
    },
    {
      id: 'grindOuter', tool: 'grinder', title: 'Match the outer claw',
      text: 'Grind the outer sole down until the balance beam at the top sits level. Matching the claws matters more than any one number.',
      target: { kind: 'rect', x: out(345), y: 270, w: 130, h: 260 },
      measure: (m) => Math.abs(m.levelDiff) + Math.max(0, outer(m).wbMean - T - TOL), goal: 0.6,
      done: step('step2'),
    },
    {
      id: 'dish', tool: 'knife', title: 'Dish out both claws',
      text: 'With the hoof knife, press, hold and pull down the blue channels along the inner edge of each claw. That takes weight off the ulcer site.',
      target: { kind: 'rects', list: [
        { x: 212, y: GEOM.dishY0, w: 42, h: GEOM.dishY1 - GEOM.dishY0 },
        { x: out(254), y: GEOM.dishY0, w: 42, h: GEOM.dishY1 - GEOM.dishY0 },
      ] },
      measure: (m) => Math.max(inner(m).dishMean, outer(m).dishMean), goal: D + TOL,
      done: step('step3'),
    },
    {
      id: 'openUlcer', tool: 'knife', title: 'Open the ulcer',
      text: 'Pull the knife across the circle. Each pull flakes off the loose horn capping the ulcer. Keep going until the ring fills and the flakes stop. Open it, don’t carve it.',
      target: { kind: 'ring', x: L.x, y: L.y, r: L.r * 1.75 },
      measure: (m) => m.looseRemain[LOOSE.ULCER], goal: 0.1,
      done: (m) => m.looseRemain[LOOSE.ULCER] < 0.1,
    },
    {
      id: 'block', tool: 'block', title: 'Block the sound claw',
      text: 'Tap the inner (right) claw to glue the block on. The sound claw takes her weight so the ulcer can rest.',
      target: { kind: 'ring', x: 280, y: 400, r: 70 },
      done: step('step4'),
    },
    {
      id: 'heelHorn', tool: 'knife', title: 'Flick off the loose heel horn',
      text: 'There’s a curl of loose horn at the inner heel. One or two short pulls with the knife flick it off. Leave the heel bulb itself alone.',
      target: { kind: 'ring', x: H.x, y: H.y, r: H.r * 1.4 },
      measure: (m) => m.looseRemain[LOOSE.HEEL], goal: 0.1,
      done: step('step5'),
    },
    {
      id: 'rasp', tool: 'rasp', title: 'Rasp it smooth',
      text: 'Scrub the rasp over both soles to true up the grinder marks before anything gets covered.',
      target: { kind: 'rect', x: 50, y: 260, w: 300, h: 300 },
      measure: (m) => m.roughMean, goal: 0.15,
      done: step('finish'),
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
      text: 'Tap the treated outer claw: the first tap presses on the white pad, the second wraps it in pink.',
      target: { kind: 'ring', x: out(280), y: 400, r: 70 },
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
