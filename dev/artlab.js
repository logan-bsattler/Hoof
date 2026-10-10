// Dev-only art lab: replays scripted tool work on fresh hoofs and draws each stage large,
// so texture and cut edges can be judged side by side. Not loaded by the game.

import { Hoof, CLAW } from '../src/hoof.js';
import { CASE_B } from '../src/case.js';
import { HoofArt } from '../src/hoofart.js';
import { makePlayer } from '../tests/player.js';

const CROP = { x: 24, y: 165, w: 352, h: 480 };
// ?focus=lesion crops a close-up around the ulcer; ?focus=toe the nipped toe tips.
const FOCUS = { lesion: { x: 132, y: 248, w: 80, h: 80 }, toe: { x: 70, y: 500, w: 260, h: 130 } };
Object.assign(CROP, FOCUS[new URLSearchParams(location.search).get('focus')] || {});
// ?crop=x,y,w,h crops any logical rectangle.
const CROPQ = new URLSearchParams(location.search).get('crop');
if (CROPQ) { const [x, y, w, h] = CROPQ.split(',').map(Number); Object.assign(CROP, { x, y, w, h }); }
// ?stage=2 renders one stage; ?zoom=2 draws larger.
const Q = new URLSearchParams(location.search);
const ZOOM = Number(Q.get('zoom')) || 1.225;
const ONLY = Q.has('stage') ? Number(Q.get('stage')) : -1;

function session() {
  const hoof = new Hoof(CASE_B);
  const art = new HoofArt(3);
  art.sync(hoof);
  const p = makePlayer(hoof, {
    onStamp(tool, x, y, dx, dy) {
      if (tool !== 'nippers') art.mark(tool, x, y, dx, dy, tool === 'grinder' ? 20 : tool === 'knife' ? 14 : 26);
    },
    onAction: () => art.sync(hoof),
  });
  return Object.assign(p, { art });
}

const L = CASE_B.lesion;
const STAGES = [
  ['Dirty (0:15)', () => session()],
  ['Brushed, first grinder passes (0:35)', () => session().brushAll().nip().grind(CLAW.OUTER, 330, 470, 1)],
  ['Ground to white (1:25)', () => session().brushAll().nip().grind(CLAW.OUTER).grind(CLAW.INNER)],
  ['Knife dish + opened ulcer, flushed (2:35)', () => {
    const s = session().brushAll().nip().grind(CLAW.OUTER).grind(CLAW.INNER);
    for (let x = 212; x < 246; x += 9) s.drag('knife', [[x, 290], [x + 2, 450]], 120);
    for (let a = 0; a < 6; a++) {
      const r = 6 + a * 3;
      s.drag('knife', [[L.x - r, L.y - r], [L.x + r * 0.5, L.y + r]], 90);
      s.drag('knife', [[L.x + r, L.y - r], [L.x - r * 0.5, L.y + r]], 90);
    }
    s.drag('spray', [[L.x - 10, L.y], [L.x + 10, L.y], [L.x - 10, L.y]], 20);
    return s;
  }],
];

const REFS = ['frame_00m15s', 'frame_00m35s', 'frame_01m25s', 'frame_02m35s'];

const grid = document.getElementById('grid');
const t0 = performance.now();
STAGES.forEach(([name, make], k) => {
  if (ONLY >= 0 && k !== ONLY) return;
  const s = make();
  (window.lab ||= [])[k] = s;
  const cv = document.createElement('canvas');
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(CROP.w * ZOOM * dpr);
  cv.height = Math.round(CROP.h * ZOOM * dpr);
  cv.style.width = `${CROP.w * ZOOM}px`;
  cv.style.height = `${CROP.h * ZOOM}px`;
  const c = cv.getContext('2d');
  c.setTransform(ZOOM * dpr, 0, 0, ZOOM * dpr, -CROP.x * ZOOM * dpr, -CROP.y * ZOOM * dpr);
  c.fillStyle = '#4a3d2c';
  c.fillRect(CROP.x, CROP.y, CROP.w, CROP.h);
  s.art.draw(c);
  const fig = document.createElement('figure');
  const m = s.hoof.metrics();
  const mm = (c) => `${m.claws[c].wbMean.toFixed(1)}/${m.claws[c].dishMean.toFixed(1)}`;
  fig.innerHTML = `<figcaption>${name} · outer ${mm(CLAW.OUTER)} · inner ${mm(CLAW.INNER)} mm (sole/dish) · blood ${m.blood}</figcaption>`;
  fig.appendChild(cv);
  const img = document.createElement('img');
  img.src = `../reference/hoof-video-capture/frames/${REFS[k]}.jpg`;
  img.hidden = true;
  img.className = 'ref';
  fig.appendChild(img);
  grid.appendChild(fig);
});
document.getElementById('timing').textContent = `built in ${Math.round(performance.now() - t0)} ms`;
document.getElementById('showRef').addEventListener('change', (e) => {
  for (const img of document.querySelectorAll('img.ref')) img.hidden = !e.target.checked;
});
window.labReady = true;
