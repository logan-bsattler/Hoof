import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { guideBook, roundDone, GUIDE_CONDITIONS } from '../src/guide.js';
import { TOOL_ORDER } from '../src/tools.js';
import { CONDITIONS, FINDING } from '../src/conditions.js';
import { FARMS, newRoute } from '../src/route.js';

const root = new URL('../', import.meta.url);

test('the guide has a page for every tool and every condition', () => {
  const book = guideBook({ all: true });
  assert.deepEqual(book.tools.map((t) => t.id), TOOL_ORDER);
  for (const t of book.tools) assert.ok(t.name && t.hint && t.notes?.length === 2, `tool page ${t.id}`);
  assert.deepEqual(book.conditions.map((c) => c.id).sort(), Object.keys(CONDITIONS).sort());
  for (const c of book.conditions) {
    assert.ok(c.title && c.plain && c.look && c.feel && c.todo && c.call, `condition page ${c.id}`);
    assert.ok(existsSync(new URL(c.img, root)), `missing crop ${c.img}`);
  }
  assert.ok(book.trim.length >= 5);
});

test('a condition unlocks once a cow with it is in the round history', () => {
  const locked = guideBook({ history: [] }).conditions;
  assert.ok(locked.every((c) => c.locked));
  const book = guideBook({ history: [{ condition: 'ulcer' }, { condition: 'dd' }] });
  const open = book.conditions.filter((c) => !c.locked).map((c) => c.id);
  assert.deepEqual(open.sort(), ['dd', 'ulcer']);
  // Tools are always open.
  assert.equal(book.tools.length, TOOL_ORDER.length);
});

test('a locked page leaks nothing the game says about the condition', () => {
  const strings = [
    ...Object.values(FINDING).flatMap((f) => [f.look, f.feel, f.probeText, f.diagnosedText]),
    ...Object.values(CONDITIONS).map((c) => c.title),
    ...Object.values(GUIDE_CONDITIONS).flatMap((g) => [g.plain, g.look, g.todo]),
  ].filter(Boolean);
  for (const page of guideBook({ history: [] }).conditions) {
    const text = JSON.stringify(page);
    assert.deepEqual(Object.keys(page).sort(), ['id', 'locked']);
    for (const s of strings) assert.ok(!text.includes(s), `locked ${page.id} leaks "${s}"`);
  }
});

test('no condition page names the decoys', () => {
  for (const c of guideBook({ all: true }).conditions) {
    const text = JSON.stringify(c).toLowerCase();
    for (const s of [FINDING.stain.probeText, FINDING.bruise.probeText]) assert.ok(!text.includes(s.toLowerCase()), c.id);
    assert.ok(!/\b(stain|bruise)/.test(text), `${c.id} names a decoy kind`);
  }
});

test('the show-all switch waits for every farm on the road to be worked once', () => {
  const r = newRoute();
  assert.equal(roundDone(r), false);
  for (const f of FARMS.slice(0, -1)) r.visits[f.id] = 1;
  assert.equal(roundDone(r), false);
  r.visits[FARMS.at(-1).id] = 1;
  assert.equal(roundDone(r), true);
});
