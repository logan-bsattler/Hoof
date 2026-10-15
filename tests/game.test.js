import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, CLAW, LOOSE, TRACT, LESION_LOOSE, GEOM, clawBox, soundClaw, insideClaw } from '../src/hoof.js';
import { CASE_B, makeCase, dealCase, dealMods, temperament } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';
import { stepsFor, stepLabel } from '../src/steps.js';
import { applyStroke, applyGrind, applyBite, applySpray, applyWrap, applyPry, TOOL_ORDER as TOOLS_OK } from '../src/tools.js';
import { evaluateSteps } from '../src/steps.js';
import { newSession, scoreCase, judgeBlood } from '../src/scoring.js';

const { target: T, dishTarget: D } = CFG.sole;

// Put the hoof into the state a perfect trimmer would leave it in.
function idealTrim(hoof) {
  // Foot rot (WP8.2) wants no trim: clean the foot and soak the split, nothing more.
  if (hoof.caseDef.requires?.trim === false) {
    for (let i = 0; i < hoof.n; i++) {
      if (!hoof.claw[i]) continue;
      hoof.mud[i] = 0;
      if (hoof.zone[i] & Z.ROT) hoof.tint[i] = 1;
    }
    return;
  }
  for (let i = 0; i < hoof.n; i++) {
    if (!hoof.claw[i]) continue;
    const z = hoof.zone[i];
    hoof.mud[i] = 0;
    hoof.loose[i] = 0;
    if (z & Z.DEAD) { hoof.thick[i] = 0; continue; }
    if (z & (Z.HEEL | Z.ULCER)) { hoof.rough[i] = 0; continue; }
    // Thin soles (WP13.1): the toes come off and the sole is left as she came in.
    if (hoof.caseDef.thinSole) continue;
    hoof.thick[i] = z & Z.DISH ? D : T;
    hoof.rough[i] = 0;
  }
  for (let i = 0; i < hoof.n; i++) {
    if (hoof.looseInit[i] === LOOSE.ULCER || (hoof.zone[i] & Z.DD)) hoof.tint[i] = 1;
    // The white-line track pared out as a groove below the sole, deepest at the pocket; a
    // puncture as a funnel, deepest on the mark, and flushed.
    const funnel = hoof.caseDef.lesion?.type === 'foreign';
    if (hoof.looseInit[i] === LOOSE.TRACT) hoof.thick[i] = hoof.zoneTarget(i) - ((hoof.tract[i] === TRACT.POCKET) !== funnel ? 2.5 : 1.5);
    // A pair's (J3) white-line abscess is flushed and wrapped like its ulcer.
    if ((funnel || hoof.lesions().length > 1) && hoof.looseInit[i] === LOOSE.TRACT) hoof.tint[i] = 1;
    if (hoof.looseInit[i] === LOOSE.NECRO) hoof.thick[i] = hoof.zoneTarget(i) - 1.5;
  }
  // DD needs no block; a case without a requires list (the hand-built ones) is an ulcer.
  if (hoof.caseDef.requires?.block ?? true) hoof.block = soundClaw(hoof.caseDef);
  if (hoof.caseDef.requires?.block === 'wood') hoof.blockKind = 'wood';
  if (!hoof.caseDef.lesion) return; // a sound foot gets no block and no wrap
  hoof.drained = hoof.lesions().some((L) => ['whiteline', 'foreign'].includes(L.type));
  if (!hoof.caseDef.requires.treat) return; // a drained abscess stays open to the air
  if (hoof.lesions().length > 1) { for (const L of hoof.lesions()) hoof.wrapAt[L.claw] = 2; return; }
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
    probes: cd.lesion ? (cd.lesions ?? [cd.lesion]).map((l) => l.type) : cd.findings.map((f) => f.kind),
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

test('the ulcer cap holds under the knife, then gives in one go', () => {
  const h = new Hoof(CASE_B);
  const L = CASE_B.lesion;
  const capped = () => { let k = 0; for (let i = 0; i < h.n; i++) if (h.looseInit[i] === LOOSE.ULCER && h.loose[i]) k++; return k; };
  const start = capped();
  // The first stroke only strains it: nothing lifts, nothing is cut.
  let ev = applyStroke(h, 'knife', L.x, L.y, 3);
  assert.ok(ev.capStrain > 0 && !ev.capPop);
  assert.equal(capped(), start);
  // Keep working it and it gives: the core and the horn round the blade lift together.
  let strokes = 1;
  while (!ev.capPop && strokes < 200) { ev = applyStroke(h, 'knife', L.x + (strokes % 2 ? 6 : -6), L.y, 3); strokes++; }
  assert.ok(ev.capPop, 'cap gave');
  assert.ok(h.capOpen);
  assert.ok(ev.loose[LOOSE.ULCER] > start * 0.25, `lifted ${ev.loose[LOOSE.ULCER]} of ${start}`);
  assert.ok(capped() > 0, 'an undermined rim is left to pare back');
  assert.equal(ev.blood, false);
});

test('once open, the core answers only to the flat of the knife, not its feathered edge', () => {
  const h = new Hoof(CASE_B);
  const L = CASE_B.lesion;
  let ev, k = 0;
  do ev = applyStroke(h, 'knife', L.x + (k++ % 2 ? 6 : -6), L.y, 3); while (!ev.capPop && k < 200);
  assert.ok(h.capOpen);
  const K = CFG.tools.knife;
  const flat = K.radius * Math.sqrt(1 - K.flat);
  // Blade centred just past where its flat would reach the core: the edge rides over it.
  const edge = applyStroke(h, 'knife', L.x + L.r + flat + 1, L.y, 3);
  assert.equal(edge.lesionCut, false);
  // Bring the flat onto it and she feels it.
  assert.equal(applyStroke(h, 'knife', L.x + L.r + flat - 3, L.y, 3).lesionCut, true);
});

test('the grinder skates over a closed ulcer cap', () => {
  const h = new Hoof(CASE_B);
  const L = CASE_B.lesion;
  let ev;
  for (let k = 0; k < 30; k++) ev = applyGrind(h, L.x, L.y, 1 / 60);
  assert.ok(ev.grinderLesion);
  assert.equal(h.capOpen, false);
  assert.equal(ev.loose[LOOSE.ULCER], 0);
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
  // A cow who needs a call gets it, and nothing she doesn't need.
  const s = cd.call ? { ...idealSession(cd), call: cd.call, firstCutClaw: null, blockAttempts: [] } : idealSession(cd);
  const { status } = evaluateSteps(m, s, h, 1);
  // The guided run is written for the ulcer case only.
  const t = cd.condition === 'ulcer' ? new Tutorial(cd) : null;
  t?.update(m, s, h);
  return { h, status, r: scoreCase(m, s, h, cd), t };
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
    if (L?.type === 'dd' || L?.type === 'footrot') assert.ok(h.metrics().ddN >= 8, `seed ${seed}: DD cells ${h.metrics().ddN}`);
    else if (L?.type === 'dds') assert.ok(h.zone.filter((z) => z & Z.SEPSIS).length > 10, `seed ${seed}: hole cells`);
    else if (L) assert.ok(h.metrics().looseN[LESION_LOOSE[L.type]] > 10, `seed ${seed}: lesion cells`);
    else assert.equal(h.metrics().looseN[LOOSE.ULCER] + h.metrics().looseN[LOOSE.TRACT], 0, `seed ${seed}: no lesion cells on a sound foot`);
    if (L?.path) {
      for (const [x, y] of [...L.path, [L.pocket.x, L.pocket.y]]) assert.ok(insideClaw(L.claw, x, y, cd.side, 4), `seed ${seed}: track outside its claw`);
      const kinds = new Set(h.tract.filter(Boolean));
      for (const k of [TRACT.ENTRY, TRACT.TRACK, TRACT.POCKET]) assert.ok(kinds.has(k), `seed ${seed}: tract part ${k}`);
    }
    for (const s of status) assert.ok(s.done, `seed ${seed}: ${s.id}`);
    assert.equal(r.grade, 'Textbook', `seed ${seed}: ${r.total} ${r.notes.join(' | ')}`);
    if (t) assert.equal(t.finished, true, `seed ${seed}: tutorial`);
  }
  assert.equal(sides.size, 2, 'both hind feet dealt');
  if (CONDITIONS[id].requires.block) assert.equal(sore.size, 2, 'both claws carry the lesion');
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
  for (let seed = 1; seed <= 200; seed++) seen.add(dealCase(seed).condition);
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

// A knife pull along a polyline, stamped every px.
function knifeAlong(hoof, pts) {
  const evs = [];
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let j = 1; j <= n; j++) evs.push(applyStroke(hoof, 'knife', ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n, 1));
  }
  return evs;
}

test('whiteline: following the track from the wall drains the pocket, once', () => {
  const cd = makeCase('whiteline', 1);
  const h = new Hoof(cd);
  const L = cd.lesion;
  h.mud.fill(0);
  assert.equal(h.probe(h.cellAt(L.x, L.y), false).kind, 'lesion', 'the dark line flinches');
  let drains = 0;
  for (let k = 0; k < 4 && !h.drained; k++) {
    const evs = knifeAlong(h, [...L.path, [L.pocket.x, L.pocket.y], [L.pocket.x + 4, L.pocket.y + 4], [L.pocket.x - 4, L.pocket.y - 4]]);
    drains += evs.filter((e) => e.drain).length;
  }
  assert.ok(h.drained, 'drained');
  assert.equal(drains, 1, 'drain fires once');
  knifeAlong(h, [[L.pocket.x - 5, L.pocket.y], [L.pocket.x + 5, L.pocket.y]]);
  assert.equal(h.probe(h.cellAt(L.pocket.x, L.pocket.y), true).kind, 'firm', 'reads drained afterwards');
});

test('whiteline: the pocket will not open from the sole, the grinder or the nippers', () => {
  const cd = makeCase('whiteline', 1);
  const h = new Hoof(cd);
  const K = cd.lesion.pocket;
  // Go straight for the pus: the knife only digs sole and warns off-track.
  let off = false;
  for (let k = 0; k < 400 && !off; k++) off = applyStroke(h, 'knife', K.x + (k % 3) - 1, K.y, 1).offTrack;
  assert.ok(off, 'offTrack fires at the pocket');
  for (let k = 0; k < 120; k++) applyGrind(h, cd.lesion.x, cd.lesion.y, 1 / 60);
  assert.equal(h.drained, false);
  assert.equal(h.metrics().looseRemain[LOOSE.TRACT], 1, 'nothing opened');
});

test('whiteline: hunting through the sole beside the track costs restraint', () => {
  const cd = makeCase('whiteline', 1);
  const good = new Hoof(cd);
  idealTrim(good);
  const base = scoreCase(good.metrics(), idealSession(cd), good, cd);
  assert.equal(base.grade, 'Textbook', base.notes.join(' | '));

  const hunt = new Hoof(cd);
  idealTrim(hunt);
  const K = cd.lesion.pocket;
  hunt.stampExact(K.x, K.y, K.r + 12, (i) => {
    if (hunt.claw[i] === cd.lesion.claw && !hunt.tract[i]) hunt.thick[i] = Math.max(0.5, hunt.zoneTarget(i) - 1.6);
  });
  const r = scoreCase(hunt.metrics(), idealSession(cd), hunt, cd);
  assert.ok(r.parts.restraint <= base.parts.restraint - 25, `restraint ${r.parts.restraint}`);
  assert.ok(r.notes.some((n) => /beside the track/.test(n)), r.notes.join(' | '));

  const shut = new Hoof(cd);
  idealTrim(shut);
  shut.drained = false;
  const rShut = scoreCase(shut.metrics(), idealSession(cd), shut, cd);
  assert.ok(rShut.parts.correctness <= base.parts.correctness - 20, 'undrained abscess');
  assert.ok(rShut.notes.some((n) => /never pared out/.test(n)), rShut.notes.join(' | '));
});

test('whiteline: no pad or wrap; it heals open', () => {
  const cd = makeCase('whiteline', 1);
  const h = new Hoof(cd);
  idealTrim(h);
  assert.deepEqual(applyWrap(h, cd.lesion.claw, h.metrics(), true), { ok: false, reason: 'untreated' });
  assert.equal(h.wrap, 0);
});

test('dd: the patch sits in the heel cleft, reads very sore, and is no-go for every blade', () => {
  const cd = makeCase('dd', 1);
  const h = new Hoof(cd);
  const L = cd.lesion;
  const i = h.cellAt(L.x, L.y);
  assert.ok(h.zone[i] & Z.CLEFT && h.zone[i] & Z.DD, 'centre cell is DD on the cleft');
  assert.ok(h.zone[i] & Z.HEEL, 'the cleft sits in the heel');
  h.mud.fill(0);
  assert.equal(h.probe(i, false).kind, 'lesion');
  assert.match(h.probe(i, false).text, /cleft/);
  // Blades take nothing off the cleft, but every one of them registers.
  const before = Float32Array.from(h.thick);
  assert.ok(knifeAlong(h, [[L.x, L.y - 6], [L.x, L.y + 6]]).some((e) => e.cleftCut), 'knife');
  assert.ok(applyGrind(h, L.x, L.y, 1 / 60).cleftCut, 'grinder');
  // The nippers only reach the heel once the long toe is off (a deep bite takes nothing).
  for (let j = 0; j < h.n; j++) if (h.zone[j] & Z.DEAD) h.thick[j] = 0;
  assert.ok(applyBite(h, L.x, L.y).cleftCut, 'nippers');
  assert.equal(h.thick[i], before[i], 'no skin removed');
  assert.ok(h.blood[i], 'the raw patch bleeds at a touch');
  assert.equal(applyStroke(h, 'rasp', L.x, L.y, 4).cleftCut, false, 'the rasp just rides over it');
  // Not graded as horn: the cleft is skipped by the weight test.
  assert.equal(h.contactMap()[i], 0);
});

test('dd: the spray soaks the patch, the wrap needs it, and no block is wanted', () => {
  const cd = makeCase('dd', 1);
  const L = cd.lesion;
  const h = new Hoof(cd);
  idealTrim(h);
  h.wrap = 0; h.wrapClaw = CLAW.NONE; h.tint.fill(0);
  assert.equal(h.block, CLAW.NONE, 'no block on a DD foot');
  assert.deepEqual(applyWrap(h, L.claw, h.metrics(), true), { ok: false, reason: 'unflushed' });
  for (let k = 0; k < 60; k++) applySpray(h, L.x, L.y, 1 / 60);
  assert.ok(h.metrics().lesionTint >= CFG.treat.tintMin, `tint ${h.metrics().lesionTint}`);
  assert.equal(applyWrap(h, soundClaw(cd), h.metrics(), true).reason, 'sound', 'the wrap goes on the sore claw');
  assert.equal(applyWrap(h, L.claw, h.metrics(), true).stage, 1);
  assert.equal(applyWrap(h, L.claw, h.metrics(), true).stage, 2);
  const r = scoreCase(h.metrics(), idealSession(cd), h, cd);
  assert.equal(r.grade, 'Textbook', r.notes.join(' | '));
  assert.equal(r.gait, 'sound');

  const blocked = new Hoof(cd);
  idealTrim(blocked);
  blocked.block = soundClaw(cd);
  const rb = scoreCase(blocked.metrics(), idealSession(cd), blocked, cd);
  assert.ok(rb.parts.correctness <= r.parts.correctness - 20, 'needless block');
  assert.notEqual(rb.gait, 'sound');

  const bare = new Hoof(cd);
  idealTrim(bare);
  bare.wrap = 0;
  const rt = scoreCase(bare.metrics(), idealSession(cd), bare, cd);
  assert.ok(rt.notes.some((n) => /DD lesion went out untreated/.test(n)), rt.notes.join(' | '));
  assert.notEqual(rt.gait, 'sound');
});

test('dd: a blade in the cleft costs Correctness and Restraint', () => {
  const cd = makeCase('dd', 1);
  const h = new Hoof(cd);
  idealTrim(h);
  const base = scoreCase(h.metrics(), idealSession(cd), h, cd);
  const r = scoreCase(h.metrics(), { ...idealSession(cd), cleftCuts: 3 }, h, cd);
  assert.ok(r.parts.correctness <= base.parts.correctness - 15);
  assert.ok(r.parts.restraint <= base.parts.restraint - 20);
  assert.ok(r.notes.some((n) => /treated, not cut/.test(n)), r.notes.join(' | '));
});

// ------------------------------------------------------------ WP7.3 per-cow variations

test('variations: a cow with no mods is the usual hind-foot cow', () => {
  const cd = makeCase('ulcer', 7);
  assert.equal(cd.foot, 'hind');
  assert.equal(cd.temper, 0.5);
  assert.equal(cd.mud, 1);
  assert.equal(cd.traits, '');
  assert.ok(cd.excess[CLAW.OUTER] > cd.excess[CLAW.INNER], 'outer hind claw overgrows');
  // A mod changes only what it names: the same seed keeps its side, sore claw and spot.
  const v = makeCase('ulcer', 7, { mud: 1.4, temper: 0.9, growth: 1.2 });
  assert.equal(v.side, cd.side);
  assert.deepEqual(v.lesion, cd.lesion);
  assert.deepEqual(v.decoys, cd.decoys);
  assert.ok(Math.abs(v.excess[CLAW.OUTER] - cd.excess[CLAW.OUTER] * 1.2) < 1e-9);
});

test('variations: a front foot overgrows the inner claw and trims the outer claw first', () => {
  const cd = makeCase('routine', 3, { foot: 'front' });
  assert.match(cd.subtitle, /front$/);
  assert.match(cd.intro, /front/);
  assert.ok(cd.excess[CLAW.INNER] > cd.excess[CLAW.OUTER], 'inner front claw overgrows');
  const [s1, s2] = stepsFor(cd).filter((st) => st.id === 'step1' || st.id === 'step2');
  assert.match(stepLabel(s1, cd), /outer/);
  assert.match(stepLabel(s2, cd), /inner/);
  assert.match(stepLabel(s1, makeCase('routine', 3)), /inner/);
  // Starting on the inner claw is the wrong order on a front foot, the right one on a hind.
  const hoof = new Hoof(cd);
  const s = newSession();
  s.firstCutClaw = CLAW.INNER;
  const r = scoreCase(hoof.metrics(), s, hoof, cd);
  assert.ok(r.notes.some((n) => /Started on the inner claw\. On a front foot/.test(n)), r.notes.join(' | '));
  // Front-foot ulcers favour the inner claw.
  let inner = 0;
  for (let seed = 1; seed <= 60; seed++) if (makeCase('ulcer', seed, { foot: 'front' }).lesion.claw === CLAW.INNER) inner++;
  assert.ok(inner > 40, `${inner}/60 front ulcers on the inner claw`);
});

test('variations: mud level sets how much muck there is and how long brushing takes', () => {
  const brushTime = (mud) => {
    const hoof = new Hoof(makeCase('routine', 2, { mud }));
    const start = hoof.metrics().mudMean;
    let k = 0;
    for (; k < 60 && hoof.metrics().mudMean >= 0.12; k++) {
      for (let y = 180; y < 640; y += 14) for (let x = 40; x < 370; x += 20) applyStroke(hoof, 'brush', x, y, 3);
    }
    return { start, k };
  };
  const light = brushTime(0.65), usual = brushTime(1), caked = brushTime(1.6);
  assert.ok(light.start < usual.start - 0.2, 'a clean-straw cow carries less muck');
  assert.ok(Math.abs(caked.start - usual.start) < 1e-9, 'caked is fully covered, like usual');
  assert.ok(light.k <= usual.k && usual.k < caked.k, `brush passes ${light.k} / ${usual.k} / ${caked.k}`);
});

test('variations: decoy count and kinds, lesion size and position follow the mods', () => {
  for (const id of Object.keys(CONDITIONS)) {
    for (const n of [0, 1, 3]) {
      const cd = makeCase(id, 4, { decoyCount: n, decoyKinds: ['bruise'] });
      const decoys = cd.findings.filter((f) => f.kind === 'bruise' || f.kind === 'stain');
      assert.equal(decoys.length, ['routine', 'nonfoot', 'thinsole'].includes(id) ? Math.max(1, n) : n, `${id} ${n} decoys`);
      assert.ok(decoys.every((f) => f.kind === 'bruise'));
    }
  }
  const small = makeCase('ulcer', 4, { lesionSize: 0, lesionAt: 0 }).lesion;
  const big = makeCase('ulcer', 4, { lesionSize: 1, lesionAt: 1 }).lesion;
  assert.equal(small.r, 10); assert.equal(big.r, 16);
  assert.equal(small.y, 275); assert.equal(big.y, 305);
  const t0 = makeCase('whiteline', 4, { lesionSize: 0 }).lesion, t1 = makeCase('whiteline', 4, { lesionSize: 1 }).lesion;
  assert.ok(t1.len > t0.len && t1.pocket.r > t0.pocket.r, 'a bigger abscess has a longer track and pocket');
});

test('variations: temperament tunes the flinch, the jolt and the fidget, calm to lively', () => {
  const calm = temperament(0), usual = temperament(0.5), lively = temperament(1);
  assert.ok(calm.flinchAt < usual.flinchAt && usual.flinchAt < lively.flinchAt);
  assert.ok(Math.abs(usual.flinchAt - CFG.sole.thin) < 0.05, 'the usual cow flinches where the sole turns thin');
  assert.ok(lively.flinchAt < CFG.sole.dishTarget - CFG.sole.tolerance, 'a correct dish never sets her off');
  assert.ok(calm.shake < lively.shake);
  assert.equal(calm.fidgetEvery, 0);
  assert.ok(lively.fidgetEvery > 0 && lively.fidgetEvery < temperament(0.6).fidgetEvery);
  assert.ok(lively.kicks && !usual.kicks);
});

test('variations: dealt cows vary but stay in range, and the deal is deterministic per seed', () => {
  const feet = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const m = dealMods(seed);
    feet.add(m.foot);
    assert.ok(m.growth >= 0.75 && m.growth <= 1.35 && m.mud >= 0.65 && m.mud <= 1.5 && m.temper >= 0.1 && m.temper <= 0.95);
  }
  assert.deepEqual([...feet].sort(), ['front', 'hind']);
  assert.deepEqual(dealCase(42), dealCase(42));
  assert.equal(dealCase(42).foot, dealMods(42).foot);
});

test('a blade near thin living sole reports how thin it got (the flinch reads it)', () => {
  const hoof = new Hoof(CASE_B);
  let ev;
  for (let k = 0; k < 400; k++) { ev = applyGrind(hoof, 280, 400, 1 / 60); if (ev.minLive < 4) break; }
  assert.ok(ev.minLive < 4 && ev.minLive > 0, `minLive ${ev.minLive}`);
});

// WP7.6: the steps read the case's band, not the fixed one.
test('a wider band (the apprentice tier) counts a claw at 7.9 mm as levelled', () => {
  const wide = { ...CASE_B, tolerance: 1.0 };
  const step1 = stepsFor(CASE_B).find((s) => s.id === 'step1');
  const k = (wb) => ({ deadRemain: 0, wbMean: wb });
  const m = (wb) => ({ claws: { [CLAW.INNER]: k(wb), [CLAW.OUTER]: k(wb) } });
  assert.equal(step1.done(m(7.9), null, { caseDef: CASE_B }), false);
  assert.equal(step1.done(m(7.9), null, { caseDef: wide }), true);
});

test('the depth reading is the sole you may grind: the toe triangle and the cap keep-out are left out', () => {
  const h = new Hoof(CASE_B);
  for (let i = 0; i < h.n; i++) {
    const z = h.zone[i];
    if ((z & Z.LIVE) && !(z & (Z.TRI | Z.DISH | Z.HEEL | Z.ULCER)) && !h.loose[i] && !h.keepOut[i]) h.thick[i] = CFG.sole.target;
  }
  const m = h.metrics();
  for (const c of [CLAW.OUTER, CLAW.INNER]) assert.ok(Math.abs(m.claws[c].wbMean - CFG.sole.target) < 0.01, `claw ${c}: ${m.claws[c].wbMean}`);
});

test('steps 1 and 2 flag the nippers while that claw\'s toe is long, then the grinder', async () => {
  const { suggestedTool } = await import('../src/steps.js');
  const long = { claws: { [CLAW.INNER]: { deadRemain: 0.5 }, [CLAW.OUTER]: { deadRemain: 0.5 } } };
  const nipped = { claws: { [CLAW.INNER]: { deadRemain: 0 }, [CLAW.OUTER]: { deadRemain: 0 } } };
  const i1 = stepsFor(CASE_B).findIndex((s) => s.id === 'step1'), i2 = i1 + 1;
  assert.equal(suggestedTool(i1, long, CASE_B), 'nippers');
  assert.equal(suggestedTool(i1, nipped, CASE_B), 'grinder');
  assert.equal(suggestedTool(i2, long, CASE_B), 'nippers');
  assert.equal(suggestedTool(i2, nipped, CASE_B), 'grinder');
  assert.equal(suggestedTool(-1, nipped, CASE_B), null);
});

test('nipping the sole is a mistake; a toe bite that grazes the trim line is not', () => {
  // Work a toe column from the tip back until the jaws touch living horn: that bite is a graze.
  const t = new Hoof(CASE_B);
  let graze = null;
  for (let y = 640; y >= 480 && !graze; y -= 6) { const e = applyBite(t, 250, y); if (e.nipLive) graze = e; }
  assert.ok(graze, 'reached the trim line');
  assert.equal(graze.nipSole, false);
  // With the toe off, carry on up into the sole: that's the mistake.
  for (let i = 0; i < t.n; i++) if (t.zone[i] & Z.DEAD) t.thick[i] = 0;
  const ev = applyBite(t, 250, 400);
  assert.ok(ev.nipLive && ev.nipSole, 'jaws on the living sole');
});

// WP8.1: the other ways off the line. Case B stands in for a cow that needs a call.
test('a call on a cow who only needed her foot seen to caps at Needs work, with no walk-off', () => {
  const cd = makeCase('routine', 7);
  const h = new Hoof(cd);
  idealTrim(h);
  const r = scoreCase(h.metrics(), { ...idealSession(cd), call: 'vet' }, h, cd);
  assert.equal(r.grade, 'Needs work');
  assert.equal(r.call, 'vet');
  assert.equal(r.gait, 'to the vet');
  assert.equal(r.mobility, null);
  assert.match(r.notes[0], /didn’t need the vet/);
});

test('a cow who needs the vet: released costs 25 Correctness, the pen 15, the vet nothing', () => {
  const cd = { ...CASE_B, call: 'vet' };
  const h = new Hoof(cd);
  idealTrim(h);
  const by = (call) => scoreCase(h.metrics(), { ...idealSession(cd), call }, h, cd);
  assert.equal(by('vet').parts.correctness, 100);
  assert.equal(by('vet').gait, 'to the vet');
  assert.equal(by('pen').parts.correctness, 85);
  assert.equal(by(null).parts.correctness, 75);
  assert.ok(by(null).notes.includes('This one needs the vet.'));
  // Leaving her is no referral either.
  assert.equal(by('leave').parts.correctness, 75);
});

test('a cow to be left: the call scores full, strokes cost Restraint, a full trim is Needs work', () => {
  const cd = { ...makeCase('routine', 7), call: 'leave' };
  const h = new Hoof(cd);
  const left = scoreCase(h.metrics(), { ...newSession(), call: 'leave' }, h, cd);
  assert.equal(left.total, 100);
  assert.equal(left.grade, 'Textbook');
  assert.equal(left.gait, 'left till dry-off');
  const started = scoreCase(h.metrics(), { ...newSession(), call: 'leave', cuts: 5 }, h, cd);
  assert.equal(started.parts.restraint, 70);
  idealTrim(h);
  const trimmed = scoreCase(h.metrics(), idealSession(cd), h, cd);
  assert.equal(trimmed.grade, 'Needs work');
  assert.notEqual(trimmed.gait, 'left till dry-off');
});

// WP8.5: double sole.
test('double sole: a hollow false sole the knife lifts off, the grinder tears through', () => {
  const cd = makeCase('doublesole', 3);
  const L = cd.lesion;
  const h = new Hoof(cd);
  const i = h.cellAt(L.x, L.y);
  assert.equal(h.looseInit[i], LOOSE.DOUBLE);
  assert.ok(!(h.zone[i] & Z.DISH), 'the dish keeps out of the false sole');
  h.mud.fill(0);
  const r = h.probe(i, false);
  assert.equal(r.kind, 'lesion');
  assert.equal(r.finding.kind, 'doublesole');
  applyStroke(h, 'knife', L.x, L.y, 4);
  assert.equal(h.loose[i], 0, 'the knife lifts it');
  assert.ok(h.thick[i] <= h.zoneTarget(i) + 0.2 + 1e-6, `new sole at ${h.thick[i].toFixed(2)} mm`);
  assert.equal(h.probe(i, true).kind, 'firm');

  const g = new Hoof(cd);
  const ev = applyGrind(g, L.x, L.y, 1 / 60);
  assert.ok(ev.grinderLesion, 'grinding the false sole is flagged');
  assert.ok(g.thick[i] < g.zoneTarget(i) - 1, 'and it bites into the thin sole under it');
});

test('double sole: left on, or blocked, costs; pared and trimmed is Textbook with no block', () => {
  const cd = makeCase('doublesole', 4);
  const h = new Hoof(cd);
  idealTrim(h);
  assert.equal(h.block, CLAW.NONE);
  const ok = scoreCase(h.metrics(), idealSession(cd), h, cd);
  assert.equal(ok.grade, 'Textbook', ok.notes.join(' | '));
  assert.equal(ok.gait, 'sound');
  // The false sole back on.
  const left = new Hoof(cd);
  idealTrim(left);
  for (let i = 0; i < left.n; i++) if (left.looseInit[i] === LOOSE.DOUBLE) left.loose[i] = LOOSE.DOUBLE;
  const r = scoreCase(left.metrics(), idealSession(cd), left, cd);
  assert.ok(r.notes.some((n) => n.startsWith('False sole left on')), r.notes.join(' | '));
  assert.notEqual(r.gait, 'sound');
  // A needless block.
  h.block = soundClaw(cd);
  const b = scoreCase(h.metrics(), idealSession(cd), h, cd);
  assert.ok(b.notes.some((n) => n.includes('new sole is sound')), b.notes.join(' | '));
});

// ------------------------------------------------------------------ WP9 J2 an old block still on
test('old block: on from the start, the claw under it untrimmable, three knife taps pry it off', () => {
  const cd = makeCase('routine', 9, { oldBlock: { claw: CLAW.OUTER, kind: 'rubber' } });
  assert.equal(cd.steps[0], 'unblock');
  const h = new Hoof(cd);
  assert.equal(h.block, CLAW.OUTER);
  const [x, y] = findCell(h, (i) => h.claw[i] === CLAW.OUTER && (h.zone[i] & Z.LIVE) && !(h.zone[i] & (Z.HEEL | Z.DEAD)));
  const i = h.cellAt(x, y);
  const before = h.thick[i];
  assert.ok(applyStroke(h, 'knife', x, y, 20).blockedSkip, 'the knife slides off the block');
  assert.equal(h.thick[i], before);
  assert.equal(h.mud[i], 0, 'no muck got under it');
  // A tap on the other claw does nothing.
  const [ox, oy] = findCell(h, (j) => h.claw[j] === CLAW.INNER);
  assert.equal(applyPry(h, ox, oy), null);
  const done = () => evaluateSteps(h.metrics(), newSession(), h, 1).status[0].done;
  assert.deepEqual(applyPry(h, x, y), { taps: 1, off: false });
  assert.deepEqual(applyPry(h, x, y), { taps: 2, off: false });
  assert.equal(done(), false);
  assert.deepEqual(applyPry(h, x, y), { taps: 3, off: true });
  assert.equal(h.block, CLAW.NONE);
  assert.equal(done(), true);
  assert.equal(applyPry(h, x, y), null, 'nothing left to pry');
  // A wood block comes on as wood.
  const w = new Hoof(makeCase('toenecrosis', 9, { oldBlock: { claw: CLAW.INNER, kind: 'wood' } }));
  assert.equal(w.blockKind, 'wood');
});

test('old block: left on costs 20 (not the needless-block note); off and trimmed is Textbook', () => {
  const cd = makeCase('routine', 9, { oldBlock: { claw: CLAW.OUTER, kind: 'rubber' } });
  const left = new Hoof(cd);
  idealTrim(left);
  const r = scoreCase(left.metrics(), idealSession(cd), left, cd);
  assert.ok(r.notes.some((n) => n.startsWith('An old block left on')), r.notes.join(' | '));
  assert.ok(!r.notes.some((n) => n.includes('no block needed')), 'not charged twice');
  assert.equal(r.parts.correctness, 80);
  assert.notEqual(r.gait, 'sound');
  assert.deepEqual(r.block, { claw: CLAW.OUTER, kind: 'rubber' }, 'the record says she went off in it');
  const off = new Hoof(cd);
  off.oldBlock.on = false; off.block = CLAW.NONE;
  idealTrim(off);
  const ok = scoreCase(off.metrics(), idealSession(cd), off, cd);
  assert.equal(ok.grade, 'Textbook', ok.notes.join(' | '));
  assert.equal(ok.block, null);
  // A recheck re-blocked: the new block on the sound claw is what she needs.
  const re = makeCase('ulcer', 9, { oldBlock: { claw: soundClaw(makeCase('ulcer', 9)), kind: 'rubber' } });
  const h = new Hoof(re);
  h.oldBlock.on = false; h.block = CLAW.NONE;
  idealTrim(h);
  const g = scoreCase(h.metrics(), idealSession(re), h, re);
  assert.equal(g.grade, 'Textbook', g.notes.join(' | '));
});

test('D26: lame higher up the leg. A clean, firm foot, a scuffed toe, and the vet', () => {
  const cd = makeCase('nonfoot', 41);
  assert.equal(cd.lesion, null);
  assert.equal(cd.call, 'vet');
  assert.ok(cd.toeDrag);
  assert.match(cd.intro, /hock|dragging/);
  const hoof = new Hoof(cd);
  for (let i = 0; i < hoof.n; i++) hoof.mud[i] = 0;
  // Every mark is firm; the dead toe reads as worn from dragging, one finding per claw.
  let toe = -1;
  for (let i = 0; i < hoof.n; i++) if (hoof.zone[i] & Z.DEAD) { toe = i; break; }
  const r = hoof.probe(toe, false);
  assert.equal(r.kind, 'scuff');
  assert.equal(r.finding, hoof.probe(toe, false).finding, 'the same toe is the same finding');
  for (const f of cd.findings) assert.notEqual(hoof.probe(hoof.cellAt(f.x, f.y), false).kind, 'lesion');

  const read = () => { const s = newSession(); s.probes.push(cd.findings[0].kind); s.diagnosis = 'nonfoot'; s.diagnosisCorrect = true; return s; };
  // Hands off and the vet: Textbook.
  const s = read(); s.call = 'vet';
  const ok = scoreCase(hoof.metrics(), s, hoof, cd);
  assert.equal(ok.grade, 'Textbook');
  assert.equal(ok.gait, 'to the vet');
  // Trimmed first: Restraint pays 15 a stroke, at most 30.
  const cut = read(); cut.call = 'vet'; cut.cuts = 5;
  assert.equal(scoreCase(hoof.metrics(), cut, hoof, cd).parts.restraint, 70);
  // Released: she walks off lame and the note says why.
  const rel = scoreCase(hoof.metrics(), read(), hoof, cd);
  assert.equal(rel.gait, 'lame');
  assert.ok(rel.notes.some((n) => /needed the vet/.test(n)));
  // Read as sound: a misread.
  const snd = read(); snd.diagnosis = 'sound'; snd.diagnosisCorrect = false; snd.call = 'vet';
  assert.ok(scoreCase(hoof.metrics(), snd, hoof, cd).parts.correctness <= 85);
});

// ------------------------------------------------------------------ WP13.1 thin soles
test('WP13.1: a thin-soled cow starts under target and level, and her sole reads thin', () => {
  for (let seed = 1; seed <= 40; seed++) {
    for (const foot of ['hind', 'front']) {
      const cd = makeCase('thinsole', seed, { foot, growth: 1.5 });
      assert.ok(cd.thinSole && !cd.lesion && cd.call === null);
      const h = new Hoof(cd);
      const m = h.metrics();
      for (const c of [CLAW.INNER, CLAW.OUTER]) {
        const k = m.claws[c];
        assert.ok(k.wbMean > 5 && k.wbMean < T - 0.3, `seed ${seed} ${foot}: wb ${k.wbMean.toFixed(2)} (growth doesn't thicken her)`);
        assert.ok(k.deadN > 50, 'her toes are still long');
      }
      assert.ok(Math.abs(m.levelDiff) <= 0.5, `seed ${seed}: level ${m.levelDiff.toFixed(2)}`);
    }
  }
  const cd = makeCase('thinsole', 7);
  const h = new Hoof(cd);
  for (let i = 0; i < h.n; i++) h.mud[i] = 0;
  const [x, y] = findCell(h, (i) => !(h.zone[i] & (Z.DEAD | Z.HEEL | Z.CLEFT | Z.WALL)) && !h.findingAt(i));
  const r = h.probe(h.cellAt(x, y), false);
  assert.equal(r.kind, 'thinsole');
  assert.match(r.text, /gives under the testers/);
  assert.equal(r.finding, h.probe(h.cellAt(x, y), false).finding, 'one finding per claw');
  // A routine cow's sole is still just firm.
  const plain = new Hoof(makeCase('routine', 7));
  for (let i = 0; i < plain.n; i++) plain.mud[i] = 0;
  assert.equal(plain.probe(plain.cellAt(x, y), false).kind === 'thinsole', false);
});

test('WP13.1: toes only is Textbook; grinding her thin sole like any other costs Restraint', () => {
  const cd = makeCase('thinsole', 3);
  const steps = stepsFor(cd).map((s) => s.id);
  assert.deepEqual(steps, ['clean', 'diagnose', 'toeOnly', 'step5']);
  const ok = new Hoof(cd);
  idealTrim(ok);
  const s = { ...idealSession(cd), probes: ['thinsole'] };
  assert.equal(evaluateSteps(ok.metrics(), s, ok, 1).current, -1, 'toes off and heel horn flicked: every step done');
  const g = scoreCase(ok.metrics(), s, ok, cd);
  assert.equal(g.grade, 'Textbook', g.notes.join(' | '));
  assert.equal(g.gait, 'sound');

  // The habit: grind both claws a millimetre and a half and dish them, as on any cow.
  const ground = new Hoof(cd);
  idealTrim(ground);
  for (let i = 0; i < ground.n; i++) {
    const z = ground.zone[i];
    if (!ground.claw[i] || (z & (Z.DEAD | Z.HEEL | Z.CLEFT))) continue;
    ground.thick[i] = Math.max(0.5, ground.thick[i] - (z & Z.DISH ? 2.5 : 1.5));
  }
  const bad = scoreCase(ground.metrics(), s, ground, cd);
  assert.ok(bad.parts.restraint <= 70, `restraint ${bad.parts.restraint}`);
  assert.ok(bad.notes.some((n) => /already thin/.test(n)), bad.notes.join(' | '));
  assert.notEqual(bad.grade, 'Textbook');
  // Not marked down for the sole she came in with: no "over-trimmed to N mm (target 7)" note.
  assert.ok(!g.notes.some((n) => /over-trimmed|off target/.test(n)));
  // A block on a thin-soled cow is needless.
  ok.block = CLAW.OUTER;
  assert.ok(scoreCase(ok.metrics(), s, ok, cd).notes.some((n) => /both soles are thin/.test(n)));
});

// ------------------------------------------------------------------ WP12.4 sand dulls the knife
test('sand: the knife wears as it pares, a worn one cuts slower, and off sand it never wears', () => {
  const pare = (knife) => {
    const h = new Hoof(makeCase('routine', 4));
    let removed = 0;
    for (let x = 140; x < 260; x += 8) for (let y = 300; y < 480; y += 3) removed += applyStroke(h, 'knife', x, y, 3, knife).removed;
    return removed;
  };
  const sharp = pare(null);
  const plain = { sand: false, wear: 0 };
  assert.equal(pare(plain), sharp, 'off sand the knife is just a knife');
  assert.equal(plain.wear, 0);
  const sand = { sand: true, wear: 0 };
  const fresh = pare(sand);
  assert.ok(sand.wear > 0.2 && fresh < sharp, `wear ${sand.wear.toFixed(2)}, ${fresh.toFixed(0)} vs ${sharp.toFixed(0)}`);
  const worn = { sand: true, wear: 1 };
  assert.ok(pare(worn) < sharp * 0.7, 'a worn blade takes far less');
  assert.equal(worn.wear, 1, 'wear tops out at 1');
});

test('WP13.3: deep sepsis wants the sound claw trimmed and blocked, and every blade kept off the swollen one', () => {
  const cd = makeCase('dds', 13);
  assert.deepEqual(stepsFor(cd).map((s) => s.id), ['clean', 'diagnose', 'trimSound', 'blockSound', 'refer']);
  assert.deepEqual(cd.swollen, [cd.lesion.claw], 'only the sore claw swells');
  const ok = soundClaw(cd), L = cd.lesion;
  // The job done: clean, the sound claw's toe off and its sole at target, a rubber block on it.
  const good = () => {
    const h = new Hoof(cd);
    for (let i = 0; i < h.n; i++) {
      if (!h.claw[i]) continue;
      h.mud[i] = 0;
      if (h.claw[i] !== ok) continue;
      if (h.zone[i] & Z.DEAD) h.thick[i] = 0;
      else if (!(h.zone[i] & (Z.HEEL | Z.CLEFT | Z.DISH | Z.TRI))) h.thick[i] = Math.min(h.thick[i], CFG.sole.target);
    }
    h.block = ok;
    return h;
  };
  const sess = (o = {}) => ({ ...idealSession(cd), call: 'vet', ...o });
  const h = good();
  assert.equal(evaluateSteps(h.metrics(), sess(), h, 1).current, -1, 'every step done');
  const g = scoreCase(h.metrics(), sess(), h, cd);
  assert.equal(g.grade, 'Textbook', g.notes.join(' | '));
  assert.equal(g.gait, CONDITIONS.dds.call === 'vet' ? 'to the vet' : g.gait);

  // The hole takes no blade, and a cut centred on the swollen claw is flagged.
  const t = new Hoof(cd), i = t.cellAt(L.x, L.y);
  assert.ok(t.zone[i] & Z.SEPSIS);
  const before = t.thick[i];
  assert.ok(applyStroke(t, 'knife', L.x, L.y, 10).holeCut);
  assert.equal(t.thick[i], before, 'the hole keeps its horn');
  const b = clawBox(L.claw, cd.side);
  assert.ok(applyGrind(t, b.cx, 420, 0.1).sepsisCut, 'grinding the swollen claw counts');
  assert.ok(!applyGrind(t, clawBox(ok, cd.side).cx, 420, 0.1).sepsisCut, 'grinding the sound claw does not');
  assert.equal(applyWrap(t, L.claw, t.metrics(), true).reason, 'vet');

  // Costs: 15 a stroke at most 30; no block −15; a block on the swollen claw is lame; released −25.
  const cut = scoreCase(h.metrics(), sess({ holeCuts: 1, sepsisCuts: 2 }), h, cd);
  assert.equal(g.parts.restraint - cut.parts.restraint, 30);
  assert.ok(cut.notes.some((n) => n.includes('vet’s job')));
  const nb = good(); nb.block = CLAW.NONE;
  const r1 = scoreCase(nb.metrics(), sess(), nb, cd);
  assert.equal(g.parts.correctness - r1.parts.correctness, 15);
  assert.ok(r1.notes.some((n) => n.includes('weight off that claw')));
  const bs = good(); bs.block = L.claw;
  const r2 = scoreCase(bs.metrics(), sess({ blockAttempts: [L.claw] }), bs, cd);
  assert.equal(r2.gait, 'lame');
  assert.equal(g.parts.correctness - r2.parts.correctness, 30);
  const rel = scoreCase(h.metrics(), sess({ call: null }), h, cd);
  assert.equal(g.parts.correctness - rel.parts.correctness, 25);
  assert.equal(rel.gait, 'lame');
});

// WP14.1: a knife worked round and round just outside the cap, as a heavy hand frees an ulcer.
// The wrap comes off for it and goes back on after.
function stripRing(h, L, passes = 4) {
  const [wrap, wrapAt] = [h.wrap, { ...h.wrapAt }];
  h.wrap = 0; h.wrapAt[CLAW.OUTER] = h.wrapAt[CLAW.INNER] = 0;
  const R = L.r * 1.75 + 4;
  for (let k = 0; k < passes; k++) {
    const orbit = [];
    for (let a = 0; a <= 96; a++) orbit.push([L.x + R * Math.cos((a / 96) * 2 * Math.PI), L.y + R * Math.sin((a / 96) * 2 * Math.PI)]);
    knifeAlong(h, orbit);
  }
  h.wrap = wrap; Object.assign(h.wrapAt, wrapAt);
}

test('ring: the sole round an opened ulcer is scored; stripping it costs restraint, once per ulcer (WP14.1)', () => {
  const good = new Hoof(CASE_B);
  idealTrim(good);
  const gm = good.metrics();
  assert.equal(gm.rings.length, 1);
  assert.ok(gm.rings[0].mean >= T - 0.01 && !gm.rings[0].stripped, JSON.stringify(gm.rings));
  const base = scoreCase(gm, idealSession(), good, CASE_B);
  assert.equal(base.grade, 'Textbook');
  assert.equal(base.stripped, false);

  const h = new Hoof(CASE_B);
  idealTrim(h);
  stripRing(h, CASE_B.lesion);
  const m = h.metrics();
  assert.ok(m.rings[0].stripped, JSON.stringify(m.rings));
  assert.equal(m.blood, 0, `stripped without drawing blood (${m.blood} cells, ring ${JSON.stringify(m.rings)})`);
  const r = scoreCase(m, idealSession(), h, CASE_B);
  assert.equal(r.stripped, true);
  assert.ok(r.parts.restraint <= base.parts.restraint - CFG.ring.restraint, `restraint ${r.parts.restraint}`);
  assert.ok(r.notes.some((n) => /stripped the horn round the ulcer/.test(n)), r.notes.join(' | '));
  assert.ok(!r.notes.some((n) => /beside the track/.test(n)), 'not the white-line note');

  // A sound foot or a white line has no ring to strip.
  for (const id of ['routine', 'whiteline']) {
    const w = new Hoof(makeCase(id, 1));
    idealTrim(w);
    assert.deepEqual(w.metrics().rings, []);
  }
});

test('ring: both ulcers of a pair (J3) stripped cost the cap, not twice the cost (WP14.1)', () => {
  let cd = null;
  for (let seed = 1; seed < 200 && !cd; seed++) {
    const c = makeCase('twoclaw', seed);
    if (c.lesions.every((L) => L.type === 'ulcer')) cd = c;
  }
  assert.ok(cd, 'a pair of ulcers dealt');
  const h = new Hoof(cd);
  idealTrim(h);
  const m = h.metrics();
  const base = scoreCase(m, idealSession(cd), h, cd).parts.restraint;
  const cost = (n) => {
    const mm = { ...m, rings: m.rings.map((g, k) => ({ ...g, stripped: k < n })) };
    return base - scoreCase(mm, idealSession(cd), h, cd).parts.restraint;
  };
  assert.equal(cost(1), CFG.ring.restraint);
  assert.equal(cost(2), CFG.ring.cap);
  // And the real knife strips both.
  for (const L of cd.lesions) stripRing(h, L);
  assert.equal(h.metrics().rings.filter((g) => g.stripped).length, 2, JSON.stringify(h.metrics().rings));
});

// WP14.2: decoys that teach when to stop.
const decoyCase = (kind, seed = 2) => {
  const cd = makeCase('routine', seed, { decoyKinds: [kind], decoyCount: 1 });
  return { cd, f: cd.findings.find((q) => q.kind === kind) };
};

test('a fade by the wall pares out after 1.5 mm; pigment reads the same however deep', () => {
  for (const [kind, gone] of [['fade', true], ['pigment', false]]) {
    const { cd, f } = decoyCase(kind);
    const h = new Hoof(cd);
    for (let i = 0; i < h.n; i++) h.mud[i] = 0;
    const c = h.cellAt(f.x, f.y);
    assert.equal(h.probe(c, false).kind, kind);
    assert.match(h.probe(c, false).text, /firm/i, 'the testers stay honest');
    h.thick[c] = h.init[c] - (gone ? 1.6 : 5);
    assert.equal(h.probe(c, false).kind === kind, !gone, `${kind} after paring`);
  }
});

test('a tempting bruise: one knife pull after levelling shows pink, the third bleeds', () => {
  const { cd, f } = decoyCase('haem');
  const h = new Hoof(cd);
  const c = h.cellAt(f.x, f.y);
  assert.ok(h.thick[c] - h.tgt[c] < 0.35, 'levelling barely touches it');
  h.mud.fill(0);
  assert.match(h.probe(c, false).text, /tender, but no give/i);
  for (let i = 0; i < h.n; i++) if (h.claw[i] && (h.zone[i] & Z.LIVE) && !(h.zone[i] & (Z.DISH | Z.HEEL | Z.WALL))) h.thick[i] = Math.min(h.thick[i], h.zoneTarget(i));
  // One full knife pull, 48 px down across the bruise.
  const pull = () => { let blood = false; for (let k = 0; k < 16; k++) blood = applyStroke(h, 'knife', f.x, f.y - 24 + k * 3, 3).blood || blood; return blood; };
  assert.equal(pull(), false);
  assert.ok(h.thick[c] - h.lift[c] < 2.5, `pink after one pull: ${(h.thick[c] - h.lift[c]).toFixed(2)} mm live`);
  assert.equal(pull(), false);
  assert.equal(pull(), true, 'the third pull bleeds');
  // The corium sits close under the bruise only.
  assert.equal(h.lift[h.cellAt(f.x, f.y - 60)], 0);
});

test('each dug decoy has its own note, and the result carries its pit', () => {
  for (const [kind, note] of [['fade', /passing flaw/], ['pigment', /pigment, not a lesion/], ['haem', /Pink means stop/], ['stain', /dug into a mark/]]) {
    const { cd, f } = decoyCase(kind);
    const h = new Hoof(cd);
    idealTrim(h);
    h.stampExact(f.x, f.y, f.r, (i) => { if (h.claw[i] === f.claw) h.thick[i] = Math.max(h.lift[i] + 0.5, h.zoneTarget(i) - 2); });
    const r = scoreCase(h.metrics(), idealSession(cd), h, cd);
    assert.ok(r.notes.some((n) => note.test(n)), `${kind}: ${r.notes.join(' | ')}`);
    assert.deepEqual(r.pits, [{ claw: f.claw, x: Math.round(f.x), y: Math.round(f.y) }]);
  }
  const { cd } = decoyCase('stain');
  const h = new Hoof(cd);
  idealTrim(h);
  assert.equal(scoreCase(h.metrics(), idealSession(cd), h, cd).pits, undefined, 'nothing dug, no pits');
});

test('she toes out on the walk-in only with a sore outer hind claw (WP14.3)', async () => {
  const { stance } = await import('../src/stance.js');
  const { CLAW } = await import('../src/hoof.js');
  for (const cond of ['ulcer', 'whiteline', 'puncture', 'toenecrosis', 'dds', 'routine', 'dd', 'footrot', 'doublesole', 'twoclaw', 'thinsole', 'nonfoot']) {
    for (let seed = 1; seed <= 12; seed++) {
      const cd = makeCase(cond, seed);
      const L = cd.lesion;
      const want = cd.foot === 'front' ? null
        : ['ulcer', 'whiteline', 'puncture', 'toenecrosis', 'dds'].includes(cond) && L?.claw === CLAW.OUTER ? 'out' : 'square';
      assert.equal(stance(cd), want, `${cond} seed ${seed}`);
    }
  }
  assert.equal(stance(makeCase('ulcer', 1, { foot: 'front' })), null);
  const inner = Array.from({ length: 40 }, (_, k) => makeCase('ulcer', k + 1)).find((cd) => cd.lesion.claw === CLAW.INNER);
  assert.equal(stance(inner), 'square');
});
