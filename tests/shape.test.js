// WP18: claws that aren't the same shape. The sim keeps one template foot; each claw is drawn
// through its own warp, and the pointer comes back through the inverse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CFG } from '../src/config.js';
import { CLAW, clawPolygon, clawBox } from '../src/hoof.js';
import { makeCase, dealCase } from '../src/case.js';
import { clawShapes, toView, toTemplate, LIMIT, labelY } from '../src/shape.js';
import { tutorialBeats } from '../src/tutorial.js';

const CB = CFG.view.phone.content;
const inBox = ({ x, y }) => x >= CB.x && y >= CB.y && x <= CB.x + CB.w && y <= CB.y + CB.h;

test('a flat cow is the template foot, drawn as it is', () => {
  const cd = { ...makeCase('routine', 7), shape: 'flat' };
  assert.equal(clawShapes(cd), null);
  assert.deepEqual(toView(cd, 250, 400), { x: 250, y: 400 });
  assert.deepEqual(toTemplate(cd, 250, 400), { x: 250, y: 400 });
});

test('the pointer lands on the template point that is drawn under it', () => {
  for (let seed = 1; seed < 60; seed++) {
    const cd = dealCase(seed);
    for (const claw of [CLAW.OUTER, CLAW.INNER]) {
      for (const [x, y] of clawPolygon(claw, true, cd.side)) {
        const v = toView(cd, x, y), t = toTemplate(cd, v.x, v.y);
        assert.ok(Math.hypot(t.x - x, t.y - y) < 1e-6, `seed ${seed} (${x}, ${y})`);
      }
    }
  }
});

test('the claw that overgrows is drawn wider and longer than its partner, within the limits', () => {
  let wider = 0, longer = 0;
  const N = 300;
  for (let seed = 1; seed <= N; seed++) {
    for (const foot of ['hind', 'front']) {
      const cd = makeCase('routine', seed, { foot });
      const sh = clawShapes(cd);
      const big = foot === 'front' ? CLAW.INNER : CLAW.OUTER, small = big === CLAW.OUTER ? CLAW.INNER : CLAW.OUTER;
      for (const c of [big, small]) {
        assert.ok(sh[c].w >= LIMIT.w[0] && sh[c].w <= LIMIT.w[1]);
        assert.ok(sh[c].lean >= 0 && sh[c].lean <= LIMIT.lean[1]);
      }
      if (sh[big].w > sh[small].w) wider++;
      if (sh[big].sy > sh[small].sy) longer++;
    }
  }
  assert.ok(wider / (2 * N) > 0.9, `wider ${wider}`);
  assert.ok(longer / (2 * N) > 0.95, `longer ${longer}`);
});

test('the phone content box holds every shaped claw and tutorial target, on both feet (D79)', () => {
  for (let seed = 1; seed < 200; seed++) {
    const cd = dealCase(seed);
    for (const claw of [CLAW.OUTER, CLAW.INNER]) {
      for (const dead of [false, true]) {
        for (const [x, y] of clawPolygon(claw, dead, cd.side)) assert.ok(inBox(toView(cd, x, y)), `seed ${seed} claw ${claw} (${x}, ${y})`);
      }
    }
  }
  for (let seed = 1; seed < 40; seed++) {
    const cd = makeCase('ulcer', seed);
    for (const b of tutorialBeats(cd)) {
      const t = b.target;
      if (!t) continue;
      const rects = t.kind === 'rects' ? t.list : t.kind === 'rect' ? [t] : [];
      for (const r of rects) for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y + r.h]]) assert.ok(inBox(toView(cd, x, y)), `seed ${seed} ${b.id} rect`);
      if (t.kind === 'ring') assert.ok(inBox(toView(cd, t.x, t.y + t.r)), `seed ${seed} ${b.id} ring`);
    }
  }
});

test('the biggest foot fits the phone box on every frame, labels under it (D84/D85)', () => {
  for (const frame of ['small', 'average', 'large']) {
    for (const foot of ['hind', 'front']) {
      for (const side of ['LH', 'RH']) {
        const base = makeCase('routine', 5, { frame, foot });
        // The widest, longest, most curled pair D78 allows.
        const cd = { ...base, side, shape: { 1: { w: LIMIT.w[1], toeMm: LIMIT.toeMm[1], lean: LIMIT.lean[1] }, 2: { w: LIMIT.w[1], toeMm: LIMIT.toeMm[1], lean: LIMIT.lean[1] } } };
        let low = 0;
        for (const claw of [CLAW.OUTER, CLAW.INNER]) {
          for (const [x, y] of clawPolygon(claw, true, side)) {
            const v = toView(cd, x, y);
            assert.ok(inBox(v), `${frame} ${foot} ${side} claw ${claw} (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
            low = Math.max(low, v.y);
          }
        }
        const ly = labelY(cd);
        assert.ok(ly - 12 > low, `${frame}: labels at ${ly} under the toe at ${low.toFixed(1)}`);
        assert.ok(inBox({ x: CB.x, y: ly + 5 }), `${frame}: labels in the box`);
      }
    }
  }
});

test('a claw box is still the template box: the sim and the bot never see the shape', () => {
  const a = makeCase('routine', 11), b = { ...a, shape: 'flat' };
  assert.deepEqual(clawBox(CLAW.OUTER, a.side), clawBox(CLAW.OUTER, b.side));
});

test('a bunk-fed front foot curls its inner toe in harder, and never past the centre line (D82)', async () => {
  const { FARMS, farmMods } = await import('../src/route.js');
  for (let seed = 1; seed < 200; seed++) {
    const plain = makeCase('routine', seed, { foot: 'front' }), bunk = makeCase('routine', seed, { foot: 'front', bunkCurl: true });
    const a = clawShapes(plain), b = clawShapes(bunk);
    assert.ok(b[CLAW.INNER].lean >= 5.5 && b[CLAW.INNER].lean <= LIMIT.lean[1], `seed ${seed}`);
    assert.ok(b[CLAW.INNER].lean > a[CLAW.INNER].lean);
    // Only the curl changes: width, toe and the outer claw are as they were.
    assert.equal(b[CLAW.INNER].w, a[CLAW.INNER].w);
    assert.deepEqual(b[CLAW.OUTER], a[CLAW.OUTER]);
    for (const dead of [false, true]) {
      for (const [x, y] of clawPolygon(CLAW.INNER, dead, bunk.side)) {
        const v = toView(bunk, x, y);
        assert.ok(inBox(v), `seed ${seed} in box`);
        assert.ok((v.x - 200) * (x - 200) > 0, `seed ${seed} stays on its side of the centre line`);
      }
    }
    // A hind foot ignores it.
    assert.equal(makeCase('routine', seed, { bunkCurl: true }).bunkCurl, undefined);
  }
  // Every front foot on the road is bunk-fed except on pasture (Hollins), and the deal is unchanged.
  for (const farm of FARMS) {
    for (let seed = 1; seed < 60; seed++) {
      const { mods } = farmMods(farm, seed);
      assert.equal(!!mods.bunkCurl, mods.foot === 'front' && farm.housing !== 'pasture', `${farm.id} ${seed}`);
    }
  }
});
