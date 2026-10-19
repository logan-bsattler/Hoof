import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { CLAW } from '../src/hoof.js';
import { CASE_A } from '../src/case.js';
import { STEPS, levelRead } from '../src/steps.js';

const T = CFG.sole.target;
const step2 = STEPS.find((s) => s.id === 'step2');

// Metrics with the first claw already done (step 1 ticked), the second anywhere.
function metrics(second, dead = 0) {
  const claws = { [CLAW.INNER]: { wbMean: T, deadRemain: 0 }, [CLAW.OUTER]: { wbMean: second, deadRemain: dead } };
  return { claws, levelDiff: claws[CLAW.INNER].wbMean - claws[CLAW.OUTER].wbMean };
}

test('the gauge says LEVEL exactly when step 2 ticks', () => {
  const hoof = { caseDef: CASE_A };
  for (let mm = T - 1; mm <= T + 2.5; mm += 0.05) {
    for (const dead of [0, 0.5]) {
      const m = metrics(mm, dead);
      assert.equal(levelRead(m, CASE_A).level, !!step2.done(m, {}, hoof), `outer ${mm.toFixed(2)} mm, toe ${dead}`);
    }
  }
});

test('matched claws that are both still high say which is high, not LEVEL', () => {
  // Ben's phone: inner 8.2, outer 7.6 read LEVEL while step 2 wanted the claw at target.
  const m = { claws: { [CLAW.INNER]: { wbMean: 8.2, deadRemain: 0 }, [CLAW.OUTER]: { wbMean: 7.6, deadRemain: 0 } }, levelDiff: 0.6 };
  const r = levelRead(m, CASE_A);
  assert.equal(r.level, false);
  assert.match(r.text, /inner 1\.2 mm high/);
});
