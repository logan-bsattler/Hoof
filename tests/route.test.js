// WP7.4: the trimmer's route. Farms, visits, reputation and the round's state.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CASE_B } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';
import { CFG } from '../src/config.js';
import {
  FARMS, HOUSING, POINTS, HERD_BONUS, farmMods, visitCases, cowSeed, cowPoints,
  newRoute, startVisit, recordCow, endVisit, openFarms, nextLocked,
} from '../src/route.js';

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
  assert.deepEqual(Object.keys(route.history[0]).sort(), ['condition', 'farm', 'foot', 'grade', 'lame', 'seed', 'side', 'tag', 'visit']);
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
