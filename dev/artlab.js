// Dev-only art lab: replays scripted tool work on fresh hoofs and draws each stage large,
// so texture and cut edges can be judged side by side. Not loaded by the game.

import { Hoof, CLAW } from '../src/hoof.js';
import { CASE_B } from '../src/case.js';
import { HoofArt } from '../src/hoofart.js';
import { applyStroke, applyGrind, applyBite, applySpray } from '../src/tools.js';

const CROP = { x: 24, y: 165, w: 352, h: 480 };
// ?stage=2 renders one stage; ?zoom=2 draws larger.
const Q = new URLSearchParams(location.search);
const ZOOM = Number(Q.get('zoom')) || 1.225;
const ONLY = Q.has('stage') ? Number(Q.get('stage')) : -1;
const DT = 1 / 60;

function session() {
  const hoof = new Hoof(CASE_B);
  const art = new HoofArt(3);
  art.sync(hoof);
  const s = {
    hoof, art,
    // Drag a tool along a polyline at a steady speed (px/s), like a player would.
    drag(tool, pts, speed = 160) {
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(len / (speed * DT)));
        let px = ax, py = ay;
        for (let j = 1; j <= steps; j++) {
          const x = ax + ((bx - ax) * j) / steps, y = ay + ((by - ay) * j) / steps;
          const dx = x - px, dy = y - py;
          // A careful hand: the grinder and knife lift off once the horn under them is at target.
          const i = hoof.cellAt(x, y);
          const done = i >= 0 && (tool === 'grinder' || tool === 'knife') && !hoof.loose[i] &&
            hoof.thick[i] <= hoof.zoneTarget(i) + 0.4;
          if (done) { px = x; py = y; continue; }
          if (tool === 'grinder') applyGrind(hoof, x, y, DT);
          else if (tool === 'spray') applySpray(hoof, x, y, DT);
          else applyStroke(hoof, tool, x, y, Math.hypot(dx, dy));
          art.mark(tool, x, y, dx, dy, tool === 'grinder' ? 20 : tool === 'knife' ? 14 : 26);
          px = x; py = y;
        }
      }
      art.sync(hoof);
      return s;
    },
    brushAll() {
      for (let y = 180; y < 640; y += 14) s.drag('brush', [[30, y], [370, y + 6], [30, y + 12]], 900);
      return s;
    },
    nip() {
      for (const x of [158, 242, 128, 272, 100, 300, 190, 210]) {
        for (let y = 640; y >= 560; y -= 10) applyBite(hoof, x, y);
      }
      art.sync(hoof);
      return s;
    },
    // Sweeping grinder passes over one claw, rows top to bottom, like 0:35-1:15.
    grind(claw, y0 = 270, y1 = 580, passes = 3) {
      const [xa, xb] = claw === CLAW.INNER ? [222, 340] : [60, 178];
      for (let p = 0; p < passes; p++) {
        const off = p * 5;
        for (let y = y0 + off; y < y1; y += 14) {
          s.drag('grinder', [[xa, y], [xb, y - 10], [xa, y + 7]], 190);
        }
      }
      return s;
    },
  };
  return s;
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
