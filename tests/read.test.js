import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCase, readOptions, cowName } from '../src/case.js';
import { CONDITIONS } from '../src/conditions.js';

test('the right read is not always the top button, and each cow keeps her own order', () => {
  for (const id of Object.keys(CONDITIONS)) {
    const firsts = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const cd = makeCase(id, seed);
      const opts = readOptions(cd);
      assert.equal(opts.length, cd.diagnosisOptions.length);
      assert.deepEqual(readOptions(cd).map((o) => o.id), opts.map((o) => o.id), 'same cow, same order');
      assert.ok(opts.some((o) => o.id === cd.diagnosis));
      firsts.add(opts[0].id === cd.diagnosis);
    }
    assert.ok(firsts.has(false), `${id}: the answer moves off the top`);
  }
});

test('before the read she is named by tag, not by her condition', () => {
  const cd = makeCase('whiteline', 7);
  assert.match(cowName(cd), /^Holstein #\d+$/);
  assert.ok(!cowName(cd).includes(cd.title));
});
