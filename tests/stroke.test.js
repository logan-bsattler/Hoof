// WP16: knife stroke modes. The recogniser that tells a flick from a carve, and what a flick does.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, LOOSE } from '../src/hoof.js';
import { CASE_B } from '../src/case.js';
import { applyFlick, applyStroke } from '../src/tools.js';
import { startStroke, strokeMove, strokeTick, strokeEnd } from '../src/stroke.js';

const K = CFG.tools.knife;

// Play a stroke of `n` moves of `step` px each (CSS and logical alike), `ms` apart; then lift.
function play(n, step, ms, liftAfter = 0) {
  const s = startStroke(0, 0);
  let moved = 0, t = 0, carvedAt = null;
  for (let k = 1; k <= n; k++) {
    t += ms;
    moved += step;
    if (strokeMove(s, k * step, 0, step, moved, t) && carvedAt == null) carvedAt = k;
  }
  t += liftAfter;
  return { kind: strokeEnd(s, moved, t), carvedAt, s };
}

test('a stroke under the tap line is a tap: the pry still works', () => {
  assert.equal(play(2, 4, 30).kind, 'tap');
});

test('a short, quick stroke is a flick', () => {
  const r = play(5, 5, 16); // 25 px in 80 ms
  assert.equal(r.kind, 'flick');
  assert.equal(r.carvedAt, null, 'nothing cut while it was undecided');
  assert.equal(r.s.path.length, 6);
});

test('a slow short pull is a carve, decided as soon as it takes too long', () => {
  const r = play(6, 5, 60); // 30 px over 360 ms
  assert.equal(r.kind, 'carve');
  assert.ok(r.carvedAt != null && r.carvedAt < 6);
});

test('a fast long pull is a carve once it passes the flick length', () => {
  const r = play(10, 8, 8); // 80 px in 80 ms
  assert.equal(r.kind, 'carve');
  assert.equal(r.carvedAt, Math.floor(K.flickMax / 8) + 1);
});

test('a quick stroke lifted after a pause is still a carve', () => {
  assert.equal(play(4, 5, 16, K.flickTime).kind, 'carve');
});

test('a finger resting before the flick is not counted against it', () => {
  const s = startStroke(0, 0);
  // Pressed and held still for half a second: the clock hasn't started.
  assert.equal(strokeTick(s, 500), false);
  let moved = 0;
  for (let k = 1; k <= 5; k++) { moved += 5; strokeMove(s, k * 5, 0, 5, moved, 500 + k * 16); }
  assert.equal(strokeEnd(s, moved, 600), 'flick');
});

test('held still past the flick time mid-stroke, it turns to a carve on the frame tick', () => {
  const s = startStroke(0, 0);
  strokeMove(s, 10, 0, 10, 10, 0);
  assert.equal(strokeTick(s, K.flickTime / 2), false);
  assert.equal(strokeTick(s, K.flickTime + 1), true);
  assert.equal(s.kind, 'carve');
});

// A flat run of sound sole on CASE_B, well away from the ulcer and its loose horn.
function soundSole(h) {
  const L = CASE_B.lesion;
  for (let i = 0; i < h.n; i++) {
    const x = h.cellX(i), y = h.cellY(i);
    if (!h.claw[i] || Math.hypot(x - L.x, y - L.y) < 80) continue;
    let ok = true, n = 0;
    h.stamp(x, y, K.radius + 12, (j) => {
      n++;
      if (!(h.zone[j] & Z.LIVE) || (h.zone[j] & (Z.CLEFT | Z.WALL | Z.HEEL)) || h.loose[j] || h.thick[j] < h.zoneTarget(j) + 2) ok = false;
    });
    if (ok && n > 20) return { x, y };
  }
  throw new Error('no sound sole');
}

test('a flick takes at most a shaving of live sole, however it is drawn', () => {
  const h = new Hoof(CASE_B);
  const p = soundSole(h);
  const before = Float32Array.from(h.thick);
  const path = [];
  for (let k = 0; k <= 6; k++) path.push({ x: p.x + k * 4, y: p.y });
  path.push(...path.slice().reverse()); // back over itself: still one flick
  const ev = applyFlick(h, path);
  let most = 0;
  for (let i = 0; i < h.n; i++) most = Math.max(most, before[i] - h.thick[i]);
  assert.ok(most > 0.05, `it took something: ${most}`);
  assert.ok(most <= K.flickCut + 1e-6, `at most a shaving: ${most}`);
  assert.equal(ev.blood, false);
});

test('a flick takes far less sole than a carve over the same ground', () => {
  const a = new Hoof(CASE_B), b = new Hoof(CASE_B);
  const p = soundSole(a);
  const path = [];
  for (let k = 0; k <= 6; k++) path.push({ x: p.x + k * 4, y: p.y });
  const flicked = applyFlick(a, path).removed;
  let carved = 0;
  for (let k = 1; k < path.length; k++) carved += applyStroke(b, 'knife', path[k].x, path[k].y, 4).removed;
  assert.ok(flicked < carved * 0.5, `flick ${flicked} vs carve ${carved}`);
});

test('a flick lifts loose horn under the hook', () => {
  const h = new Hoof(CASE_B);
  // The undermined ulcer rim, once the cap is open: free it with flicks.
  const L = CASE_B.lesion;
  let ev, k = 0;
  do ev = applyStroke(h, 'knife', L.x + (k++ % 2 ? 6 : -6), L.y, 3); while (!ev.capPop && k < 400);
  assert.ok(h.capOpen);
  const i = [...Array(h.n).keys()].find((j) => h.loose[j] && h.looseInit[j] === LOOSE.ULCER);
  assert.ok(i != null, 'some rim left');
  const x = h.cellX(i), y = h.cellY(i);
  const out = applyFlick(h, [{ x: x - 3, y }, { x, y }, { x: x + 3, y }]);
  assert.ok(out.loose[LOOSE.ULCER] > 0);
  assert.equal(h.loose[i], 0);
});

test('a flick into the opened core is still a cut into raw tissue', () => {
  const h = new Hoof(CASE_B);
  const L = CASE_B.lesion;
  let ev, k = 0;
  do ev = applyStroke(h, 'knife', L.x + (k++ % 2 ? 6 : -6), L.y, 3); while (!ev.capPop && k < 400);
  assert.equal(applyFlick(h, [{ x: L.x - 3, y: L.y }, { x: L.x + 3, y: L.y }]).lesionCut, true);
});
