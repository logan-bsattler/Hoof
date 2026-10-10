// End to end: the tools themselves, played by a careful hand, must reach Textbook without blood.
// This is the regression guard for tuning: if a rate or resistance change makes the case
// unwinnable, this fails even though the ideal-state tests in game.test.js still pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, CLAW, LOOSE, GEOM } from '../src/hoof.js';
import { CASE_B } from '../src/case.js';
import { applyGrind, applyWrap } from '../src/tools.js';
import { evaluateSteps, trimFinished } from '../src/steps.js';
import { newSession, scoreCase } from '../src/scoring.js';
import { makePlayer } from './player.js';

const DT = 1 / 60;

test('a careful player reaches Textbook with the real tools, without drawing blood', () => {
  const hoof = new Hoof(CASE_B);
  const s = newSession();
  let bloodAt = null;
  // Session bookkeeping, as main.js handle() does it.
  const p = makePlayer(hoof, {
    onEvent(ev, tool, x, y) {
      if (ev.claws.size && s.firstCutClaw == null) s.firstCutClaw = [...ev.claws][0];
      if (ev.dirtyCut) s.dirtyCuts++;
      if (ev.grinderLesion) s.grinderLesion = true;
      if (ev.blood && !bloodAt) bloodAt = `${tool} at ${x.toFixed(0)},${y.toFixed(0)}`;
    },
  });
  let now = 0;
  const steps = () => evaluateSteps(hoof.metrics(), s, hoof, ++now).status;
  const done = (id) => steps().find((x) => x.id === id).done;
  // Repeat a phase until its step is done; a stuck phase fails with the metrics that matter.
  const until = (id, pass, max = 12) => {
    for (let k = 0; k < max && !done(id); k++) pass(k);
    const m = hoof.metrics();
    const c = (k) => `wb ${m.claws[k].wbMean.toFixed(2)} dish ${m.claws[k].dishMean.toFixed(2)} dead ${m.claws[k].deadRemain.toFixed(2)}`;
    assert.ok(done(id), `${id} not done: inner ${c(CLAW.INNER)} · outer ${c(CLAW.OUTER)} · ` +
      `level ${m.levelDiff.toFixed(2)} · rough ${m.roughMean.toFixed(2)} · loose ${JSON.stringify(m.looseRemain)}`);
    assert.equal(bloodAt, null, `blood during ${id}: ${bloodAt}`);
  };

  // Clean.
  until('clean', () => p.brushAll());

  // Read: test the dark patch, then commit the read (main.js diagnose()).
  const L = CASE_B.lesion;
  assert.equal(hoof.probe(hoof.cellAt(L.x, L.y), false).kind, 'lesion');
  s.diagnosis = 'ulcer';
  s.diagnosisCorrect = true;
  assert.ok(done('diagnose'));

  // Steps 1–2: nip both toes tip first, then grind the inner claw and match the outer to it.
  p.nip();
  until('step1', () => p.grind(CLAW.INNER, 270, 580, 1));
  assert.equal(s.firstCutClaw, CLAW.INNER, 'trimmed the inner claw first');
  until('step2', () => p.grind(CLAW.OUTER, 270, 580, 1));

  // Step 3: knife the dish channel along each axial wall, clear of the ulcer.
  const dishX = (c) => (c === CLAW.INNER ? [212, 222, 232, 242] : [188, 178, 168, 158]);
  until('step3', () => {
    for (const c of [CLAW.INNER, CLAW.OUTER]) {
      const top = c === L.claw ? L.y + L.r * 1.75 + CFG.tools.knife.radius : GEOM.dishY0;
      for (const x of dishX(c)) p.drag('knife', [[x, top], [x, GEOM.dishY1]], 120);
    }
  });

  // Step 4: pare the loose horn off the ulcer, then block the sound claw.
  for (let k = 0; k < 8 && hoof.metrics().looseRemain[LOOSE.ULCER] >= 0.1; k++) {
    for (let a = 0; a < 6; a++) {
      const r = 6 + a * 3;
      p.drag('knife', [[L.x - r, L.y - r], [L.x + r * 0.5, L.y + r]], 90);
      p.drag('knife', [[L.x + r, L.y - r], [L.x - r * 0.5, L.y + r]], 90);
    }
  }
  assert.ok(hoof.metrics().looseRemain[LOOSE.ULCER] < 0.1, 'ulcer opened');
  hoof.block = CLAW.INNER;
  s.blockAttempts.push(CLAW.INNER);
  until('step4', () => {});

  // Step 5: flick the loose heel horn off.
  const H = CASE_B.looseHorn;
  until('step5', () => {
    for (let d = -H.r; d <= H.r; d += 5) p.drag('knife', [[H.x - H.r, H.y + d], [H.x + H.r, H.y + d]], 90);
  });

  // Finish: rasp the sound-side passes the block leaves open.
  until('finish', () => {
    for (let y = 190; y < 600; y += 16) p.drag('rasp', [[40, y], [190, y + 4], [40, y + 8]], 400);
  }, 20);

  // Treat: flush the opened ulcer, then pad and wrap it.
  until('treat', () => {
    p.drag('spray', [[L.x - 10, L.y], [L.x + 10, L.y], [L.x - 10, L.y]], 20);
    if (hoof.metrics().lesionTint >= CFG.treat.tintMin) {
      for (let k = 0; k < 2; k++) {
        const r = applyWrap(hoof, L.claw, hoof.metrics(), trimFinished(steps()));
        assert.ok(r.ok, `wrap refused: ${r.reason}`);
      }
    }
  });

  const m = hoof.metrics();
  const { current } = evaluateSteps(m, s, hoof, ++now);
  assert.equal(current, -1, 'every step done');
  assert.equal(m.blood, 0);
  const r = scoreCase(m, s, hoof, CASE_B);
  const parts = Object.entries(r.parts).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
  console.log(`playthrough: ${r.grade} ${r.total} (${parts}) · inner ${m.claws[CLAW.INNER].wbMean.toFixed(2)} ` +
    `outer ${m.claws[CLAW.OUTER].wbMean.toFixed(2)} mm · ${r.notes.join(' | ')}`);
  assert.equal(r.grade, 'Textbook', `${r.total}: ${r.notes.join(' | ')}`);
  assert.equal(r.gait, 'sound');
});

test('a careless player holding the grinder still on one sole spot draws blood within ~6 s', () => {
  const hoof = new Hoof(CASE_B);
  let t = 0, blood = false;
  for (; t < 6 && !blood; t += DT) blood = applyGrind(hoof, 280, 400, DT).blood;
  assert.ok(blood, 'still no blood after 6 s');
  console.log(`careless grinder: blood after ${t.toFixed(2)} s`);
});
