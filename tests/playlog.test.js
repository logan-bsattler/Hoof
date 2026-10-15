import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCase } from '../src/case.js';
import { newSession } from '../src/scoring.js';
import { logEntry, readLog, appendLog, exportLog, clearLog, LOG_KEY, LOG_MAX, LOG_CHARS } from '../src/playlog.js';

// A localStorage stand-in.
function memStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

const graded = { grade: 'B', total: 78, gait: 'sound', call: null };

test('an entry carries the cow, her time per step, the tools and the read', () => {
  const cd = makeCase('ulcer', 11);
  const s = newSession();
  s.stepDoneAt = { clean: 4, step1: 20.04, step2: 31, step3: null };
  s.probes = [{}, {}];
  s.diagnosis = 'whiteline';
  s.diagnosisCorrect = false;
  const e = logEntry(cd, graded, s, {
    farm: 'Willow Bank', visit: 2, k: 0, tier: 'Apprentice', guided: true, time: 61.27,
    use: { knife: { n: 14, s: 9.04 }, testers: { n: 2, s: 0.4 } }, loadMs: 812.6,
  });
  assert.equal(e.farm, 'Willow Bank');
  assert.equal(e.cow, 1);
  assert.equal(e.condition, 'ulcer');
  assert.equal(e.guided, true);
  assert.equal(e.seconds, 61.3);
  assert.deepEqual(e.steps, { clean: 4, step1: 16, step2: 11 }, 'each step timed from the one before, unfinished ones left out');
  assert.deepEqual(e.tools.knife, { n: 14, s: 9 });
  assert.equal(e.probes, 2);
  assert.equal(e.misread, true);
  assert.equal(e.loadMs, 813);
  assert.equal(e.grade, 'B');
  assert.equal(e.failed, false);
});

test('time counts from lifting her foot; a step done before then is 0', () => {
  const s = newSession();
  s.stepDoneAt = { step1: 0, clean: 30, step2: 45 };
  const e = logEntry(makeCase('routine', 5), graded, s, { time: 70, start: 20 });
  assert.equal(e.seconds, 50);
  assert.deepEqual(e.steps, { step1: 0, clean: 10, step2: 15 });
});

test('a failed cow logs as failed, and free play has no farm', () => {
  const e = logEntry(makeCase('routine', 3), { failed: true, grade: 'Failed', total: 0, gait: 'lame' }, newSession(), {});
  assert.equal(e.failed, true);
  assert.equal(e.farm, 'free play');
  assert.equal(e.cow, null);
  assert.equal(e.guided, false);
  assert.ok(!('loadMs' in e));
});

test('the log keeps the latest cows within its caps', () => {
  const store = memStore();
  for (let i = 0; i < LOG_MAX + 25; i++) appendLog({ i }, store);
  const list = readLog(store);
  assert.equal(list.length, LOG_MAX);
  assert.equal(list.at(-1).i, LOG_MAX + 24, 'the newest stays');
  const big = memStore();
  for (let i = 0; i < 60; i++) appendLog({ i, pad: 'x'.repeat(8000) }, big);
  assert.ok(big.getItem(LOG_KEY).length <= LOG_CHARS);
  assert.equal(readLog(big).at(-1).i, 59);
});

test('an unreadable or blocked store is an empty log, never an error', () => {
  const store = memStore();
  store.setItem(LOG_KEY, '{not json');
  assert.deepEqual(readLog(store), []);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(readLog(blocked), []);
  assert.equal(appendLog({ i: 1 }, blocked), 1);
  clearLog(blocked);
});

test('the export wraps the cows with what it was played on, and clear empties it', () => {
  const store = memStore();
  appendLog({ i: 1 }, store);
  const out = JSON.parse(exportLog(store, { screen: '390x844' }));
  assert.equal(out.app, 'True Hoof');
  assert.equal(out.screen, '390x844');
  assert.deepEqual(out.cows, [{ i: 1 }]);
  clearLog(store);
  assert.deepEqual(readLog(store), []);
});
