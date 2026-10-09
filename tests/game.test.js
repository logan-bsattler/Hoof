import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, CLAW, LOOSE, GEOM } from '../src/hoof.js';
import { CASE_B } from '../src/case.js';
import { applyStroke, applyGrind, applyBite, applySpray, applyWrap, TOOL_ORDER as TOOLS_OK } from '../src/tools.js';
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
  for (let i = 0; i < hoof.n; i++) if (hoof.looseInit[i] === LOOSE.ULCER) hoof.tint[i] = 1;
  hoof.block = CLAW.INNER;
  hoof.wrap = 2;
  hoof.wrapClaw = CLAW.OUTER;
}

// Centre of the first cell matching a predicate.
function findCell(hoof, pred) {
  for (let i = 0; i < hoof.n; i++) if (hoof.claw[i] && pred(i)) return [hoof.cellX(i), hoof.cellY(i)];
  throw new Error('no matching cell');
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
  const [x, y] = findCell(h, (i) => (h.zone[i] & Z.DEAD) && h.claw[i] === CLAW.INNER && h.cellY(i) > 600);
  const ev = applyBite(h, x, y);
  assert.ok(ev.dead > 0);
  assert.equal(ev.blood, false);
});

test('nippers work tip first: a deep bite takes nothing, tip-to-hoof bites clear the toe', () => {
  const h = new Hoof(CASE_B);
  const deadLeft = () => h.metrics().claws[CLAW.INNER].deadLeft;
  const start = deadLeft();
  // Bite right at the toe line with the whole overgrowth still on: too much horn.
  const deep = applyBite(h, 300, GEOM.overgrowY + 20);
  assert.equal(deep.tooDeep, true);
  assert.equal(deep.removed, 0);
  assert.equal(deadLeft(), start);
  // Work up from the tip in small bites across the toe.
  for (let y = 640; y >= GEOM.overgrowY; y -= 8) {
    for (let x = 200; x <= 370; x += 16) applyBite(h, x, y);
  }
  assert.ok(deadLeft() < start * 0.1, `dead left: ${deadLeft()} of ${start}`);
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

test('foot is presented heels-up: heel bulbs at the top, overgrown toes at the bottom', () => {
  const h = new Hoof(CASE_B);
  let heelY = 0, heelN = 0, deadY = 0, deadN = 0;
  for (let i = 0; i < h.n; i++) {
    if (h.zone[i] & Z.HEEL) { heelY += h.cellY(i); heelN++; }
    if (h.zone[i] & Z.DEAD) { deadY += h.cellY(i); deadN++; }
  }
  assert.ok(heelY / heelN < GEOM.heelY && deadY / deadN > GEOM.triY);
  assert.ok(CASE_B.lesion.y < GEOM.dishY1, 'ulcer sits at the sole/heel junction, near the top');
});

test('spray soaks the opened ulcer, and paring washes it out again', () => {
  const h = new Hoof(CASE_B);
  const L = CASE_B.lesion;
  for (let i = 0; i < h.n; i++) if (h.looseInit[i] === LOOSE.ULCER) h.loose[i] = 0; // opened
  let ev;
  for (let k = 0; k < 90; k++) ev = applySpray(h, L.x, L.y, 1 / 60);
  assert.ok(ev.sprayLesion > 0);
  const flushed = h.metrics().lesionTint;
  assert.ok(flushed >= CFG.treat.tintMin, `tint ${flushed}`);
  for (let k = 0; k < 10; k++) applyStroke(h, 'knife', L.x, L.y + k, 3);
  assert.ok(h.metrics().lesionTint < flushed, 'paring needs another flush');
});

test('pad + wrap only goes on a flushed, opened ulcer once the trim is done', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  h.wrap = 0; h.wrapClaw = CLAW.NONE;
  const m = h.metrics();
  assert.equal(applyWrap(h, CLAW.INNER, m, true).reason, 'sound');
  assert.equal(applyWrap(h, CLAW.OUTER, m, false).reason, 'early');
  assert.equal(applyWrap(h, CLAW.OUTER, m, true).stage, 1);
  assert.equal(applyWrap(h, CLAW.OUTER, m, true).stage, 2);
  assert.equal(applyWrap(h, CLAW.OUTER, m, true).reason, 'done');
  // Wrapped horn can't be cut.
  const L = CASE_B.lesion;
  const ev = applyStroke(h, 'knife', L.x, L.y + 40, 5);
  assert.equal(ev.removed, 0);
  assert.ok(ev.blockedSkip);

  const raw = new Hoof(CASE_B);
  assert.equal(applyWrap(raw, CLAW.OUTER, raw.metrics(), true).reason, 'closed');
});

test('an untreated ulcer leaves the treat step open and costs correctness', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  h.wrap = 0;
  const s = idealSession();
  const m = h.metrics();
  const { status } = evaluateSteps(m, s, h, 1);
  assert.equal(status.find((x) => x.id === 'treat').done, false);
  const r = scoreCase(m, s, h, CASE_B);
  assert.ok(r.parts.correctness <= 90);
  assert.ok(r.notes.some((n) => n.includes('untreated')));
});

test('guided run starts at cleaning, tracks progress, and finishes on an ideal trim', async () => {
  const { Tutorial } = await import('../src/tutorial.js');
  const h = new Hoof(CASE_B);
  const t = new Tutorial(CASE_B);
  t.update(h.metrics(), newSession(), h);
  assert.equal(t.beat.id, 'clean');
  assert.equal(t.progress, 0);
  for (let k = 0; k < 20; k++) applyStroke(h, 'brush', 200, 400, 10);
  t.update(h.metrics(), newSession(), h);
  assert.ok(t.progress > 0, 'brushing moves the progress bar');
  // Every beat has a tool and a target.
  for (const b of t.beats) assert.ok(TOOLS_OK.includes(b.tool) && b.target, b.id);
  idealTrim(h);
  t.update(h.metrics(), idealSession(), h);
  assert.equal(t.finished, true);
});
