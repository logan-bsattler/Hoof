import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, CLAW, LOOSE, GEOM, soundClaw, insideClaw } from '../src/hoof.js';
import { CASE_B, makeCase, dealCase } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';
import { stepsFor } from '../src/steps.js';
import { applyStroke, applyGrind, applyBite, applySpray, applyWrap, TOOL_ORDER as TOOLS_OK } from '../src/tools.js';
import { evaluateSteps } from '../src/steps.js';
import { newSession, scoreCase, judgeBlood } from '../src/scoring.js';

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
  hoof.block = soundClaw(hoof.caseDef);
  if (!hoof.caseDef.lesion) return; // a sound foot gets no block and no wrap
  hoof.wrap = 2;
  hoof.wrapClaw = hoof.caseDef.lesion.claw;
}

// Centre of the first cell matching a predicate.
function findCell(hoof, pred) {
  for (let i = 0; i < hoof.n; i++) if (hoof.claw[i] && pred(i)) return [hoof.cellX(i), hoof.cellY(i)];
  throw new Error('no matching cell');
}

function idealSession(cd = CASE_B) {
  return {
    ...newSession(), diagnosis: cd.diagnosis, diagnosisCorrect: true,
    probes: cd.lesion ? [cd.lesion.type] : cd.findings.map((f) => f.kind),
    firstCutClaw: CLAW.INNER, blockAttempts: cd.lesion ? [soundClaw(cd)] : [],
  };
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

test('the block does not lock out the loose heel horn or the rasp step', () => {
  const h = new Hoof(CASE_B);
  h.block = CLAW.INNER;
  const H = CASE_B.looseHorn;
  const ev = applyStroke(h, 'knife', H.x, H.y, 4);
  assert.ok(ev.loose[LOOSE.HEEL] > 0, 'knife reaches the heel horn on the blocked claw');
  // Rough inner sole under the block, smooth outer sole: the finish step only sees the outer.
  for (let i = 0; i < h.n; i++) if (h.claw[i]) h.rough[i] = h.claw[i] === CLAW.INNER ? 1 : 0;
  assert.ok(h.metrics().roughMean < 0.15, 'horn under the block no longer counts toward finish');
});

test('cuts ease in above target: full rate well above, slowed near, `resist` below', () => {
  const h = new Hoof(CASE_B);
  const [x, y] = findCell(h, (i) => (h.zone[i] & Z.LIVE) && !(h.zone[i] & (Z.HEEL | Z.DISH | Z.ULCER | Z.WALL)) &&
    !h.looseInit[i] && h.claw[i] === CLAW.INNER && h.cellY(i) > 380 && h.zoneTarget(i) === T);
  const i = h.cellAt(x, y);
  const { rate, resist } = CFG.tools.grinder;
  const dt = 0.001;
  // Removal at the cell itself (falloff 1 at the disc centre) from a given starting thickness.
  const removedFrom = (mm) => {
    h.thick[i] = mm;
    applyGrind(h, h.cellX(i), h.cellY(i), dt);
    return (mm - h.thick[i]) / (rate * dt);
  };
  assert.ok(Math.abs(removedFrom(T + 2) - 1) < 0.01, 'full rate 2 mm above target');
  assert.ok(removedFrom(T + 0.5) < 0.7, 'slowed 0.5 mm above target');
  assert.ok(Math.abs(removedFrom(T - 0.5) - resist) < 0.01, '`resist` below target');
});

test('grinder danger is quiet on a fresh hoof and loud over thin horn', () => {
  const h = new Hoof(CASE_B);
  const [x, y] = [280, 400];
  assert.ok(applyGrind(h, x, y, 0.001).danger < 0.05, 'fresh hoof');
  h.thick[h.cellAt(x, y)] = 3.2;
  assert.ok(applyGrind(h, x, y, 0.001).danger > 0.8, 'one thin cell under the disc');
});

test('a shallow first nick is graded, a second nick or a deep cut fails', () => {
  const s = newSession();
  assert.equal(judgeBlood(s, 2), 'nick');
  assert.equal(s.blood, false);
  assert.equal(judgeBlood(s, 1), 'fail', 'second nick');
  assert.equal(s.blood, true);
  const deep = newSession();
  assert.equal(judgeBlood(deep, CFG.nick.maxCells + 1), 'fail', 'deep cut');
});

test('a nicked but otherwise ideal trim still scores, capped at Sound with a Restraint cost', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  const clean = scoreCase(h.metrics(), idealSession(), h, CASE_B);
  const s = idealSession();
  judgeBlood(s, 1);
  const r = scoreCase(h.metrics(), s, h, CASE_B);
  assert.equal(r.failed, false);
  assert.equal(r.grade, CFG.nick.capGrade);
  assert.equal(r.parts.restraint, clean.parts.restraint - CFG.nick.restraint);
  assert.ok(r.notes.some((n) => n.includes('nicked')));
  judgeBlood(s, 1);
  assert.equal(scoreCase(h.metrics(), s, h, CASE_B).failed, true, 'two nicks fail');
});

// Case B with the ulcer moved to the inner claw: the block, wrap and heel horn all swap claws.
const CASE_B_INNER = {
  ...CASE_B,
  lesion: { ...CASE_B.lesion, claw: CLAW.INNER, x: 2 * GEOM.midX - CASE_B.lesion.x },
  looseHorn: { ...CASE_B.looseHorn, claw: CLAW.OUTER, x: 2 * GEOM.midX - CASE_B.looseHorn.x },
  findings: [],
};

async function idealRun(cd) {
  const { Tutorial } = await import('../src/tutorial.js');
  const h = new Hoof(cd);
  idealTrim(h);
  const m = h.metrics();
  const { status } = evaluateSteps(m, idealSession(cd), h, 1);
  // The guided run is written for the ulcer case only.
  const t = cd.condition === 'ulcer' ? new Tutorial(cd) : null;
  t?.update(m, idealSession(cd), h);
  return { h, status, r: scoreCase(m, idealSession(cd), h, cd), t };
}

test('an ulcer on the inner claw: every step completes on the outer-claw block, Textbook', async () => {
  const { status, r, t } = await idealRun(CASE_B_INNER);
  for (const s of status) assert.ok(s.done, s.id);
  assert.equal(r.grade, 'Textbook', r.notes.join(' | '));
  assert.equal(r.gait, 'sound');
  assert.equal(t.finished, true);
});

test('decoys read firm under the testers; the ulcer springs', () => {
  const h = new Hoof(CASE_B);
  for (let i = 0; i < h.n; i++) h.mud[i] = 0;
  for (const f of CASE_B.findings) {
    const r = h.probe(h.cellAt(f.x, f.y), false);
    assert.equal(r.kind, f.kind === 'ulcer' ? 'lesion' : f.kind, f.kind);
    assert.equal(r.finding, f);
  }
  const stain = CASE_B.findings.find((f) => f.kind === 'stain');
  assert.match(h.probe(h.cellAt(stain.x, stain.y), false).text, /firm/i);
  // Trimmed away, a stain is just horn.
  h.thick[h.cellAt(stain.x, stain.y)] -= 1.5;
  assert.equal(h.probe(h.cellAt(stain.x, stain.y), false).kind, 'firm');
});

test('committing a read without testing the ulcer scores as an unread lesion', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  const s = { ...idealSession(), probes: ['stain'] };
  const r = scoreCase(h.metrics(), s, h, CASE_B);
  assert.equal(r.parts.correctness, 75);
  assert.ok(r.notes.some((n) => n.includes('never tested')));
});

test('Case B is the hand-placed ulcer, unchanged by the condition registry', () => {
  assert.equal(CASE_B.id, 'B');
  assert.equal(CASE_B.condition, 'ulcer');
  assert.equal(CASE_B.side, 'LH');
  assert.deepEqual(CASE_B.excess, { [CLAW.OUTER]: 4.6, [CLAW.INNER]: 2.4 });
  assert.deepEqual(CASE_B.lesion, { type: 'ulcer', claw: CLAW.OUTER, x: 172, y: 288, r: 12 });
  assert.deepEqual(CASE_B.looseHorn, { claw: CLAW.INNER, x: 292, y: 228, r: 11 });
  assert.deepEqual(CASE_B.findings.map((f) => [f.kind, f.x, f.y, f.r]), [['ulcer', 172, 288, 12], ['stain', 262, 300, 13], ['bruise', 122, 430, 11]]);
  assert.deepEqual(stepsFor(CASE_B).map((s) => s.id),
    ['clean', 'diagnose', 'step1', 'step2', 'step3', 'finish', 'step4', 'step5', 'treat']);
});

test('makeCase: a side mod changes only the side, and unknown conditions throw', () => {
  const a = makeCase('ulcer', 77), b = makeCase('ulcer', 77, { side: a.side === 'LH' ? 'RH' : 'LH' });
  assert.notEqual(a.side, b.side);
  assert.deepEqual(a.excess, b.excess);
  assert.throws(() => makeCase('nope', 1), /Unknown condition/);
});

for (const id of Object.keys(CONDITIONS)) test(`${id}: 50 dealt cows all build, keep the lesion in its claw, and trim to Textbook`, async () => {
  const sides = new Set(), sore = new Set();
  for (let seed = 1; seed <= 50; seed++) {
    const cd = makeCase(id, seed);
    assert.equal(cd.condition, id);
    assert.ok(stepsFor(cd).every(Boolean), `seed ${seed}: every step id exists`);
    const L = cd.lesion;
    sides.add(cd.side); sore.add(L?.claw);
    if (L) assert.ok(insideClaw(L.claw, L.x, L.y, cd.side, 4), `seed ${seed}: lesion outside its claw`);
    assert.ok(insideClaw(cd.looseHorn.claw, cd.looseHorn.x, cd.looseHorn.y, cd.side, 4), `seed ${seed}: heel horn`);
    assert.ok(cd.excess[CLAW.OUTER] > cd.excess[CLAW.INNER], `seed ${seed}: outer overgrows most`);
    assert.ok(cd.findings.length >= (L ? 2 : 1), `seed ${seed}: at least one decoy`);
    for (const f of cd.findings) assert.ok(insideClaw(f.claw, f.x, f.y, cd.side, 4), `seed ${seed}: ${f.kind} outside its claw`);
    const { h, status, r, t } = await idealRun(cd);
    if (L) assert.ok(h.metrics().looseN[LOOSE.ULCER] > 10, `seed ${seed}: ulcer cells`);
    else assert.equal(h.metrics().looseN[LOOSE.ULCER], 0, `seed ${seed}: no ulcer cells on a sound foot`);
    for (const s of status) assert.ok(s.done, `seed ${seed}: ${s.id}`);
    assert.equal(r.grade, 'Textbook', `seed ${seed}: ${r.total} ${r.notes.join(' | ')}`);
    if (t) assert.equal(t.finished, true, `seed ${seed}: tutorial`);
  }
  assert.equal(sides.size, 2, 'both hind feet dealt');
  if (CONDITIONS[id].steps.includes('step4')) assert.equal(sore.size, 2, 'both claws carry the lesion');
});

test('routine: opening a decoy, a needless block or a misread all cost points', () => {
  const cd = makeCase('routine', 3);
  const clean = new Hoof(cd);
  idealTrim(clean);
  const base = scoreCase(clean.metrics(), idealSession(cd), clean, cd);
  assert.equal(base.grade, 'Textbook', base.notes.join(' | '));

  const dug = new Hoof(cd);
  idealTrim(dug);
  const f = cd.findings[0];
  dug.stampExact(f.x, f.y, f.r, (i) => { if (dug.claw[i] === f.claw) dug.thick[i] = Math.max(0.5, dug.zoneTarget(i) - 2); });
  const rDug = scoreCase(dug.metrics(), idealSession(cd), dug, cd);
  assert.ok(rDug.parts.restraint < base.parts.restraint, 'digging a decoy costs restraint');
  assert.ok(rDug.notes.some((n) => /dug into a mark/.test(n)), rDug.notes.join(' | '));

  const blocked = new Hoof(cd);
  idealTrim(blocked);
  blocked.block = CLAW.OUTER;
  const rBlock = scoreCase(blocked.metrics(), idealSession(cd), blocked, cd);
  assert.ok(rBlock.parts.correctness <= base.parts.correctness - 20, 'needless block');

  const s = { ...idealSession(cd), diagnosis: 'ulcer', diagnosisCorrect: false };
  assert.ok(scoreCase(clean.metrics(), s, clean, cd).parts.correctness < base.parts.correctness, 'misread');
});

test('dealCase deals both conditions, and the same seed deals the same cow', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) seen.add(dealCase(seed).condition);
  assert.deepEqual([...seen].sort(), Object.keys(CONDITIONS).sort());
  assert.deepEqual(dealCase(99), dealCase(99));
});

test('weight test: an ideal trim stands on the blocked sound claw, never on the ulcer', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  const map = h.contactMap();
  let onBlock = 0, onSore = 0, onUlcer = 0;
  for (let i = 0; i < map.length; i++) {
    if (!map[i]) continue;
    if (h.claw[i] === h.block) onBlock++; else onSore++;
    if (h.looseInit[i] === LOOSE.ULCER || (h.zone[i] & Z.ULCER)) onUlcer++;
  }
  assert.ok(onBlock > 50, `block contact ${onBlock}`);
  assert.equal(onSore, 0);
  assert.equal(onUlcer, 0);
  // Unblocked, both claws bear weight on their highest horn.
  h.block = 0;
  const free = h.contactMap();
  const claws = new Set([...free.keys()].filter((i) => free[i]).map((i) => h.claw[i]));
  assert.deepEqual([...claws].sort(), [CLAW.OUTER, CLAW.INNER]);
});

test('mobility score follows the gait: ideal is 0, a block on the sore claw is 3', () => {
  const h = new Hoof(CASE_B);
  idealTrim(h);
  assert.equal(scoreCase(h.metrics(), idealSession(), h, CASE_B).mobility, 0);
  h.block = CASE_B.lesion.claw;
  assert.equal(scoreCase(h.metrics(), idealSession(), h, CASE_B).mobility, 3);
});
