// WP7.4: the trimmer's route. Farms, visits, reputation and the round's state.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CASE_B } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';
import { CFG } from '../src/config.js';
import {
  FARMS, HOUSING, POINTS, HERD_BONUS, farmMods, visitCases, cowSeed, cowPoints,
  newRoute, startVisit, recordCow, endVisit, openFarms, nextLocked,
  farmCows, healedBack, backLine, TIERS, tierFor, tierMods,
} from '../src/route.js';
import { Hoof } from '../src/hoof.js';

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
  assert.deepEqual(Object.keys(route.history[0]).sort(), ['back', 'condition', 'farm', 'foot', 'grade', 'lame', 'seed', 'side', 'tag', 'visit']);
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

test('pacing: a careful trimmer opens the whole road in a dozen days; a middling one still gets there', () => {
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
  assert.ok(best >= FARMS.length - 1 && best <= 12, `Textbook: ${best} days`);
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
  assert.equal(re.temper, was.temper, 'same cow, same temperament');
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
  }

  // The rest are new to the farm: no tag it has seen before.
  const fresh = herd.filter((cd) => !cd.back);
  assert.equal(fresh.length, farm.cows - 1 - healed.length);
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
