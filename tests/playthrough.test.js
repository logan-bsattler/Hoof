// End to end: the tools themselves, played by a careful hand, must reach Textbook without blood.
// This is the regression guard for tuning: if a rate or resistance change makes the case
// unwinnable, this fails even though the ideal-state tests in game.test.js still pass.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, CLAW, LOOSE, GEOM, clawBox, dishRect, firstClaw, secondClaw, soundClaw } from '../src/hoof.js';
import { CASE_B, dealMods, makeCase } from '../src/case.js';
import { CONDITIONS, CALLS } from '../src/conditions.js';
import { KNIFE_FLAT, applyGrind, applyWrap, applyPry } from '../src/tools.js';
import { evaluateSteps, trimFinished } from '../src/steps.js';
import { newSession, scoreCase, trimUnderway } from '../src/scoring.js';
import { makePlayer } from './player.js';

const DT = 1 / 60;

// knife: the blade in hand on a sand farm (WP12.4), or null for a knife that stays sharp.
function playthrough(cd, quiet = false, knife = null) {
  const hoof = new Hoof(cd);
  const side = hoof.side;
  const s = newSession();
  let bloodAt = null, coreCutAt = null;
  // Session bookkeeping, as main.js handle() does it.
  const p = makePlayer(hoof, {
    knife,
    onEvent(ev, tool, x, y) {
      if (ev.claws.size && s.firstCutClaw == null && trimUnderway(s, cd)) s.firstCutClaw = [...ev.claws][0];
      if (ev.dirtyCut) s.dirtyCuts++;
      if (ev.grinderLesion) s.grinderLesion = true;
      if (ev.cleftCut) s.cleftCuts++;
      if (ev.holeCut) s.holeCuts++;
      if (ev.sepsisCut) s.sepsisCuts++;
      if (ev.blood && !bloodAt) bloodAt = `${tool} at ${x.toFixed(0)},${y.toFixed(0)}`;
      // Any cut into the opened core is a moo and a slip in the game: the careful hand never does it.
      if (ev.lesionCut && !coreCutAt) coreCutAt = `${tool} at ${x.toFixed(0)},${y.toFixed(0)}`;
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
    assert.equal(coreCutAt, null, `cut into the open ulcer during ${id}: ${coreCutAt}`);
  };
  // Where the flat of the knife reaches from its centre.
  const flat = CFG.tools.knife.radius * Math.sqrt(1 - KNIFE_FLAT);

  // Last visit's block, still on (J2): knife taps on it until it comes off.
  if (cd.oldBlock) {
    const b = clawBox(cd.oldBlock.claw, side);
    until('unblock', () => assert.ok(applyPry(hoof, b.x + b.w / 2, b.y + b.h / 2), 'the tap lands on the block'), 3);
  }

  // Clean.
  until('clean', () => p.brushAll());

  // Read: test the dark patch (or, on a sound foot, the marks), then commit the read (main.js diagnose()).
  const L = cd.lesion;
  if (L) {
    for (const l of hoof.lesions()) {
      assert.equal(hoof.probe(hoof.cellAt(l.x, l.y), false).kind, 'lesion');
      s.probes.push(l.type);
    }
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

  // Lame higher up the leg (D26): nothing to do to the foot. Hands off, and call the vet.
  if (cd.toeDrag) {
    s.call = cd.call;
    return verdict();
  }
  if (cd.requires.trim === false) {
    // Foot rot: no blade near it. Spray the length of the split, then call the vet.
    const rot = [];
    for (let i = 0; i < hoof.n; i++) if (hoof.zone[i] & Z.ROT) rot.push([hoof.cellX(i), hoof.cellY(i)]);
    rot.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    until('soak', () => p.drag('spray', rot, 40));
    s.call = cd.call;
    until('refer', () => {});
    return verdict();
  }

  // Thin soles (WP13.1): test the sole itself, nip both toes back, and leave the sole alone.
  if (cd.thinSole) {
    let i = 0;
    while (i < hoof.n && hoof.probe(i, false).kind !== 'thinsole') i++;
    assert.ok(i < hoof.n, 'the sole reads thin under the testers');
    s.probes.push('thinsole');
    until('toeOnly', () => p.nip(), 3);
    heelHorn();
    return verdict();
  }

  // Deep sepsis (WP13.3): hands off the swollen claw. Nip and grind the sound one, rubber block
  // on it, and the vet.
  if (L?.type === 'dds') {
    const ok = soundClaw(cd);
    p.nip(ok);
    until('trimSound', () => p.grind(ok, 270, 580, 1));
    hoof.block = ok;
    hoof.blockKind = 'rubber';
    s.blockAttempts.push(ok);
    assert.ok(done('blockSound'));
    assert.equal(s.holeCuts + s.sepsisCuts, 0, 'no blade on the swollen claw');
    s.call = cd.call;
    until('refer', () => {});
    return verdict();
  }

  // A double sole: the false sole comes off with the knife before any trimming.
  if (L?.type === 'doublesole') until('pareSole', () => p.pareSole());

  // Steps 1–2: nip both toes tip first, then grind the first claw (inner on a hind foot,
  // outer on a front) and match the other to it.
  p.nip();
  until('step1', () => p.grind(firstClaw(cd), 270, 580, 1));
  assert.equal(s.firstCutClaw, firstClaw(cd), 'trimmed the right claw first');
  until('step2', () => p.grind(secondClaw(cd), 270, 580, 1));

  // Step 3: knife the dish channel along each axial wall, around the ulcer's ringed cap, as the
  // guided run says: split each column where the flat of the blade would reach the cap.
  const dishX = (c) => { const d = dishRect(c, side); return [0, 10, 20, 30].map((k) => d.x + 4 + k); };
  until('step3', () => {
    for (const c of [CLAW.INNER, CLAW.OUTER]) {
      // The lesion on this claw (both claws carry one on a J3 pair).
      const L = hoof.lesionOn(c) ?? cd.lesion;
      const R = (L?.r ?? 0) * 1.75 + flat + 1;
      for (const x of dishX(c)) {
        // DD sits up in the cleft, clear of the dish: nothing to steer round.
        const sole = L && !['dd', 'toenecrosis', 'doublesole'].includes(L.type);
        const dx = sole ? Math.abs(x - L.x) : Infinity;
        if (!sole || c !== L.claw || dx >= R) { p.drag('knife', [[x, GEOM.dishY0], [x, GEOM.dishY1]], 120); continue; }
        const h = Math.sqrt(R * R - dx * dx);
        if (L.y - h > GEOM.dishY0 + 4) p.drag('knife', [[x, GEOM.dishY0], [x, L.y - h]], 120);
        p.drag('knife', [[x, L.y + h], [x, GEOM.dishY1]], 120);
      }
    }
  });
  if (L?.type === 'ulcer') assert.equal(hoof.capOpen, false, 'the cap is still closed after dishing');

  // Rasp both soles before the block covers one.
  until('finish', () => {
    for (const c of [CLAW.INNER, CLAW.OUTER]) {
      const bx = clawBox(c, side);
      const [a, b] = [bx.x - 8, bx.x + bx.w - 3];
      for (let y = 190; y < 600; y += 16) p.drag('rasp', [[a, y], [b, y + 4], [a, y + 8]], 400);
    }
  }, 20);

  if (hoof.lesions().length > 1) {
    // Both claws sore (J3): open each, the ulcer's cap or the abscess track. No block.
    for (const l of hoof.lesions()) {
      if (l.type === 'whiteline') {
        for (let k = 0; k < 6 && !hoof.drained; k++) p.followTrack(l);
        assert.ok(hoof.drained, 'abscess drained');
      } else openUlcer(l, () => hoof.metrics().looseRemainAt[l.claw]);
    }
    until('openBoth', () => {});
  } else if (L?.type === 'whiteline') {
    // Step 4: follow the track to the pocket until it drains, then block the sound claw.
    for (let k = 0; k < 6 && !hoof.drained; k++) p.followTrack();
    assert.ok(hoof.drained, `abscess drained (track ${(hoof.metrics().looseRemain[LOOSE.TRACT] * 100).toFixed(0)}% closed)`);
    hoof.block = soundClaw(cd);
    s.blockAttempts.push(hoof.block);
    until('drain', () => {});
  } else if (L?.type === 'foreign') {
    // Step 4: a narrow funnel down on the mark until it drains, then block the sound claw.
    for (let k = 0; k < 6 && !hoof.drained; k++) p.funnel();
    assert.ok(hoof.drained, `puncture drained (${(hoof.metrics().looseRemain[LOOSE.TRACT] * 100).toFixed(0)}% closed)`);
    hoof.block = soundClaw(cd);
    s.blockAttempts.push(hoof.block);
    until('funnel', () => {});
  } else if (L?.type === 'toenecrosis') {
    // Step 4: pare the black toe back, then the wood block on the sound claw.
    for (let k = 0; k < 4 && hoof.metrics().looseRemain[LOOSE.NECRO] >= 0.1; k++) p.necro();
    assert.ok(hoof.metrics().looseRemain[LOOSE.NECRO] < 0.1, 'black toe pared out');
    hoof.block = soundClaw(cd);
    hoof.blockKind = 'wood';
    s.blockAttempts.push(hoof.block);
    until('necro', () => {});
  } else if (L?.type === 'doublesole') {
    // Pared before the trim: nothing to open now, and no block.
  } else if (cd.requires.open) {
    openUlcer(L, () => hoof.metrics().looseRemain[LOOSE.ULCER]);
    hoof.block = soundClaw(cd);
    s.blockAttempts.push(hoof.block);
    until('step4', () => {});

  }

  heelHorn();

  if (cd.call) { s.call = cd.call; until('refer', () => {}); }

  if (cd.requires.treat && hoof.lesions().length > 1) {
    // Treat both (J3): flush each opened lesion, then pad and wrap each claw.
    const spot = (l) => l.pocket ?? l;
    until('treatBoth', () => {
      for (const l of hoof.lesions()) {
        const W = spot(l);
        if (l.type === 'whiteline') p.drag('spray', [...l.path, [W.x, W.y]], 30);
        else p.drag('spray', [[W.x - 10, W.y], [W.x + 10, W.y], [W.x - 10, W.y]], 20);
      }
      const m = hoof.metrics();
      for (const l of hoof.lesions()) {
        if (m.lesionTintAt[l.claw] < CFG.treat.tintMin) continue;
        for (let k = 0; k < 2; k++) {
          const r = applyWrap(hoof, l.claw, hoof.metrics(), trimFinished(steps()));
          assert.ok(r.ok || r.reason === 'other' || r.reason === 'done', `wrap refused: ${r.reason}`);
        }
      }
    });
  } else if (cd.requires.treat) {
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

  return verdict();

  // Step 5: flick the loose heel horn off.
  function heelHorn() {
    const H = cd.looseHorn;
    until('step5', () => {
      for (let d = -H.r; d <= H.r; d += 5) p.drag('knife', [[H.x - H.r, H.y + d], [H.x + H.r, H.y + d]], 90);
    });
  }

  // Step 4, as the guided run says: saw back and forth across the dark circle until the cap
  // gives (the knife comes off), then pare the loose edge with the blade's centre on the ring.
  function openUlcer(U, remain) {
    for (let k = 0; k < 40 && !hoof.capOpenAt[U.claw]; k++) p.drag('knife', [[U.x - U.r, U.y], [U.x + U.r, U.y], [U.x - U.r, U.y]], 160);
    assert.ok(hoof.capOpenAt[U.claw], 'cap gave');
    const ring = U.r + flat + 3;
    const orbit = [];
    for (let a = 0; a <= 48; a++) orbit.push([U.x + ring * Math.cos((a / 48) * 2 * Math.PI), U.y + ring * Math.sin((a / 48) * 2 * Math.PI)]);
    for (let k = 0; k < 6 && remain() >= 0.1; k++) p.drag('knife', orbit, 90);
    assert.ok(remain() < 0.1, 'ulcer opened');
  }

  function verdict() {
  const m = hoof.metrics();
  const { current } = evaluateSteps(m, s, hoof, ++now);
  assert.equal(current, -1, 'every step done');
  assert.equal(m.blood, 0);
  const r = scoreCase(m, s, hoof, cd);
  const parts = Object.entries(r.parts).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', ');
  if (!quiet) console.log(`playthrough ${cd.subtitle}, ${L ? `${L.type} ${L.claw === CLAW.OUTER ? 'outer' : 'inner'}` : cd.condition}: ${r.grade} ${r.total} (${parts}) · inner ${m.claws[CLAW.INNER].wbMean.toFixed(2)} ` +
    `outer ${m.claws[CLAW.OUTER].wbMean.toFixed(2)} mm · ${r.notes.join(' | ')}`);
  assert.equal(r.grade, 'Textbook', `${r.total}: ${r.notes.join(' | ')}`);
  assert.equal(r.gait, cd.call ? CALLS[cd.call].gait : 'sound');
  }
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

test('the careful player pries an old block off first, then plays the foot as it is (J2)', () => {
  for (const id of ['routine', 'ulcer', 'whiteline', 'toenecrosis']) {
    for (const seed of [1, 2]) {
      const plain = makeCase(id, seed);
      // A recheck wears its block on the sound claw; a healed routine cow on either.
      const claw = plain.lesion ? soundClaw(plain) : seed === 1 ? CLAW.OUTER : CLAW.INNER;
      playthrough(makeCase(id, seed, { oldBlock: { claw, kind: id === 'toenecrosis' ? 'wood' : 'rubber' } }), true);
    }
  }
});


// WP12.4: on the sand farm the knife wears as it pares. The bot swaps past 0.6 and still trims
// every condition to Textbook; a knife that isn't on sand changes nothing.
test('on sand the careful player swaps a worn knife and still reaches Textbook', () => {
  // One knife for the whole sweep, as it lasts a visit in the game.
  const knife = { sand: true, wear: 0, swaps: 0 };
  let cows = 0;
  for (const id of Object.keys(CONDITIONS)) {
    for (let seed = 1; seed <= 3; seed++) {
      const before = knife.wear + knife.swaps;
      playthrough(makeCase(id, seed, dealMods(seed)), true, knife);
      if (knife.wear + knife.swaps !== before) cows++;
    }
  }
  assert.ok(knife.swaps >= cows / 3, `${knife.swaps} swaps over ${cows} knifed cows: a sand cow should need about half of one`);
});

test('off sand the knife never wears, and the trim is identical to playing with no knife at all', () => {
  for (const id of ['routine', 'ulcer', 'whiteline']) {
    const a = new Hoof(makeCase(id, 2)), b = new Hoof(makeCase(id, 2));
    const knife = { sand: false, wear: 0 };
    makePlayer(a).brushAll().nip();
    makePlayer(b, { knife }).brushAll().nip();
    for (const [h, k] of [[a, null], [b, knife]]) for (let x = 120; x < 300; x += 6) makePlayer(h, { knife: k }).drag('knife', [[x, 260], [x, 560]], 120);
    assert.equal(knife.wear, 0);
    assert.deepEqual(b.thick, a.thick);
  }
});
