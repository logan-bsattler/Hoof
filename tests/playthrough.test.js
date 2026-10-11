// End to end: the tools themselves, played by a careful hand, must reach Textbook without blood.
// This is the regression guard for tuning: if a rate or resistance change makes the case
// unwinnable, this fails even though the ideal-state tests in game.test.js still pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, CLAW, LOOSE, GEOM, clawBox, dishRect, firstClaw, secondClaw, soundClaw } from '../src/hoof.js';
import { CASE_B, dealMods, makeCase } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';
import { applyGrind, applyWrap } from '../src/tools.js';
import { evaluateSteps, trimFinished } from '../src/steps.js';
import { newSession, scoreCase } from '../src/scoring.js';
import { makePlayer } from './player.js';

const DT = 1 / 60;

function playthrough(cd, quiet = false) {
  const hoof = new Hoof(cd);
  const side = hoof.side;
  const s = newSession();
  let bloodAt = null;
  // Session bookkeeping, as main.js handle() does it.
  const p = makePlayer(hoof, {
    onEvent(ev, tool, x, y) {
      if (ev.claws.size && s.firstCutClaw == null) s.firstCutClaw = [...ev.claws][0];
      if (ev.dirtyCut) s.dirtyCuts++;
      if (ev.grinderLesion) s.grinderLesion = true;
      if (ev.cleftCut) s.cleftCuts++;
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

  // Read: test the dark patch (or, on a sound foot, the marks), then commit the read (main.js diagnose()).
  const L = cd.lesion;
  if (L) {
    assert.equal(hoof.probe(hoof.cellAt(L.x, L.y), false).kind, 'lesion');
    s.probes.push(L.type);
  } else {
    for (const f of cd.findings) {
      const r = hoof.probe(hoof.cellAt(f.x, f.y), false);
      assert.equal(r.kind, f.kind, `decoy ${f.kind} reads as itself`);
      s.probes.push(f.kind);
    }
  }
  s.diagnosis = cd.diagnosis;
  s.diagnosisCorrect = true;
  assert.ok(done('diagnose'));

  // Steps 1–2: nip both toes tip first, then grind the first claw (inner on a hind foot,
  // outer on a front) and match the other to it.
  p.nip();
  until('step1', () => p.grind(firstClaw(cd), 270, 580, 1));
  assert.equal(s.firstCutClaw, firstClaw(cd), 'trimmed the right claw first');
  until('step2', () => p.grind(secondClaw(cd), 270, 580, 1));

  // Step 3: knife the dish channel along each axial wall, clear of the ulcer.
  const dishX = (c) => { const d = dishRect(c, side); return [0, 10, 20, 30].map((k) => d.x + 4 + k); };
  p.avoidCore = true;
  until('step3', () => {
    for (const c of [CLAW.INNER, CLAW.OUTER]) {
      // Around the ulcer core, not through it: split each column where the blade would reach
      // the core. Grazing the loose cap only starts opening it, which step 4 does anyway.
      const R = (L?.r ?? 0) + CFG.tools.knife.radius * 0.5;
      for (const x of dishX(c)) {
        // DD sits up in the cleft, clear of the dish: nothing to steer round.
        const sole = L && L.type !== 'dd';
        const dx = sole ? Math.abs(x - L.x) : Infinity;
        if (!sole || c !== L.claw || dx >= R) { p.drag('knife', [[x, GEOM.dishY0], [x, GEOM.dishY1]], 120); continue; }
        const h = Math.sqrt(R * R - dx * dx);
        if (L.y - h > GEOM.dishY0 + 4) p.drag('knife', [[x, GEOM.dishY0], [x, L.y - h]], 120);
        p.drag('knife', [[x, L.y + h], [x, GEOM.dishY1]], 120);
      }
    }
  });

  p.avoidCore = false;

  // Rasp both soles before the block covers one.
  until('finish', () => {
    for (const c of [CLAW.INNER, CLAW.OUTER]) {
      const bx = clawBox(c, side);
      const [a, b] = [bx.x - 8, bx.x + bx.w - 3];
      for (let y = 190; y < 600; y += 16) p.drag('rasp', [[a, y], [b, y + 4], [a, y + 8]], 400);
    }
  }, 20);

  if (L?.type === 'whiteline') {
    // Step 4: follow the track to the pocket until it drains, then block the sound claw.
    for (let k = 0; k < 6 && !hoof.drained; k++) p.followTrack();
    assert.ok(hoof.drained, `abscess drained (track ${(hoof.metrics().looseRemain[LOOSE.TRACT] * 100).toFixed(0)}% closed)`);
    hoof.block = soundClaw(cd);
    s.blockAttempts.push(hoof.block);
    until('drain', () => {});
  } else if (cd.requires.open) {
    // Step 4: pare the loose horn off the ulcer, then block the sound claw.
    for (let k = 0; k < 8 && hoof.metrics().looseRemain[LOOSE.ULCER] >= 0.1; k++) {
      for (let a = 0; a < 6 && hoof.metrics().looseRemain[LOOSE.ULCER] >= 0.1; a++) {
        const r = 6 + a * 3;
        p.drag('knife', [[L.x - r, L.y - r], [L.x + r * 0.5, L.y + r]], 90);
        p.drag('knife', [[L.x + r, L.y - r], [L.x - r * 0.5, L.y + r]], 90);
      }
    }
    assert.ok(hoof.metrics().looseRemain[LOOSE.ULCER] < 0.1, 'ulcer opened');
    hoof.block = soundClaw(cd);
    s.blockAttempts.push(hoof.block);
    until('step4', () => {});

  }

  // Step 5: flick the loose heel horn off.
  const H = cd.looseHorn;
  until('step5', () => {
    for (let d = -H.r; d <= H.r; d += 5) p.drag('knife', [[H.x - H.r, H.y + d], [H.x + H.r, H.y + d]], 90);
  });

  if (cd.requires.treat) {
    // Treat: flush the opened ulcer (or spray the DD patch), then pad and wrap it.
    until(L.type === 'dd' ? 'dress' : 'treat', () => {
      p.drag('spray', [[L.x - 10, L.y], [L.x + 10, L.y], [L.x - 10, L.y]], 20);
      if (hoof.metrics().lesionTint >= CFG.treat.tintMin) {
        for (let k = 0; k < 2; k++) {
          const r = applyWrap(hoof, L.claw, hoof.metrics(), trimFinished(steps()));
          assert.ok(r.ok, `wrap refused: ${r.reason}`);
        }
      }
    });

  }

  const m = hoof.metrics();
  const { current } = evaluateSteps(m, s, hoof, ++now);
  assert.equal(current, -1, 'every step done');
  assert.equal(m.blood, 0);
  const r = scoreCase(m, s, hoof, cd);
  const parts = Object.entries(r.parts).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
  if (!quiet) console.log(`playthrough ${cd.subtitle}, ${L ? `${L.type} ${L.claw === CLAW.OUTER ? 'outer' : 'inner'}` : cd.condition}: ${r.grade} ${r.total} (${parts}) · inner ${m.claws[CLAW.INNER].wbMean.toFixed(2)} ` +
    `outer ${m.claws[CLAW.OUTER].wbMean.toFixed(2)} mm · ${r.notes.join(' | ')}`);
  assert.equal(r.grade, 'Textbook', `${r.total}: ${r.notes.join(' | ')}`);
  assert.equal(r.gait, 'sound');
}

test('a careful player reaches Textbook with the real tools, without drawing blood', () => playthrough(CASE_B));

for (const id of Object.keys(CONDITIONS)) {
  test(`${id}: the careful player reaches Textbook on a dealt cow`, () => playthrough(makeCase(id, 1)));
}

test('the careful player also wins on mirrored feet and inner-claw ulcers', () => {
  // The first dealt cows covering each foot × sore claw combination.
  const want = new Set(['LH1', 'LH2', 'RH1', 'RH2']);
  for (let seed = 1; want.size && seed < 500; seed++) {
    const cd = makeCase('ulcer', seed);
    if (want.delete(cd.side + cd.lesion.claw)) playthrough(cd);
  }
  assert.equal(want.size, 0, 'every layout dealt');
});

test('the careful player follows the white line on both feet and both claws', () => {
  const want = new Set(['LH1', 'LH2', 'RH1', 'RH2']);
  for (let seed = 1; want.size && seed < 500; seed++) {
    const cd = makeCase('whiteline', seed);
    if (want.delete(cd.side + cd.lesion.claw)) playthrough(cd);
  }
  assert.equal(want.size, 0, 'every layout dealt');
});

test('the careful player treats DD on both feet and both claws without a blade in the cleft', () => {
  const want = new Set(['LH1', 'LH2', 'RH1', 'RH2']);
  for (let seed = 1; want.size && seed < 500; seed++) {
    const cd = makeCase('dd', seed);
    if (want.delete(cd.side + cd.lesion.claw)) playthrough(cd);
  }
  assert.equal(want.size, 0, 'every layout dealt');
});

// WP7.3: every per-cow variation, pushed to both ends of its range, still plays to Textbook.
const EXTREMES = {
  'front foot': [{ foot: 'front' }],
  growth: [{ growth: 0.6 }, { growth: 1.5 }],
  mud: [{ mud: 0.6 }, { mud: 1.6 }],
  decoys: [{ decoyCount: 0 }, { decoyCount: 3 }, { decoyKinds: ['bruise'] }],
  'lesion size and position': [{ lesionSize: 0, lesionAt: 0 }, { lesionSize: 1, lesionAt: 1 }],
};
for (const [name, list] of Object.entries(EXTREMES)) {
  test(`variation (${name}): the careful player reaches Textbook on every condition`, () => {
    for (const id of Object.keys(CONDITIONS)) {
      for (const mods of list) for (const seed of [1, 2, 3]) playthrough(makeCase(id, seed, mods), true);
    }
  });
}

test('dealt cows, with all their variations at once, play to Textbook across a seed sweep', () => {
  for (const id of Object.keys(CONDITIONS)) {
    for (let seed = 1; seed <= 6; seed++) playthrough(makeCase(id, seed, dealMods(seed)), true);
  }
});

test('the careful player trims front feet on both sides, outer claw first', () => {
  for (const side of ['LH', 'RH']) for (const id of Object.keys(CONDITIONS)) playthrough(makeCase(id, 5, { side, foot: 'front' }), true);
});

test('the careful player reaches Textbook across a seed sweep of every condition', () => {
  for (const id of Object.keys(CONDITIONS)) for (let seed = 1; seed <= 10; seed++) playthrough(makeCase(id, seed), true);
});

test('a careless player holding the grinder still on one sole spot draws blood within ~6 s', () => {
  const hoof = new Hoof(CASE_B);
  let t = 0, blood = false;
  for (; t < 6 && !blood; t += DT) blood = applyGrind(hoof, 280, 400, DT).blood;
  assert.ok(blood, 'still no blood after 6 s');
  console.log(`careless grinder: blood after ${t.toFixed(2)} s`);
});

// WP7.6: the apprentice's wider band stops the steps a little higher; it must still be Textbook.
test('the careful player reaches Textbook at every tier’s band, on every condition', async () => {
  const { TIERS } = await import('../src/route.js');
  for (const t of TIERS) {
    for (const id of Object.keys(CONDITIONS)) for (const seed of [1, 2]) playthrough({ ...makeCase(id, seed), tolerance: t.tolerance }, true);
  }
  playthrough({ ...CASE_B, tolerance: TIERS[0].tolerance }, true);
});
