// WP7.4: the trimmer's route. Farms, visits, reputation and the round's state.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CASE_B, makeCase } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';
import { CFG } from '../src/config.js';
import {
  FARMS, HOUSING, POINTS, HERD_BONUS, farmMods, herdDeck, visitCases, cowSeed, cowPoints,
  newRoute, startVisit, recordCow, endVisit, openFarms, nextLocked,
  farmCows, healedBack, backLine, TIERS, tierFor, tierMods, farmById,
  SEASONS, SEASON_DAYS, daysDone, seasonFor, seasonById, farmMix, visitHerd,
} from '../src/route.js';
import { Hoof, CLAW } from '../src/hoof.js';

const tag = (cd) => cd.subtitle.split(' · ')[0];
const result = (grade, gait = 'sound') => ({ failed: false, grade, gait });

test('farms: one road, opening in order from reputation 0, each a valid profile', () => {
  assert.ok(FARMS.length >= 6 && FARMS.length <= 8);
  assert.equal(FARMS[0].rep, 0);
  assert.equal(new Set(FARMS.map((f) => f.id)).size, FARMS.length, 'unique ids');
  for (let k = 1; k < FARMS.length; k++) assert.ok(FARMS[k].rep > FARMS[k - 1].rep, `${FARMS[k].name} opens after ${FARMS[k - 1].name}`);
  for (const f of FARMS) {
    assert.ok(f.cows >= 3 && f.cows <= 6, `${f.name}: 3–6 cows`);
    assert.ok(HOUSING[f.housing], `${f.name}: known housing`);
    assert.ok(f.intro && f.farmer && f.name);
    for (const id of Object.keys(f.mix)) assert.ok(CONDITIONS[id], `${f.name}: ${id} is a condition`);
    for (const k of ['growth', 'mud', 'temper']) assert.ok(f[k][0] <= f[k][1], `${f.name}: ${k} range`);
    assert.ok(f.front >= 0 && f.front <= 1);
  }
  // Every condition turns up somewhere on the road, and the first farm is easy-going.
  for (const id of Object.keys(CONDITIONS)) assert.ok(FARMS.some((f) => f.mix[id]), `${id} on the road`);
  assert.ok(FARMS[0].temper[1] <= 0.4 && FARMS[0].front === 0, 'the first farm is calm, hind feet only');
});

test('farm 1 is the tutorial: its first visit opens on Case B, with the guided trim', () => {
  const herd = visitCases(FARMS[0], 1);
  assert.equal(herd[0], CASE_B);
  assert.equal(herd[0].condition, 'ulcer');
  assert.equal(herd[0].foot, 'hind');
  // Later visits deal fresh cows.
  assert.notEqual(visitCases(FARMS[0], 2)[0], CASE_B);
});

test('a visit deals the farm’s fixed number of cows, the same herd every time, with unique tags', () => {
  for (const f of FARMS) {
    for (const visit of [1, 2, 3]) {
      const a = visitCases(f, visit), b = visitCases(f, visit);
      assert.equal(a.length, f.cows);
      assert.deepEqual(a.map(tag), b.map(tag), `${f.name} visit ${visit} is deterministic`);
      assert.equal(new Set(a.map(tag)).size, a.length, `${f.name} visit ${visit}: unique tags`);
    }
    assert.notDeepEqual(visitCases(f, 1).map(tag), visitCases(f, 2).map(tag), `${f.name}: a new visit, new cows`);
  }
  assert.notEqual(cowSeed(FARMS[1], 1, 0), cowSeed(FARMS[2], 1, 0));
});

test('a first visit deals the farm’s mix as a deck, not a streak', () => {
  const count = (list) => list.reduce((m, c) => ({ ...m, [c]: (m[c] ?? 0) + 1 }), {});
  assert.deepEqual(count(herdDeck(FARMS[0])), { routine: 2, ulcer: 1 }, 'Willow Bank: one ulcer, two routine');
  assert.deepEqual(count(herdDeck(FARMS[1])), { routine: 2, whiteline: 1, puncture: 1 }, 'Hollins brings its white line and a puncture');
  assert.equal(count(herdDeck(farmById('greystone'))).nonfoot, 1, 'Greystone brings a cow lame up the leg (D26)');
  for (const f of FARMS) {
    const deck = herdDeck(f);
    assert.equal(deck.length, f.cows);
    assert.ok(Object.keys(f.mix).every((id) => deck.includes(id)), `${f.name}: every condition in the deck`);
    for (const visit of [1, 2, 3]) {
      assert.deepEqual(count(visitCases(f, visit).map((cd) => cd.condition)), count(deck), `${f.name} visit ${visit} deals the deck`);
    }
  }
});

test('farm cows follow the farm: its conditions, and mods inside its ranges', () => {
  for (const f of FARMS) {
    const seen = new Set();
    let front = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const { condition, mods } = farmMods(f, seed);
      assert.ok(f.mix[condition], `${f.name} dealt ${condition}`);
      seen.add(condition);
      for (const k of ['growth', 'mud', 'temper']) assert.ok(mods[k] >= f[k][0] && mods[k] <= f[k][1], `${f.name} ${k} ${mods[k]}`);
      if (f.decoys) assert.ok(mods.decoyCount >= f.decoys[0] && mods.decoyCount <= f.decoys[1]);
      if (mods.foot === 'front') front++;
    }
    assert.equal(seen.size, Object.keys(f.mix).length, `${f.name}: every condition in its mix turns up`);
    assert.ok(Math.abs(front / 400 - f.front) < 0.08, `${f.name}: front feet ${front / 400} vs ${f.front}`);
  }
});

test('reputation per cow follows the grade; a lame walk-off or blood earns nothing', () => {
  for (const g of CFG.grades) assert.ok(g.name in POINTS, `${g.name} has points`);
  const order = CFG.grades.map((g) => POINTS[g.name]);
  for (let k = 1; k < order.length; k++) assert.ok(order[k] < order[k - 1], 'better grades earn more');
  assert.deepEqual(cowPoints(result('Textbook')), { points: POINTS.Textbook, lame: false });
  assert.deepEqual(cowPoints(result('Clean', 'lame')), { points: 0, lame: true });
  assert.deepEqual(cowPoints({ failed: true, grade: 'Failed', gait: 'lame' }), { points: 0, lame: true });
});

test('a day at a farm banks the cows’ points, the herd bonus, and opens the next farm', () => {
  const route = newRoute();
  assert.throws(() => startVisit(route, FARMS[1].id), /needs reputation/);
  const herd = startVisit(route, FARMS[0].id);
  assert.equal(route.visit.n, 1);
  for (let k = 0; k < herd.length; k++) {
    const r = recordCow(route, herd[k], result('Textbook'));
    assert.equal(r.points, POINTS.Textbook);
    assert.equal(r.last, k === herd.length - 1);
  }
  const d = endVisit(route);
  assert.equal(d.earned, herd.length * POINTS.Textbook + HERD_BONUS);
  assert.equal(route.rep, d.earned);
  assert.equal(d.herdSound, true);
  assert.deepEqual(d.opened.map((f) => f.id), FARMS.filter((f) => f.rep > 0 && f.rep <= d.earned).map((f) => f.id));
  assert.equal(route.visit, null);
  assert.equal(route.visits[FARMS[0].id], 1);
  assert.equal(route.best[FARMS[0].id], d.earned);
  assert.equal(route.history.length, herd.length);
  assert.deepEqual(Object.keys(route.history[0]).sort(), ['back', 'call', 'condition', 'farm', 'foot', 'grade', 'lame', 'seed', 'side', 'tag', 'visit']);
  // The round is plain data, ready to save as JSON (WP7.7).
  assert.deepEqual(JSON.parse(JSON.stringify(route)), route);
});

test('reputation only goes up: a bad day earns little, a lame cow is flagged, nothing is taken away', () => {
  const route = newRoute();
  route.rep = 30;
  const herd = startVisit(route, FARMS[0].id);
  recordCow(route, herd[0], { failed: true, grade: 'Failed', gait: 'lame' });
  for (let k = 1; k < herd.length; k++) recordCow(route, herd[k], result('Needs work', 'tender'));
  const d = endVisit(route);
  assert.equal(d.herdSound, false);
  assert.equal(d.bonus, 0);
  assert.equal(d.earned, (herd.length - 1) * POINTS['Needs work']);
  assert.ok(route.rep >= 30);
  assert.equal(route.history.filter((h) => h.lame).length, 1, 'the lame cow is flagged for the return visit');
  // A second visit to the same farm is visit 2 with a fresh herd.
  startVisit(route, FARMS[0].id);
  assert.equal(route.visit.n, 2);
});

test('pacing: a careful trimmer opens the whole road in a fortnight; a middling one still gets there', () => {
  const days = (grade) => {
    const route = newRoute();
    let n = 0;
    while (nextLocked(route) && n < 200) {
      // Drive to the furthest open farm.
      const open = openFarms(route);
      const herd = startVisit(route, open[open.length - 1].id);
      for (const cd of herd) recordCow(route, cd, result(grade));
      endVisit(route);
      n++;
    }
    return n;
  };
  const best = days('Textbook'), ok = days('Sound');
  assert.ok(best >= FARMS.length - 1 && best <= 14, `Textbook: ${best} days`);
  assert.ok(ok > best && ok < 60, `Sound: ${ok} days`);
  console.log(`route pacing: all farms open after ${best} days at Textbook, ${ok} at Sound`);
});

// ------------------------------------------------------------------ WP7.5 return visits

// Play one day at a farm: `lameAt` lists the cows (by position) that go off lame.
function playDay(route, farmId, lameAt = []) {
  const herd = startVisit(route, farmId);
  herd.forEach((cd, k) => recordCow(route, cd, lameAt.includes(k) ? result('Needs work', 'lame') : result('Clean')));
  return { herd, day: endVisit(route) };
}

test('a return visit deals the lame cows back as rechecks, a few healed ones, then fresh cows', () => {
  const farm = FARMS[2]; // Brackenford, 4 cows
  const route = newRoute();
  route.rep = farm.rep;
  const { herd: first } = playDay(route, farm.id, [1]);
  const herd = startVisit(route, farm.id);
  assert.equal(herd.length, farm.cows, 'the herd size stays fixed');
  assert.equal(new Set(herd.map(tag)).size, herd.length, 'unique tags');

  // The lame cow comes first: same tag, condition, foot and side, the lesion no smaller.
  const was = first[1], re = herd[0];
  assert.equal(tag(re), tag(was));
  assert.equal(re.back.outcome, 'recheck');
  assert.equal(re.back.visit, 1);
  assert.deepEqual([re.condition, re.foot, re.side, re.seed], [was.condition, was.foot, was.side, was.seed]);
  // Same cow, and she remembers going off lame: livelier, and the intro says so (WP12.1).
  assert.equal(re.temper, Math.min(1, was.temper + 0.15), 'same cow, a little warier');
  assert.equal(re.back.mood, 'hurt');
  assert.match(backLine(re), /won’t walk in/);
  if (was.lesion) {
    assert.equal(re.lesion.claw, was.lesion.claw, 'the lesion is where it was');
    assert.ok(re.lesion.r >= was.lesion.r, `the lesion is no smaller: ${re.lesion.r} vs ${was.lesion.r}`);
  }
  assert.match(backLine(re), /recheck/);

  // Then the healed cows: earlier tags, now a routine trim on the same foot.
  const healed = herd.filter((cd) => cd.back?.outcome === 'healed');
  assert.equal(healed.length, healedBack(farm));
  const before = new Map(first.map((cd) => [tag(cd), cd]));
  for (const cd of healed) {
    const old = before.get(tag(cd));
    assert.ok(old && tag(old) !== tag(was), 'a healed cow walked off well last time');
    assert.equal(cd.condition, 'routine');
    assert.equal(cd.lesion, null);
    assert.deepEqual([cd.foot, cd.side], [old.foot, old.side]);
    assert.ok(backLine(cd).length > 0);
    // A Clean job last time: she walks straight in, a little calmer.
    assert.equal(cd.temper, Math.max(0, old.temper - 0.1));
    assert.match(backLine(cd), /straight into the crush/);
  }

  // The rest are new to the farm: no tag it has seen before.
  const fresh = herd.filter((cd) => !cd.back);
  // A cow that was close to calving last time is back too, fresh (J1).
  const calved = herd.filter((cd) => cd.back?.outcome === 'calved');
  assert.equal(calved.length, first.filter((cd) => cd.calving && cd !== was).length);
  assert.equal(fresh.length, farm.cows - 1 - healed.length - calved.length);
  for (const cd of fresh) assert.ok(!before.has(tag(cd)), `${tag(cd)} is new to the farm`);
  // The same history always deals the same herd.
  assert.deepEqual(visitCases(farm, 2, route.history).map(tag), herd.map(tag));
});

test('Case B comes back as Case B: the hand-placed ulcer, a little bigger, or healed', () => {
  const lame = newRoute();
  playDay(lame, FARMS[0].id, [0]);
  const [re] = startVisit(lame, FARMS[0].id);
  assert.equal(tag(re), tag(CASE_B));
  assert.equal(re.back.outcome, 'recheck');
  assert.deepEqual([re.lesion.x, re.lesion.y, re.lesion.r], [CASE_B.lesion.x, CASE_B.lesion.y, CASE_B.lesion.r + 2]);
  assert.deepEqual(re.looseHorn, CASE_B.looseHorn);

  const well = newRoute();
  playDay(well, FARMS[0].id);
  const back = startVisit(well, FARMS[0].id).filter((cd) => cd.back);
  assert.equal(back.length, healedBack(FARMS[0]));
  for (const cd of back) {
    assert.equal(cd.condition, 'routine');
    assert.equal(cd.lesion, null, 'no hand-placed ulcer on a healed cow');
  }
});

test('a recheck that walks off sound is mended and earns her points; one still lame comes back again', () => {
  const farm = FARMS[1];
  const route = newRoute();
  route.rep = farm.rep;
  const { herd: day1 } = playDay(route, farm.id, [0, 2]);
  const sore = [tag(day1[0]), tag(day1[2])];
  // Day 2: the first recheck goes well, the second goes lame again.
  const herd = startVisit(route, farm.id);
  assert.deepEqual(herd.slice(0, 2).map(tag), sore);
  const r0 = recordCow(route, herd[0], result('Clean'));
  assert.equal(r0.points, POINTS.Clean, 'the points she missed are there to earn');
  assert.equal(r0.back, 'recheck');
  recordCow(route, herd[1], result('Needs work', 'lame'));
  for (let k = 2; k < herd.length; k++) recordCow(route, herd[k], result('Clean'));
  const d = endVisit(route);
  assert.deepEqual(d.mended, [sore[0]]);
  assert.deepEqual(farmCows(route.history, farm.id).filter((h) => h.lame).map((h) => h.tag), [sore[1]]);
  assert.equal(route.history.find((h) => h.visit === 2 && h.tag === sore[0]).back, 'recheck');
  // Day 3: only the cow still lame is a recheck.
  const third = startVisit(route, farm.id);
  assert.deepEqual(third.filter((cd) => cd.back?.outcome === 'recheck').map(tag), [sore[1]]);
  assert.deepEqual(JSON.parse(JSON.stringify(route)), route);
});

test('return cows build on every farm, visit after visit, whatever went lame', () => {
  for (const farm of FARMS) {
    const route = newRoute();
    route.rep = farm.rep;
    for (let day = 1; day <= 4; day++) {
      const herd = startVisit(route, farm.id);
      assert.equal(herd.length, farm.cows);
      assert.equal(new Set(herd.map(tag)).size, herd.length, `${farm.name} day ${day}: unique tags`);
      herd.forEach((cd, k) => {
        assert.ok(new Hoof(cd), `${farm.name} day ${day}: ${tag(cd)} builds`);
        if (cd.back) assert.ok(backLine(cd), 'a returning cow says what happened last time');
        // Every other cow goes lame, on alternating positions.
        recordCow(route, cd, (k + day) % 2 ? result('Sound', 'lame') : result('Textbook'));
      });
      endVisit(route);
      if (day > 1) assert.ok(herd.some((cd) => cd.back), `${farm.name} day ${day}: some cows come back`);
    }
  }
});

// ------------------------------------------------------------------ WP7.6 difficulty ramp

test('tiers: the help turns down with reputation, each step opening with a farm, ending at today’s band', () => {
  assert.equal(TIERS[0].rep, 0);
  assert.deepEqual(TIERS.map((t) => t.guides), ['on', 'mistake', 'off']);
  for (let k = 1; k < TIERS.length; k++) {
    assert.ok(TIERS[k].rep > TIERS[k - 1].rep);
    assert.ok(TIERS[k].tolerance < TIERS[k - 1].tolerance, 'the band narrows');
    assert.ok(TIERS[k].temper >= TIERS[k - 1].temper, 'cows get livelier');
    assert.ok(FARMS.some((f) => f.rep === TIERS[k].rep), `${TIERS[k].name} opens with a farm`);
  }
  assert.equal(TIERS[TIERS.length - 1].tolerance, CFG.sole.tolerance);
  assert.equal(tierFor(0).id, 'apprentice');
  assert.equal(tierFor(TIERS[1].rep - 1).id, 'apprentice');
  assert.equal(tierFor(TIERS[1].rep).id, 'journeyman');
  assert.equal(tierFor(9999).id, 'master');
});

test('tierMods: calmer cows and an extra decoy early, livelier later, inside 0..1', () => {
  const mods = { foot: 'hind', growth: 1, mud: 1, temper: 0.05 };
  assert.equal(tierMods(null, mods), mods);
  const early = tierMods(TIERS[0], mods);
  assert.equal(early.temper, 0, 'clamped at calm');
  assert.equal(early.decoyCount, 3);
  assert.equal(tierMods(TIERS[0], { ...mods, decoyCount: 1 }).decoyCount, 2);
  const late = tierMods(TIERS[2], { ...mods, temper: 0.97 });
  assert.equal(late.temper, 1, 'clamped at lively');
  assert.equal(late.decoyCount, undefined);
});

test('a visit deals its cows with the tier’s band; Case B itself is never changed', () => {
  const route = newRoute();
  const herd = startVisit(route, FARMS[0].id);
  assert.ok(herd.every((cd) => cd.tolerance === TIERS[0].tolerance));
  assert.equal(tag(herd[0]), tag(CASE_B));
  assert.equal(CASE_B.tolerance, undefined);
  route.visit = null;
  route.rep = 300;
  assert.ok(startVisit(route, FARMS[4].id).every((cd) => cd.tolerance === TIERS[2].tolerance));
  // The tier leans the fresh cows only: with no tier the herd is as before.
  assert.deepEqual(visitCases(FARMS[1], 1).map(tag), visitCases(FARMS[1], 1, [], TIERS[0]).map(tag));
});

test('a cow sent off the line is recorded with her call, earns her grade and is not lame', () => {
  const route = newRoute();
  const herd = startVisit(route, FARMS[0].id);
  const r = recordCow(route, herd[0], { failed: false, grade: 'Clean', gait: 'to the vet', call: 'vet' });
  assert.deepEqual(r, { points: POINTS.Clean, lame: false, back: null, last: false });
  assert.equal(route.visit.rows[0].call, 'vet');
  assert.equal(route.history[0].call, 'vet');
  recordCow(route, herd[1], result('Clean'));
  assert.equal(route.history[1].call, null);
});

test('toe necrosis always comes back for a recheck, smaller after a Textbook job', () => {
  const farm = farmById('ridgeway');
  const route = { ...newRoute(), rep: farm.rep };
  const herd = startVisit(route, farm.id);
  const toe = herd.find((cd) => cd.condition === 'toenecrosis');
  assert.ok(toe, 'the first Ridgeway visit deals a toe necrosis cow');
  for (const cd of herd) recordCow(route, cd, { grade: 'Textbook', gait: cd === toe ? 'to the vet' : 'sound', call: cd === toe ? 'vet' : null });
  endVisit(route);
  const tag = toe.subtitle.split(' · ')[0];
  const h = route.history.find((r) => r.tag === tag);
  assert.equal(h.recheck, true);
  assert.equal(h.lame, false);
  const back = visitCases(farm, 2, route.history).find((cd) => cd.subtitle.startsWith(tag));
  assert.ok(back, 'she comes back on the next visit');
  assert.equal(back.back.outcome, 'recheck');
  assert.equal(back.condition, 'toenecrosis');
  assert.ok(back.lesion.r < 15, `a Textbook job leaves a small patch (r ${back.lesion.r.toFixed(1)})`);
  assert.match(backLine(back), /recheck/);
});

// ------------------------------------------------------------------ WP9 J1 close to calving
test('close to calving: only routine feet, only past Hollins; the call is leave, the cue is in the intro', () => {
  for (const f of FARMS) {
    let n = 0, routine = 0;
    for (let visit = 1; visit <= 12; visit++) {
      for (const cd of visitCases(f, visit)) {
        if (cd.condition === 'routine') routine++;
        if (!cd.calving) continue;
        n++;
        assert.equal(cd.condition, 'routine', `${f.name}: a calving cow is a routine foot`);
        assert.equal(cd.call, 'leave');
        assert.match(cd.intro, new RegExp(`due to calve in ${cd.calving} days`));
        assert.ok(cd.calving >= 4 && cd.calving <= 12);
      }
    }
    if (!f.calving) assert.equal(n, 0, `${f.name} has no calving cows`);
    else assert.ok(n > 0 && n < routine, `${f.name}: ${n} of ${routine} routine cows close to calving`);
  }
  // The same seed with and without the flag: everything but the call and intro is the same foot.
  const seed = 321, plain = makeCase('routine', seed), due = makeCase('routine', seed, { calving: true });
  assert.deepEqual(due.findings, plain.findings);
  assert.deepEqual(due.steps, plain.steps, 'the step list doesn’t give the call away');
  assert.equal(makeCase('ulcer', seed, { calving: true }).calving, undefined, 'only routine feet');
});

test('a calving cow comes back fresh next visit, as a routine trim, however she was handled', () => {
  const farm = farmById('brackenford');
  for (const call of ['leave', null]) {
    const route = newRoute();
    route.rep = farm.rep;
    let v = 1, herd;
    for (; v <= 12; v++) {
      herd = startVisit(route, farm.id);
      if (herd.some((cd) => cd.calving)) break;
      herd.forEach((cd) => recordCow(route, cd, result('Clean')));
      endVisit(route);
    }
    const cow = herd.find((cd) => cd.calving);
    assert.ok(cow, 'a calving cow turns up within 12 visits');
    herd.forEach((cd) => recordCow(route, cd, cd === cow ? { ...result('Textbook', call ? 'left till dry-off' : 'sound'), call } : result('Clean')));
    endVisit(route);
    assert.equal(route.history.at(-herd.length + herd.indexOf(cow)).calving, true);
    const next = visitCases(farm, v + 1, route.history);
    const back = next.find((cd) => tag(cd) === tag(cow));
    assert.ok(back, 'she comes back');
    assert.equal(back.back.outcome, 'calved');
    assert.equal(back.condition, 'routine');
    assert.ok(!back.calving, 'fresh now, not due again');
    assert.match(backLine(back), /calved/);
  }
});

// ------------------------------------------------------------------ WP9 J2 an old block still on
test('old block: a blocked cow is recorded so; a recheck comes back wearing it, a healed one half the time', () => {
  const farm = farmById('hollins');
  let rechecks = 0, healedOn = 0, healedOff = 0;
  for (let run = 0; run < 12; run++) {
    const route = newRoute();
    route.rep = farm.rep;
    // Visits to move the seeds along, so each run's second visit is a different day.
    for (let v = 0; v < run; v++) { startVisit(route, farm.id).forEach((cd) => recordCow(route, cd, result('Clean'))); endVisit(route); }
    const herd = startVisit(route, farm.id);
    // Every cow goes off in a block on her outer claw; the first one lame.
    herd.forEach((cd, k) => recordCow(route, cd, { ...result('Clean', k ? 'sound' : 'lame'), block: { claw: CLAW.OUTER, kind: 'rubber' } }));
    endVisit(route);
    assert.equal(route.history.at(-1).blocked, 'rubber');
    assert.equal(route.history.at(-1).blockClaw, CLAW.OUTER);
    const next = visitCases(farm, run + 2, route.history);
    for (const cd of next.filter((c) => c.back)) {
      if (cd.back.outcome === 'recheck') {
        rechecks++;
        assert.deepEqual(cd.oldBlock, { claw: CLAW.OUTER, kind: 'rubber' }, 'a recheck still has it on');
      } else if (cd.oldBlock) healedOn++;
      else healedOff++;
      if (cd.oldBlock) {
        assert.equal(cd.steps[0], 'unblock');
        assert.match(backLine(cd), /still wearing the block from visit/);
        assert.equal(new Hoof(cd).block, CLAW.OUTER);
      } else assert.ok(!cd.steps.includes('unblock'));
    }
  }
  assert.ok(rechecks >= 12, `${rechecks} rechecks`);
  assert.ok(healedOn > 0 && healedOff > 0, `healed cows: ${healedOn} still blocked, ${healedOff} not`);
  // A cow with no block on record never comes back wearing one.
  const route = newRoute();
  route.rep = farm.rep;
  startVisit(route, farm.id).forEach((cd, k) => recordCow(route, cd, result('Clean', k ? 'sound' : 'lame')));
  endVisit(route);
  assert.ok(visitCases(farm, 2, route.history).every((cd) => !cd.oldBlock));
});

test('known kicker: about one visit in three past Hollins, at most one a visit, and she stays one (WP12.2)', () => {
  for (const f of FARMS.slice(0, 2)) for (let v = 1; v <= 30; v++) assert.ok(!visitCases(f, v).some((cd) => cd.kicker), `${f.name} has no kickers`);
  const farm = farmById('greystone');
  let visits = 0;
  for (let v = 1; v <= 60; v++) {
    const kickers = visitCases(farm, v).filter((cd) => cd.kicker);
    assert.ok(kickers.length <= 1, 'at most one a visit');
    for (const cd of kickers) {
      assert.ok(cd.temper >= CFG.temper.kickFrom, `she kicks: temper ${cd.temper}`);
      assert.match(cd.traits, /she kicks/);
    }
    visits += kickers.length;
  }
  assert.ok(visits >= 12 && visits <= 28, `kicker visits ${visits} of 60`);

  // Recorded, and she comes back a kicker.
  const route = newRoute();
  route.rep = farm.rep;
  let herd = startVisit(route, farm.id);
  for (let v = 1; !herd.some((cd) => cd.kicker); v++) {
    assert.ok(v < 30, 'a kicker turns up');
    herd.forEach((cd) => recordCow(route, cd, result('Clean')));
    endVisit(route);
    herd = startVisit(route, farm.id);
  }
  const k = herd.find((cd) => cd.kicker);
  herd.forEach((cd) => recordCow(route, cd, result('Needs work', cd === k ? 'lame' : 'sound')));
  assert.equal(route.history.at(-herd.length + herd.indexOf(k)).kicker, true);
  endVisit(route);
  const next = startVisit(route, farm.id);
  const again = next.find((cd) => tag(cd) === tag(k));
  assert.ok(again?.kicker && again.temper >= CFG.temper.kickFrom, 'a known kicker comes back one');
  assert.ok(next.filter((cd) => cd.kicker).length <= 1);
});

test('footbath: every farm has one; no footbath raises the DD share, a good one cuts it (WP12.3)', async () => {
  const { FOOTBATH, farmMix } = await import('../src/route.js');
  for (const f of FARMS) assert.ok(FOOTBATH[f.footbath], `${f.name} has a footbath`);
  const marsh = farmById('marshend');
  assert.ok(farmMix(marsh).dd > marsh.mix.dd);
  assert.ok(farmMix({ ...marsh, footbath: 'good' }).dd < marsh.mix.dd);
  assert.equal(farmMix(farmById('greystone')).dd, farmById('greystone').mix.dd);
});

test('a stripped ulcer in a block always comes back a recheck, block thrown, and she remembers it (WP14.1)', () => {
  const farm = farmById('brackenford');
  const route = newRoute();
  route.rep = farm.rep;
  const herd = startVisit(route, farm.id);
  // Every cow goes off sound in a block, the first with the ring round her ulcer stripped.
  const ulcer = herd.find((cd) => cd.condition === 'ulcer');
  assert.ok(ulcer, 'Brackenford deals an ulcer');
  for (const cd of herd) recordCow(route, cd, { ...result('Clean'), block: { claw: CLAW.INNER, kind: 'rubber' }, ...(cd === ulcer ? { stripped: true } : {}) });
  endVisit(route);
  const row = route.history.find((h) => h.tag === tag(ulcer));
  assert.equal(row.stripped, true);
  assert.equal(route.history.filter((h) => h.stripped).length, 1, 'only the stripped cow is marked');
  const cd = visitCases(farm, 2, route.history).find((c) => tag(c) === tag(ulcer));
  assert.ok(cd, 'she comes back');
  assert.equal(cd.back.outcome, 'recheck');
  assert.equal(cd.condition, 'ulcer');
  assert.equal(cd.oldBlock, undefined, 'the block is gone');
  assert.equal(cd.back.mood, 'hurt');
  assert.match(backLine(cd), /threw her block ten days on .* The Pryce brothers rang you back\./);
  assert.ok(!backLine(cd).includes('still wearing'));
  // Stripped but never blocked: nothing to throw, so she heals as any sound cow does.
  const r2 = newRoute();
  r2.rep = farm.rep;
  startVisit(r2, farm.id).forEach((c) => recordCow(r2, c, { ...result('Clean'), ...(c.condition === 'ulcer' ? { stripped: true } : {}) }));
  endVisit(r2);
  const again = visitCases(farm, 2, r2.history).find((c) => tag(c) === tag(ulcer));
  assert.ok(!again || again.back.outcome === 'healed');
});

test('the new decoys deal from Top Lane on; the first three farms keep stain and bruise (WP14.2)', () => {
  const kinds = (farm) => new Set([1, 2, 3].flatMap((v) => visitCases(farm, v).flatMap((cd) => cd.findings.map((f) => f.kind))));
  for (const f of FARMS) {
    const early = FARMS.indexOf(f) < FARMS.indexOf(farmById('toplane'));
    assert.equal(!!farmMods(f, 7).mods.decoyKinds, !early, f.name);
    if (early) for (const k of kinds(f)) assert.ok(!['fade', 'pigment', 'haem'].includes(k), `${f.name} dealt ${k}`);
  }
  const late = new Set(FARMS.slice(FARMS.indexOf(farmById('toplane'))).flatMap((f) => [...kinds(f)]));
  for (const k of ['fade', 'pigment', 'haem']) assert.ok(late.has(k), `${k} turns up past Top Lane`);
});

test('a dug decoy comes back as an old pit, recheck or healed (WP14.2)', () => {
  const farm = farmById('hollins');
  const route = newRoute();
  route.rep = farm.rep;
  const herd = startVisit(route, farm.id);
  // The first cow goes off lame, the second sound; each had her first decoy dug out.
  const decoyOf = (cd) => cd.findings.find((f) => !(cd.lesion && f.kind === cd.lesion.type && f.claw === cd.lesion.claw));
  const pitOf = (cd) => { const f = decoyOf(cd); return { claw: f.claw, x: Math.round(f.x), y: Math.round(f.y) }; };
  herd.forEach((cd, k) => recordCow(route, cd, { ...result('Clean', k === 0 ? 'lame' : 'sound'), pits: [pitOf(cd)] }));
  endVisit(route);
  assert.deepEqual(route.history.find((h) => h.tag === tag(herd[0])).pits, [pitOf(herd[0])]);
  const back = visitCases(farm, 2, route.history);
  const lame = back.find((c) => tag(c) === tag(herd[0]));
  assert.equal(lame.back.outcome, 'recheck');
  const pit = lame.findings.find((f) => f.kind === 'pit');
  assert.ok(pit, 'the pit is back');
  assert.deepEqual([pit.claw, pit.x, pit.y], [pitOf(herd[0]).claw, pitOf(herd[0]).x, pitOf(herd[0]).y]);
  assert.match(pit.probeText, /old pared hole/);
  // The mark she had there is gone: the pit takes its place.
  assert.ok(lame.findings.every((f) => f === pit || Math.hypot(f.x - pit.x, f.y - pit.y) > 30));
  const healed = back.filter((c) => c.back?.outcome === 'healed');
  assert.ok(healed.some((c) => c.findings.some((f) => f.kind === 'pit')), 'at least one healed cow has her pit');
  // A malformed pit in a save is dropped, never a throw.
  route.history[0].pits = [{ claw: 7, x: 'a' }, null];
  assert.ok(!visitCases(farm, 2, route.history).find((c) => tag(c) === tag(herd[0])).findings.some((f) => f.kind === 'pit'));
});

// ------------------------------------------------------------------ WP15.1 seasons
test('the calendar: three days a season from spring, round the year, and every day done counts', () => {
  assert.equal(SEASON_DAYS, 3);
  assert.deepEqual([0, 2, 3, 6, 9, 12].map((d) => seasonFor(d).id), ['spring', 'spring', 'summer', 'autumn', 'winter', 'spring']);
  assert.equal(seasonById('nope').id, 'spring');
  const route = newRoute();
  assert.equal(daysDone(route), 0);
  let d;
  for (let k = 0; k < 3; k++) {
    startVisit(route, 'willowbank').forEach((cd) => recordCow(route, cd, result('Clean')));
    d = endVisit(route);
    assert.equal(d.turned?.id ?? null, k === 2 ? 'summer' : null, `day ${k + 1}`);
  }
  assert.equal(daysDone(route), 3);
  assert.equal(d.season.id, 'summer');
});

test('a season leans the mix, but never at Willow Bank or Hollins (D54)', () => {
  const summer = seasonById('summer'), winter = seasonById('winter');
  for (const f of FARMS.slice(0, 2)) for (const s of SEASONS) {
    assert.deepEqual(herdDeck(f, s), herdDeck(f), `${f.name} ${s.id}`);
    for (let v = 1; v <= 4; v++) assert.deepEqual(visitCases(f, v, [], null, s).map(tag), visitCases(f, v).map(tag));
  }
  const top = farmById('toplane');
  assert.ok(farmMix(top, summer).whiteline > farmMix(top, winter).whiteline);
  assert.ok(farmMix(farmById('marshend'), summer).dd > farmMix(farmById('marshend')).dd);
  // Over many visits, a summer Top Lane deals half again as many white lines as a winter one.
  const count = (s) => { let n = 0; for (let v = 1; v <= 40; v++) n += visitCases(top, v, [], null, s).filter((cd) => cd.condition === 'whiteline').length; return n; };
  const hot = count(summer), cold = count(winter);
  assert.ok(hot >= cold * 1.5, `white lines: summer ${hot}, winter ${cold}`);
  // Wet seasons bring more mud.
  const mud = (s) => farmMods(top, 4242, s).mods.mud;
  assert.ok(Math.abs(mud(seasonById('autumn')) - mud(summer) - 0.1) < 1e-9);
});

test('the season is fixed for a day: a reload mid-day deals the same herd', () => {
  const route = newRoute();
  route.rep = 999;
  for (let k = 0; k < 2; k++) { startVisit(route, 'toplane').forEach((cd) => recordCow(route, cd, result('Clean'))); endVisit(route); }
  const herd = startVisit(route, 'marshend');
  recordCow(route, herd[0], result('Clean'));
  // The calendar hasn't moved for the day in progress.
  assert.equal(daysDone(route), 2);
  const again = visitHerd(JSON.parse(JSON.stringify(route)));
  assert.deepEqual(again.map(tag), herd.map(tag));
  assert.deepEqual(again.map((cd) => cd.condition), herd.map((cd) => cd.condition));
});
