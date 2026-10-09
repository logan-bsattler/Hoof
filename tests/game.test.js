import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, CLAW, LOOSE } from '../src/hoof.js';
import { CASE_B } from '../src/case.js';
import { applyStroke, applyGrind, applyBite } from '../src/tools.js';
import { evaluateSteps } from '../src/steps.js';
import { newSession, scoreCase } from '../src/scoring.js';

const { target: T, dishTarget: D } = CFG.sole;

// Put the hoof into the state a perfect trimmer would leave it in.
function idealTrim(hoof) {
  for (let i = 0; i < hoof.n; i++) {
    if (!hoof.claw[i]) continue;
    const z = hoof.zone[i];
    hoof.mud[i] = 0;
    hoof.loose[i] = 0;
    if (z & Z.DEAD) { hoof.thick[i] = 0; continue; }
    if (z & (Z.HEEL | Z.ULCER)) { hoof.rough[i] = 0; continue; }
    hoof.thick[i] = z & Z.DISH ? D : T;
    hoof.rough[i] = 0;
  }
  hoof.block = CLAW.INNER;
}

function idealSession() {
  return { ...newSession(), diagnosis: 'ulcer', diagnosisCorrect: true, firstCutClaw: CLAW.INNER, blockAttempts: [CLAW.INNER] };
}

test('hoof builds two claws with overgrown toes, an ulcer, and loose heel horn', () => {
  const h = new Hoof(CASE_B);
  const m = h.metrics();
  assert.ok(m.claws[CLAW.OUTER].wbN > 500 && m.claws[CLAW.INNER].wbN > 500);
  assert.ok(m.claws[CLAW.OUTER].deadN > 50 && m.claws[CLAW.INNER].deadN > 50);
  assert.ok(m.claws[CLAW.OUTER].wbMean > m.claws[CLAW.INNER].wbMean + 1.5, 'outer claw starts taller');
  assert.ok(m.looseN[LOOSE.ULCER] > 0 && m.looseN[LOOSE.HEEL] > 0);
  assert.ok(m.mudMean > 0.7, 'starts caked in mud');
});

test('brush clears mud without touching horn', () => {
  const h = new Hoof(CASE_B);
  const before = Float32Array.from(h.thick);
  for (let k = 0; k < 40; k++) applyStroke(h, 'brush', 280, 400, 10);
  assert.deepEqual(h.thick, before);
  assert.ok(h.mud[h.cellAt(280, 400)] < 0.1);
});

test('lingering with the grinder draws blood', () => {
  const h = new Hoof(CASE_B);
  let blood = false;
  for (let k = 0; k < 400 && !blood; k++) blood = applyGrind(h, 280, 400, 1 / 60).blood;
  assert.ok(blood);
});

test('nippers remove dead toe horn entirely', () => {
  const h = new Hoof(CASE_B);
  const ev = applyBite(h, 222, 170);
  assert.ok(ev.dead > 0);
  assert.equal(ev.blood, false);
});

test('knife opening the ulcer clears loose horn first', () => {
  const h = new Hoof(CASE_B);
  const L = CASE_B.lesion;
  const ev = applyStroke(h, 'knife', L.x, L.y, 3);
  assert.ok(ev.loose[LOOSE.ULCER] > 0);
  assert.equal(ev.blood, false);
});

test('an ideal trim completes every step and grades Textbook', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  const s = idealSession();
  const m = h.metrics();
  const { status, current } = evaluateSteps(m, s, h, 1);
  assert.equal(current, -1, `unfinished: ${status.filter((x) => !x.done).map((x) => x.id)}`);
  const r = scoreCase(m, s, h, CASE_B);
  assert.equal(r.grade, 'Textbook');
  assert.equal(r.gait, 'sound');
});

test('blocking the sore claw costs correctness and soundness', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  h.block = CLAW.OUTER;
  const s = { ...idealSession(), blockAttempts: [CLAW.OUTER] };
  const r = scoreCase(h.metrics(), s, h, CASE_B);
  assert.ok(r.parts.correctness <= 45);
  assert.notEqual(r.gait, 'sound');
});

test('drawing blood fails the case', () => {
  const h = new Hoof(CASE_B);
  const s = { ...idealSession(), blood: true };
  const r = scoreCase(h.metrics(), s, h, CASE_B);
  assert.equal(r.failed, true);
  assert.equal(r.total, 0);
});

// Set every weight-bearing cell of one claw to a given sole thickness.
function setClawSole(hoof, claw, mm) {
  for (let i = 0; i < hoof.n; i++) {
    const z = hoof.zone[i];
    if (hoof.claw[i] !== claw || !(z & Z.LIVE) || (z & (Z.HEEL | Z.ULCER | Z.DISH)) || hoof.looseInit[i]) continue;
    hoof.thick[i] = mm;
  }
}

test('over-trimmed inner claw still completes step 1 and unlocks step 2', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  setClawSole(h, CLAW.INNER, 5.9);
  const { status } = evaluateSteps(h.metrics(), idealSession(), h, 1);
  const st = Object.fromEntries(status.map((x) => [x.id, x.done]));
  assert.equal(st.step1, true);
  assert.equal(st.step2, false, 'outer at 7 mm is 1.1 mm off the inner claw');
  // Matching the outer claw to the inner's actual height completes step 2.
  setClawSole(h, CLAW.OUTER, 5.9);
  assert.equal(evaluateSteps(h.metrics(), idealSession(), h, 1).status.find((x) => x.id === 'step2').done, true);
});

test('a claw still above the band does not complete step 1', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  setClawSole(h, CLAW.INNER, 8.0);
  assert.equal(evaluateSteps(h.metrics(), idealSession(), h, 1).status[2].done, false);
});

test('over-trimming scores lower than trimming to target', () => {
  const good = new Hoof(CASE_B);
  idealTrim(good);
  const over = new Hoof(CASE_B);
  idealTrim(over);
  setClawSole(over, CLAW.INNER, 5.9);
  setClawSole(over, CLAW.OUTER, 5.9);
  const rGood = scoreCase(good.metrics(), idealSession(), good, CASE_B);
  const rOver = scoreCase(over.metrics(), idealSession(), over, CASE_B);
  assert.ok(rOver.total < rGood.total - 10, `${rOver.total} vs ${rGood.total}`);
  assert.ok(rOver.notes.some((n) => n.includes('over-trimmed')));
});
