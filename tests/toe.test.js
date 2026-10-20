// Toe length by the cow's size (D68–D74, D84): her foot drawn at her size, her line the seam on
// every frame, the nippers on living toe in her real mm, the score, breeds.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { Hoof, Z, CLAW, frameScale } from '../src/hoof.js';
import { labelY } from '../src/shape.js';
import { makeCase, BREEDS, tagAndLimb } from '../src/case.js';
import { applyBite } from '../src/tools.js';
import { newSession, scoreCase } from '../src/scoring.js';
import { FARMS, farmMods, returnCase } from '../src/route.js';
import { makePlayer } from './player.js';

const cow = (mods) => new Hoof(makeCase('routine', 214, mods));
// The tip column of claw c: where the living toe reaches furthest.
function tipOf(h, c) {
  let best = -1;
  for (let col = 0; col < h.g.cols; col++) {
    if (Number.isNaN(h.seamY[col])) continue;
    const i = h.cellAt(h.g.x0 + (col + 0.5) * h.g.cell, h.seamY[col]);
    if (i < 0 || h.claw[i] !== c) continue;
    if (best < 0 || h.seamY[col] > h.seamY[best]) best = col;
  }
  return { x: h.g.x0 + (best + 0.5) * h.g.cell, y: h.seamY[best] };
}

test('her frame sets her size: 70 / 75 / 80 mm toe, an average cow unchanged (D84)', () => {
  assert.equal(frameScale({ frame: 'small' }), 70 / 75);
  assert.equal(frameScale({ frame: 'average' }), 1);
  assert.equal(frameScale({ frame: 'large' }), 80 / 75);
  assert.equal(frameScale({}), 1);
  assert.equal(new Hoof(makeCase('routine', 214, { frame: 'large' })).mmScale, 80 / 75);
  // The claw labels move down under a big cow's toe, up under a small one's.
  const at = (frame) => labelY(makeCase('routine', 214, { frame }));
  assert.ok(at('small') < at('average') && at('average') < at('large'));
  const plain = makeCase('routine', 214);
  assert.equal(plain.breed, 'holstein');
  assert.equal(plain.frame, 'average');
  assert.match(plain.subtitle, /^Holstein #214/);
});

test('breeds bring their frame, a heifer is small, and the intro names a cow off the average', () => {
  assert.equal(makeCase('routine', 214, { breed: 'jerseyx' }).frame, 'small');
  assert.equal(makeCase('routine', 214, { breed: 'brownswiss' }).frame, 'large');
  assert.equal(makeCase('routine', 214, { frame: 'large' }).frame, 'large');
  const heifer = makeCase('routine', 214, { partial: 'heifer', breed: 'brownswiss' });
  assert.equal(heifer.frame, 'small');
  assert.match(heifer.intro, /7 cm/);
  assert.match(makeCase('routine', 214, { breed: 'jerseyx' }).traits, /Jersey cross.*7 cm/);
  assert.match(makeCase('routine', 214, { frame: 'large' }).traits, /big-framed Holstein.*8 cm/);
  assert.equal(makeCase('routine', 214).traits.includes('cm'), false);
  for (const id of Object.keys(BREEDS)) {
    const cd = makeCase('routine', 300, { breed: id });
    assert.deepEqual(tagAndLimb(cd.subtitle), ['#300', `${cd.side === 'RH' ? 'right' : 'left'} hind`]);
  }
});

test('a careful hand nips every frame to her length: no toe cut short, no living tip taken', () => {
  for (const breed of Object.keys(BREEDS)) {
    const h = cow({ breed });
    const evs = [];
    makePlayer(h, { onEvent: (e) => evs.push(e) }).nip();
    const m = h.metrics();
    for (const c of [CLAW.OUTER, CLAW.INNER]) {
      assert.ok(m.claws[c].deadRemain < 0.2, `${breed}: ${m.claws[c].deadRemain.toFixed(2)} of the toe left on`);
      assert.ok(m.claws[c].toeShort < CFG.toe.note, `${breed}: cut ${m.claws[c].toeShort.toFixed(1)} mm short`);
    }
    assert.equal(evs.some((e) => e.blood), false, breed);
    assert.equal(evs.some((e) => e.toeLive), false, breed);
  }
});

test('a bite well into her toe: short, then pink and bleeding, and scored down', () => {
  const h = cow({});
  makePlayer(h).nip();
  const { x, y } = tipOf(h, CLAW.OUTER);
  // A bite 6 mm back from her line, in two goes so the jaws can close on it.
  applyBite(h, x, y - 3 * CFG.toe.pxPerMm);
  const ev = applyBite(h, x, y - 6 * CFG.toe.pxPerMm);
  assert.ok(ev.toeLive);
  assert.ok(ev.toeShort > CFG.toe.blood, `only ${ev.toeShort} mm`);
  assert.ok(ev.blood, 'past 5 mm the cut face bleeds');
  const m = h.metrics();
  assert.ok(m.claws[CLAW.OUTER].toeShort > CFG.toe.hit);
  const r = scoreCase(m, newSession(), h, h.caseDef);
  assert.ok(r.notes.some((n) => /short of her length/.test(n)), r.notes.join(' | '));
  assert.ok(r.notes.some((n) => /into her living toe/.test(n)), r.notes.join(' | '));
  let off = 0;
  for (let i = 0; i < h.n; i++) if (h.zone[i] & Z.OFF) { off++; assert.equal(h.thick[i], 0); }
  assert.ok(off > 0);
});

test('the nippers reach as far into her toe on every frame: a small cow bleeds too', () => {
  for (const frame of ['small', 'average', 'large']) {
    const h = cow({ frame });
    makePlayer(h).nip();
    const { x, y } = tipOf(h, CLAW.OUTER);
    let ev;
    for (let d = 3; d <= 9; d += 3) ev = applyBite(h, x, y - d * CFG.toe.pxPerMm);
    assert.ok(h.metrics().claws[CLAW.OUTER].toeShort > CFG.toe.blood, `${frame}: only ${h.metrics().claws[CLAW.OUTER].toeShort} mm`);
    assert.ok(h.metrics().blood > 0 || ev.blood, `${frame}: no blood`);
  }
});

test('her own toe cut short is reported in her real mm: the same bite is more on a big cow', () => {
  const short = (frame) => {
    const h = cow({ frame });
    makePlayer(h).nip();
    const { x, y } = tipOf(h, CLAW.OUTER);
    applyBite(h, x, y - 2 * CFG.toe.pxPerMm);
    applyBite(h, x, y - 4 * CFG.toe.pxPerMm);
    return h.metrics().claws[CLAW.OUTER].toeShort;
  };
  const s = short('small'), a = short('average'), l = short('large');
  assert.ok(a > 0);
  assert.ok(Math.abs(s / a - 70 / 75) < 1e-6 && Math.abs(l / a - 80 / 75) < 1e-6, `${s} ${a} ${l}`);
});

test('every frame’s dead toe is overgrowth: none of it is hers to keep (D84)', () => {
  for (const breed of Object.keys(BREEDS)) {
    const h = cow({ breed });
    for (let i = 0; i < h.n; i++) {
      if (!h.claw[i] || Number.isNaN(h.toeD[i])) continue;
      assert.equal(h.over[i], h.zone[i] & Z.DEAD ? 1 : 0, breed);
    }
  }
});

test('a pre-trimmed claw on a small cow was trimmed to her line', () => {
  const h = new Hoof(makeCase('routine', 214, { breed: 'jerseyx', partial: 'lately' }));
  const c = h.caseDef.trimmed[0];
  assert.ok(h.metrics().claws[c].deadRemain < 0.05);
  assert.equal(h.metrics().claws[c].toeShort, 0);
});

test('farms bring their breeds, drawn last; a returning cow keeps hers', () => {
  const by = Object.fromEntries(FARMS.map((f) => [f.id, f]));
  const count = (f, pick) => {
    let n = 0;
    for (let s = 1; s <= 400; s++) if (pick(farmMods(f, s).mods)) n++;
    return n / 400;
  };
  assert.equal(count(by.willowbank, (m) => m.breed || m.frame), 0);
  assert.ok(Math.abs(count(by.hollins, (m) => m.breed === 'jerseyx') - 0.25) < 0.08);
  assert.ok(Math.abs(count(by.greystone, (m) => m.frame === 'large') - 0.5) < 0.08);
  assert.ok(Math.abs(count(by.ridgeway, (m) => m.breed === 'brownswiss') - 0.2) < 0.08);
  let seed = 1;
  while (farmMods(by.hollins, seed).mods.breed !== 'jerseyx') seed++;
  const cd = makeCase('routine', seed, farmMods(by.hollins, seed).mods);
  const h = { farm: 'hollins', visit: 1, seed, condition: 'routine', foot: cd.foot, side: cd.side, grade: 'Clean', lame: false, tag: tagAndLimb(cd.subtitle)[0] };
  const back = returnCase(by.hollins, h, 2, 0);
  assert.equal(back.breed, 'jerseyx');
  assert.equal(back.frame, 'small');
});
