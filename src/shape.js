// Claw shape (WP18, D75/D78): no two claws are the same. The sim works on one template foot
// (hoof.js INNER_PTS and GEOM, in view coords); each claw is drawn through its own warp of it,
// and the pointer comes back through the inverse. So the zones, lesions, tutorial targets and the
// bot all stay in template coords, and a cow's shape only changes what the player sees and where
// their finger lands on it.
//
// A claw's warp is affine, anchored on its axial wall at the heel: `w` widens it away from the
// centre line, `sy` lengthens it toward the toe, and `lean` (px at the toe tip) bends the toe in
// toward the other claw, the way an overgrown claw curls. Pure data, no DOM.

import { CFG } from './config.js';
import { mulberry32 } from './noise.js';

const MID = 200;           // centre line between the claws (hoof.js MID_X)
const AXIAL = 7;           // the axial wall's distance from the centre line: the anchor
const HEEL = 182, TIP = 585; // top of the heel bulb and tip of the living toe, in the template
// D79: the camera framing stays put, so the widest claw must stay inside the phone content box
// (config view.phone.content, right edge 362 vs the template's 352). Toe stretch is capped too.
export const LIMIT = { w: [0.95, 1.06], toeMm: [-3, 7], lean: [0, 5] };

const IDENTITY = { w: 1, sy: 1, lean: 0 };
const clamp = (v, [a, b]) => Math.max(a, Math.min(b, v));

// One claw's shape from a width factor and a toe length (mm past the template's).
function shapeOf(w, toeMm, lean) {
  const px = clamp(toeMm, LIMIT.toeMm) * CFG.toe.pxPerMm;
  return { w: clamp(w, LIMIT.w), sy: 1 + px / (TIP - HEEL), lean: clamp(lean, LIMIT.lean) };
}

// Her two claws' shapes, keyed by claw (1 outer, 2 inner), or null for the template foot.
// D78: the claw that overgrows (hind outer, front inner) is about 5% wider with a toe about 4 mm
// longer and a slight curl in; on top of that, each cow ±5% width and ±3 mm toe, from her seed.
// `cd.shape`: 'flat' for the template foot, or { 1: {w, toeMm, lean}, 2: {...} } to set it.
const memo = new WeakMap();
export function clawShapes(cd) {
  if (!cd || cd.shape === 'flat') return null;
  if (memo.has(cd)) return memo.get(cd);
  let out;
  if (cd.shape && typeof cd.shape === 'object') {
    out = {};
    for (const c of [1, 2]) { const s = cd.shape[c] ?? {}; out[c] = shapeOf(s.w ?? 1, s.toeMm ?? 0, s.lean ?? 0); }
  } else {
    const rand = mulberry32((cd.seed ?? 0) ^ 0x5a9e);
    const big = cd.foot === 'front' ? 2 : 1;
    const cowW = (rand() - 0.5) * 0.06, cowToe = (rand() - 0.5) * 4;
    out = {};
    for (const c of [1, 2]) {
      const over = c === big;
      out[c] = shapeOf(
        1 + (over ? 0.05 : 0) + cowW + (rand() - 0.5) * 0.04,
        (over ? 4 : 0) + cowToe + (rand() - 0.5) * 2,
        over ? 2 + rand() * 3 : rand() * 1.5,
      );
    }
  }
  memo.set(cd, out);
  return out;
}

// Which claw sits on screen side s (+1 right, -1 left): see hoof.js clawSide.
function clawOn(s, side) {
  return (s > 0) === (side !== 'RH') ? 2 : 1;
}

// The canvas transform [a, b, c, d, e, f] that draws template coords as claw `claw` on this side.
export function shapeMatrix(sh, s) {
  const ax = MID + s * AXIAL, k = (-s * sh.lean) / (TIP - HEEL);
  return [sh.w, 0, k, sh.sy, ax - sh.w * ax - k * HEEL, HEEL * (1 - sh.sy)];
}

// The two screen halves and their transforms, for a cow: [{ s, claw, m }], or null when flat.
export function warpHalves(cd) {
  const shapes = clawShapes(cd);
  if (!shapes) return null;
  const side = cd.side ?? 'LH';
  return [-1, 1].map((s) => {
    const claw = clawOn(s, side);
    return { s, claw, m: shapeMatrix(shapes[claw] ?? IDENTITY, s) };
  });
}

// A template point as it's drawn. The template's screen half decides the claw.
export function toView(cd, x, y) {
  const shapes = clawShapes(cd);
  if (!shapes) return { x, y };
  const s = x >= MID ? 1 : -1;
  const [a, , c, d, e, f] = shapeMatrix(shapes[clawOn(s, cd.side ?? 'LH')] ?? IDENTITY, s);
  return { x: a * x + c * y + e, y: d * y + f };
}

// A point on screen back in template coords: where the pointer is on the foot.
export function toTemplate(cd, x, y) {
  const shapes = clawShapes(cd);
  if (!shapes) return { x, y };
  const s = x >= MID ? 1 : -1;
  const [a, , c, d, e, f] = shapeMatrix(shapes[clawOn(s, cd.side ?? 'LH')] ?? IDENTITY, s);
  const ty = (y - f) / d;
  return { x: (x - c * ty - e) / a, y: ty };
}
