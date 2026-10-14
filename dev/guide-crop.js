// Dev only: draws one field-guide crop (WP11.2), the brushed-clean foot as the player sees it at
// the read, cropped round the lesion (or the whole foot where there's nothing to point at).
// ?cond=<condition id>. Sets document.title to 'done' when drawn.

import { Hoof } from '../src/hoof.js';
import { makeCase } from '../src/case.js';
import { HoofArt } from '../src/hoofart.js';
import { makePlayer } from '../tests/player.js';

// condition → seed, mods, and the crop box (logical px: centre and size).
const lesionBox = (size, dy = 0) => (cd) => ({ x: cd.lesion.x, y: cd.lesion.y + dy, size });
export const SHOTS = {
  routine: { seed: 3, box: () => ({ x: 200, y: 410, size: 440 }) },
  ulcer: { seed: 214, mods: { lesionSize: 0.6 }, box: lesionBox(110) },
  whiteline: { seed: 5, box: (cd) => { const p = cd.lesion.path, a = p[0], b = p[p.length - 1]; return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, size: 160 }; } },
  puncture: { seed: 7, box: lesionBox(90) },
  toenecrosis: { seed: 4, box: lesionBox(110, -10) },
  doublesole: { seed: 6, box: lesionBox(130) },
  twoclaw: { seed: 8, box: (cd) => { const [a, b] = cd.lesions; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, size: Math.max(170, Math.abs(a.x - b.x) + 80, Math.abs(a.y - b.y) + 80) }; } },
  dd: { seed: 9, box: lesionBox(100) },
  footrot: { seed: 10, box: (cd) => ({ x: 200, y: cd.lesion.y + 12, size: 120 }) },
  nonfoot: { seed: 11, box: () => ({ x: 200, y: 410, size: 440 }) },
  thinsole: { seed: 12, box: () => ({ x: 200, y: 430, size: 420 }) },
  dds: { seed: 13, box: (cd) => ({ x: (cd.lesion.x + 200) / 2, y: cd.lesion.y - 35, size: 170 }) },
};

const id = new URLSearchParams(location.search).get('cond');
const shot = SHOTS[id];
const cd = makeCase(id, shot.seed, shot.mods ?? {});
const hoof = new Hoof(cd), art = new HoofArt(3);
art.sync(hoof);
makePlayer(hoof, {
  onStamp(tool, x, y, dx, dy) { art.mark(tool, x, y, dx, dy, 26); },
  onAction: () => art.sync(hoof),
}).brushAll();
art.sync(hoof);
art.compose(0, 0, art.w, art.h);

const c = document.getElementById('c').getContext('2d');
const b = shot.box(cd), k = 240 / b.size;
c.fillStyle = '#4a3d2c';
c.fillRect(0, 0, 240, 240);
c.setTransform(k, 0, 0, k, -(b.x - b.size / 2) * k, -(b.y - b.size / 2) * k);
art.draw(c);
document.title = 'done';
