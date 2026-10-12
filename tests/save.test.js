// WP7.7: saving the round. Save, reload, same state; anything broken falls back to a fresh round.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { FARMS, newRoute, startVisit, recordCow, endVisit, visitCases, tierFor } from '../src/route.js';
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

test('the day in progress is not saved: a reload goes back to the last finished day', () => {
  const store = memory();
  const route = playedRound();
  saveRound(route, store);
  const herd = startVisit(route, FARMS[0].id);
  recordCow(route, herd[0], { failed: false, grade: 'Clean', gait: 'sound' });
  saveRound(route, store);
  const back = loadRound(store);
  assert.equal(back.visit, null);
  assert.equal(back.history.length, route.history.length - 1);
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
  for (const broken of [{ condition: 'footrot' }, { side: 'LF' }, { foot: 'paw' }, { visit: 0 }]) {
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
