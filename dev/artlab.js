// Dev-only art lab: replays scripted tool work on fresh hoofs and draws each stage large,
// so texture and cut edges can be judged side by side. Not loaded by the game.

import { Hoof, CLAW, Z, clawPolygon } from '../src/hoof.js';
import { CASE_B, makeCase } from '../src/case.js';
import { HoofArt } from '../src/hoofart.js';
import { makePlayer } from '../tests/player.js';
import { drawBlock, drawPad, drawWrap } from '../src/toolart.js';
import { applyStroke } from '../src/tools.js';

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

// ?cond=<condition id>[&seed=n] stages a dealt cow of that condition instead of Case B.
// &oldblock=1 (or =wood) glues last visit's block on the big claw (J2) and stages the pry.
// &kinds=fade,pigment,haem deals those decoys, one each (WP14.2); &pits=1 turns them into old pits.
const OLD = Q.get('oldblock');
const MODS = OLD ? { oldBlock: { claw: CLAW.OUTER, kind: OLD === 'wood' ? 'wood' : 'rubber' } } : {};
if (Q.has('kinds')) { MODS.decoyKinds = Q.get('kinds').split(','); MODS.decoyCount = MODS.decoyKinds.length; }
const dealt = (mods) => makeCase(Q.get('cond'), Number(Q.get('seed')) || 1, mods);
const pitsOf = (cd) => cd.findings.filter((f) => f.kind !== cd.lesion?.type).slice(0, 2).map(({ claw, x, y }) => ({ claw, x, y }));
const CD = !Q.has('cond') ? CASE_B : Q.has('pits') ? dealt({ ...MODS, pits: pitsOf(dealt(MODS)) }) : dealt(MODS);

function session() {
  const hoof = new Hoof(CD);
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

// Spray along every cell of the lesion's skin (DD patch or foot-rot split).
const sprayLesion = (s) => {
  const pts = [];
  for (let i = 0; i < s.hoof.n; i++) if (s.hoof.zone[i] & (Z.DD | Z.ROT)) pts.push([s.hoof.cellX(i), s.hoof.cellY(i)]);
  pts.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (let k = 0; k < 3; k++) s.drag('spray', pts, 40);
  return s;
};

// Open a lesion the way the bot does: saw the ulcer's cap, then orbit; or follow the track.
const open = (s, U) => {
  if (U.type === 'whiteline') { for (let k = 0; k < 6 && !s.hoof.drained; k++) s.followTrack(U); return s; }
  for (let k = 0; k < 40 && !s.hoof.capOpenAt[U.claw]; k++) s.drag('knife', [[U.x - U.r, U.y], [U.x + U.r, U.y], [U.x - U.r, U.y]], 160);
  const ring = U.r + 6, orbit = [];
  for (let a = 0; a <= 48; a++) orbit.push([U.x + ring * Math.cos((a / 48) * 2 * Math.PI), U.y + ring * Math.sin((a / 48) * 2 * Math.PI)]);
  for (let k = 0; k < 6 && s.hoof.metrics().looseRemainAt[U.claw] >= 0.1; k++) s.drag('knife', orbit, 90);
  return s;
};
const openAll = (s) => {
  s.brushAll().nip().grind(CLAW.OUTER).grind(CLAW.INNER);
  for (const U of s.hoof.lesions()) open(s, U);
  for (const U of s.hoof.lesions()) { const W = U.pocket ?? U; s.drag('spray', [[W.x - 10, W.y], [W.x + 10, W.y], [W.x - 10, W.y]], 20); }
  return s;
};
// Pad/wrap stage per claw, drawn over the art as the game's render.dressing does.
const dress = (s, stages) => Object.assign(s, { dressing: stages });

const L = CD.lesion;
const STAGES = OLD ? [
  ['Old block on', () => session()],
  ['One tap', () => { const s = session(); s.hoof.oldBlock.taps = 1; return s; }],
  ['Two taps', () => { const s = session(); s.hoof.oldBlock.taps = 2; return s; }],
  ['Pried off, brushed', () => { const s = session(); s.hoof.oldBlock.on = false; s.hoof.block = CLAW.NONE; return s.brushAll(); }],
] : Q.has('cond') ? [
  ['Dirty', () => session()],
  ['Brushed', () => session().brushAll()],
  ['Brushed, lesion sprayed', () => sprayLesion(session().brushAll())],
  // WP14.2: the decoys after the grinder, then pared into by hand (1, then 3 knife pulls on each).
  ...(Q.has('kinds') || Q.has('pits') ? [1, 3].map((n) => [`Ground, decoys ${n} pull${n > 1 ? 's' : ''}`, () => {
    const s = session().brushAll().nip().grind(CLAW.OUTER).grind(CLAW.INNER);
    // Straight to the tools: the bot's drag lifts off at target, and these go under it.
    for (const f of CD.findings) if (f.kind !== L?.type) for (let k = 0; k < n * 16; k++) {
      const y = f.y - 24 + (k % 16) * 3;
      applyStroke(s.hoof, 'knife', f.x, y, 3);
      s.art.mark('knife', f.x, y, 0, 3, 14);
    }
    s.art.sync(s.hoof);
    return s;
  }]) : []),
  ...(L?.type === 'foreign' ? [['Ground, funnel pared', () => {
    const s = session().brushAll().nip().grind(CLAW.OUTER).grind(CLAW.INNER);
    for (let k = 0; k < 6 && !s.hoof.drained; k++) s.funnel();
    return s;
  }]] : []),
  ...(L?.type === 'toenecrosis' ? [['Ground, black toe pared', () => {
    const s = session().brushAll().nip().grind(CLAW.OUTER).grind(CLAW.INNER);
    for (let k = 0; k < 4; k++) s.necro();
    return s;
  }]] : []),
  ...(L?.type === 'doublesole' ? [
    ['Brushed, false sole half pared', () => {
      const s = session().brushAll();
      s.drag('knife', [[L.x - L.r, L.y + L.r * 0.3], [L.x + L.r, L.y + L.r * 0.3]], 90);
      s.drag('knife', [[L.x - L.r, L.y + L.r * 0.7], [L.x + L.r, L.y + L.r * 0.7]], 90);
      return s;
    }],
    ['Brushed, false sole pared', () => session().brushAll().pareSole()],
    ['Pared, then ground', () => session().brushAll().pareSole().nip().grind(CLAW.OUTER).grind(CLAW.INNER)],
  ] : []),
  ...(CD.lesions?.length > 1 ? [
    ['Ground, both opened, flushed', () => openAll(session())],
    ['First claw padded', () => dress(openAll(session()), { [CD.lesions[0].claw]: 1 })],
    ['First wrapped, second padded', () => dress(openAll(session()), { [CD.lesions[0].claw]: 2, [CD.lesions[1].claw]: 1 })],
    ['Both wrapped', () => dress(openAll(session()), { [CD.lesions[0].claw]: 2, [CD.lesions[1].claw]: 2 })],
  ] : []),
] : [
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
  const ob = s.hoof.oldBlock;
  if (ob?.on) {
    const pts = clawPolygon(ob.claw, false, s.hoof.side);
    c.save();
    if (ob.taps) { const [x, y] = pts[0]; c.translate(x, y); c.rotate(0.03 * ob.taps); c.translate(-x, -y); }
    drawBlock(c, ob.claw, pts, 1, 1, ob.kind, 1 + ob.taps);
    c.restore();
  }
  for (const U of s.dressing ? s.hoof.lesions() : []) {
    const w = s.dressing[U.claw] ?? 0, pts = clawPolygon(U.claw, false, s.hoof.side);
    if (w >= 1) drawPad(c, U, pts);
    if (w >= 2) drawWrap(c, pts);
  }
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
