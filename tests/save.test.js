// WP7.7: saving the round. Save, reload, same state, mid-day included; anything broken falls back.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FARMS, newRoute, startVisit, recordCow, endVisit, visitCases, visitHerd, tierFor } from '../src/route.js';
import { SAVE_KEY, loadRound, saveRound, clearRound, parseRound, hasProgress } from '../src/save.js';

// A stand-in for localStorage.
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
};
const blocked = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
const tag = (cd) => cd.subtitle.split(' · ')[0];

function playedRound() {
  const route = newRoute();
  for (let day = 0; day < 3; day++) {
    const herd = startVisit(route, FARMS[0].id);
    herd.forEach((cd, k) => recordCow(route, cd, { failed: false, grade: 'Textbook', gait: k === 1 ? 'lame' : 'sound' }));
    endVisit(route);
  }
  return route;
}

test('save, reload: the same round, the same return visit and the same tier', () => {
  const store = memory();
  const route = playedRound();
  assert.equal(saveRound(route, store), true);
  const back = loadRound(store);
  assert.deepEqual(back, route);
  assert.ok(hasProgress(back));
  assert.equal(tierFor(back.rep).id, tierFor(route.rep).id);
  const n = route.visits[FARMS[0].id] + 1;
  assert.deepEqual(visitCases(FARMS[0], n, back.history).map(tag), visitCases(FARMS[0], n, route.history).map(tag));
});

test('a day in progress is saved after each cow and resumes at the next one, with the same herd', () => {
  const store = memory();
  const route = playedRound();
  const herd = startVisit(route, FARMS[0].id);
  saveRound(route, store);
  assert.deepEqual(loadRound(store).visit, route.visit);
  recordCow(route, herd[0], { failed: false, grade: 'Clean', gait: 'sound' });
  saveRound(route, store);
  const back = loadRound(store);
  assert.deepEqual(back, route);
  assert.equal(back.visit.k, 1);
  assert.deepEqual(visitHerd(back).map(tag), herd.map(tag));
  // Finishing the resumed day banks the same reputation as finishing it unbroken.
  for (const r of [route, back]) herd.slice(1).forEach((cd) => recordCow(r, cd, { failed: false, grade: 'Textbook', gait: 'sound' }));
  assert.deepEqual(endVisit(back), endVisit(route));
  assert.deepEqual(back, route);
});

test('a broken day in progress falls back to the last finished day, its cows dropped', () => {
  const route = playedRound();
  const finished = JSON.parse(JSON.stringify(route));
  const herd = startVisit(route, FARMS[0].id);
  recordCow(route, herd[0], { failed: false, grade: 'Clean', gait: 'sound' });
  const good = JSON.parse(JSON.stringify(route));
  const broken = [
    { ...good.visit, farm: 'nowhere' }, { ...good.visit, farm: FARMS[1].id }, { ...good.visit, n: 2 },
    { ...good.visit, k: 2 }, { ...good.visit, rows: [] }, { ...good.visit, rows: [{ tag: 'x' }] }, 'today',
  ];
  for (const visit of broken) {
    const back = parseRound(JSON.stringify({ v: 1, ...good, visit }));
    assert.deepEqual(back, finished, JSON.stringify(visit));
  }
  // Today's cows without the day itself (or a history that disagrees with it) are dropped too.
  assert.deepEqual(parseRound(JSON.stringify({ v: 1, ...good, visit: null })), finished);
  assert.deepEqual(parseRound(JSON.stringify({ v: 1, ...good, history: finished.history })), finished);
});

test('no save, a corrupted save, or blocked storage: a fresh round at farm 1, never a throw', () => {
  assert.deepEqual(loadRound(memory()), newRoute());
  assert.equal(hasProgress(newRoute()), false);
  const bad = ['{', 'null', '[]', '42', '{"v":2,"rep":5,"visits":{},"best":{},"history":[]}',
    '{"v":1,"rep":-3,"visits":{},"best":{},"history":[]}',
    '{"v":1,"rep":5,"visits":{"nowhere":1},"best":{},"history":[]}',
    '{"v":1,"rep":5,"visits":{},"best":{},"history":[{"farm":"willowbank"}]}',
    '{"v":1,"rep":"lots","visits":{},"best":{},"history":[]}'];
  for (const text of bad) {
    assert.equal(parseRound(text), null, text);
    const store = memory();
    store.setItem(SAVE_KEY, text);
    assert.deepEqual(loadRound(store), newRoute(), text);
  }
  // A past cow the return visit couldn't deal again (unknown condition, side, foot or visit).
  const cow = playedRound().history[0];
  for (const broken of [{ condition: 'scurvy' }, { side: 'LF' }, { foot: 'paw' }, { visit: 0 }]) {
    const text = JSON.stringify({ v: 1, rep: 5, visits: {}, best: {}, history: [{ ...cow, ...broken }] });
    assert.equal(parseRound(text), null, text);
  }
  assert.deepEqual(loadRound(blocked), newRoute());
  assert.equal(saveRound(playedRound(), blocked), false);
  assert.doesNotThrow(() => clearRound(blocked));
  assert.deepEqual(loadRound(undefined), newRoute());
});

test('starting the round over clears the save', () => {
  const store = memory();
  saveRound(playedRound(), store);
  clearRound(store);
  assert.equal(store.getItem(SAVE_KEY), null);
  assert.deepEqual(loadRound(store), newRoute());
});

test('a saved call survives the reload; rows from before calls load; an unknown call is refused', () => {
  const route = newRoute();
  const herd = startVisit(route, FARMS[0].id);
  recordCow(route, herd[0], { failed: false, grade: 'Sound', gait: 'to the pen', call: 'pen' });
  const store = memory();
  saveRound(route, store);
  assert.deepEqual(loadRound(store), route);
  const d = JSON.parse(store.getItem(SAVE_KEY));
  delete d.history[0].call; delete d.visit.rows[0].call;
  assert.ok(parseRound(JSON.stringify(d)).visit, 'old rows without a call still load');
  d.history[0].call = 'abattoir';
  assert.equal(parseRound(JSON.stringify(d)), null);
});

test('a cow back with her ulcer again survives the reload; an unknown outcome is refused (WP15.2)', () => {
  const route = newRoute();
  const herd = startVisit(route, FARMS[0].id);
  recordCow(route, { ...herd[0], back: { visit: 1, grade: 'Clean', was: 'ulcer', outcome: 'again' } }, { failed: false, grade: 'Clean', gait: 'sound' });
  const store = memory();
  saveRound(route, store);
  assert.deepEqual(loadRound(store), route);
  const d = JSON.parse(store.getItem(SAVE_KEY));
  assert.equal(d.visit.rows[0].back, 'again');
  d.visit.rows[0].back = 'cured';
  assert.equal(parseRound(JSON.stringify(d)).visit, null, 'the bad day is dropped');
});

test('the block a cow went off in survives the reload; a malformed one is refused (J2)', () => {
  const route = newRoute();
  const herd = startVisit(route, FARMS[0].id);
  recordCow(route, herd[0], { failed: false, grade: 'Clean', gait: 'sound', block: { claw: 2, kind: 'wood' } });
  const store = memory();
  saveRound(route, store);
  assert.deepEqual(loadRound(store), route);
  const d = JSON.parse(store.getItem(SAVE_KEY));
  d.history[0].blockClaw = 7;
  assert.equal(parseRound(JSON.stringify(d)), null);
  d.history[0].blockClaw = 2; d.history[0].blocked = 'concrete';
  assert.equal(parseRound(JSON.stringify(d)), null);
});
