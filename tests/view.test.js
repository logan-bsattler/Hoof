import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CFG } from '../src/config.js';
import { fitCamera, toScene, toScreen } from '../src/view.js';
import { CLAW, clawPolygon } from '../src/hoof.js';
import { CASE_B, makeCaseB } from '../src/case.js';
import { tutorialBeats } from '../src/tutorial.js';

const { w: W, h: H, phone } = CFG.view;
const CB = phone.content;
// Phone wraps (CSS px) measured in the preview: 375×667, 375×812, and a Pixel-sized 412×915.
const PHONES = [[375, 413], [375, 558], [412, 660], [360, 386]];

test('full view letterboxes the whole scene, as before the camera existed', () => {
  const cam = fitCamera(800, 760, 'full');
  const s = Math.min(800 / W, 760 / H);
  assert.equal(cam.scale, s);
  assert.deepEqual([cam.x, cam.y, cam.hudH], [0, 0, 0]);
  assert.deepEqual([cam.cssW, cam.cssH], [Math.floor(W * s), Math.floor(H * s)]);
});

test('phone view makes the hoof at least 25% bigger and keeps the content box under the HUD', () => {
  for (const [ww, wh] of PHONES) {
    const full = fitCamera(ww, wh, 'full');
    const cam = fitCamera(ww, wh, 'hoof');
    assert.ok(cam.scale >= full.scale * 1.25, `${ww}x${wh}: ${cam.scale} vs ${full.scale}`);
    assert.ok(cam.cssW <= ww && cam.cssH <= wh);
    const a = toScreen(cam, CB.x, CB.y), b = toScreen(cam, CB.x + CB.w, CB.y + CB.h);
    assert.ok(a.x >= -0.5 && b.x <= cam.cssW + 0.5, `${ww}x${wh}: content box fits across`);
    assert.ok(a.y >= cam.hudH - 0.5 && b.y <= cam.cssH + 0.5, `${ww}x${wh}: content box fits below the HUD`);
  }
});

test('phone view never shows past the painted scenery, even on a wide, short wrap', () => {
  for (const [ww, wh] of [...PHONES, [812, 200], [860, 300]]) {
    const cam = fitCamera(ww, wh, 'hoof');
    const tl = toScene(cam, 0, 0), br = toScene(cam, cam.cssW, cam.cssH);
    assert.ok(tl.x >= -phone.bleed - 0.5 && br.x <= W + phone.bleed + 0.5, `${ww}x${wh} x: ${tl.x}..${br.x}`);
    assert.ok(tl.y + phone.hudH / cam.scale >= -0.5 && br.y <= H + 0.5, `${ww}x${wh} y: ${tl.y}..${br.y}`);
  }
});

test('screen and scene coordinates round-trip in both views', () => {
  for (const mode of ['full', 'hoof']) {
    const cam = fitCamera(375, 558, mode);
    for (const [x, y] of [[200, 360], [48, 182], [352, 625]]) {
      const p = toScreen(cam, x, y), q = toScene(cam, p.x, p.y);
      assert.ok(Math.abs(q.x - x) < 1e-9 && Math.abs(q.y - y) < 1e-9);
    }
  }
});

test('the phone content box holds both claws, the labels and every tutorial target, on both feet', () => {
  const inBox = (x0, y0, x1, y1) => x0 >= CB.x && y0 >= CB.y && x1 <= CB.x + CB.w && y1 <= CB.y + CB.h;
  for (const side of ['LH', 'RH']) {
    for (const claw of [CLAW.OUTER, CLAW.INNER]) {
      for (const dead of [false, true]) {
        for (const [x, y] of clawPolygon(claw, dead, side)) assert.ok(inBox(x, y, x, y), `${side} claw ${claw} (${x}, ${y})`);
      }
    }
  }
  assert.ok(inBox(CB.x, 652 - 12, CB.x, 652 + 4), 'claw labels (y 652)');
  for (let seed = 0; seed < 40; seed++) {
    const cd = seed === 0 ? CASE_B : makeCaseB(seed);
    for (const b of tutorialBeats(cd)) {
      const t = b.target;
      if (!t) continue;
      const rects = t.kind === 'rects' ? t.list : t.kind === 'rect' ? [t] : [];
      for (const r of rects) assert.ok(inBox(r.x, r.y, r.x + r.w, r.y + r.h), `seed ${seed} ${b.id} rect`);
      if (t.kind === 'ring') assert.ok(inBox(t.x - t.r, t.y - t.r, t.x + t.r, t.y + t.r), `seed ${seed} ${b.id} ring`);
    }
  }
});
