// Knife stroke modes (WP16): the stroke picks the mode. A long pull carves; a short, quick
// stroke flicks the hook. A flick can't be known until the finger lifts, so a knife stroke
// starts undecided: its points are held back until it has gone too far or taken too long to
// be a flick. Then it's a carve, and the held points are cut at once. No DOM in here.

import { CFG } from './config.js';

// A new knife stroke at (x, y). Clock times `t` below are in ms.
export function startStroke(x, y) {
  return { kind: 'pending', path: [{ x, y }], css: 0, t0: null };
}

// The pointer moved to (x, y): `css` CSS px on screen, the stroke now `moved` logical px long.
// Returns true on the move that decides it's a carve; s.path then holds the points to cut.
export function strokeMove(s, x, y, css, moved, t) {
  if (s.kind !== 'pending') return false;
  s.path.push({ x, y });
  s.css += css;
  // The clock starts when the knife starts to move: a finger resting before a flick isn't counted.
  if (s.t0 == null && moved >= CFG.tools.knife.engage) s.t0 = t;
  return decide(s, t);
}

// Called each frame while the finger is down: a stroke held past the flick time is a carve.
export function strokeTick(s, t) {
  return s.kind === 'pending' && decide(s, t);
}

function decide(s, t) {
  const k = CFG.tools.knife;
  if (s.css > k.flickMax || (s.t0 != null && t - s.t0 > k.flickTime)) { s.kind = 'carve'; return true; }
  return false;
}

// The finger lifted, the stroke `moved` logical px long. 'tap' (the pry), 'flick', or 'carve'
// (still pending: the held points are to be cut now).
export function strokeEnd(s, moved, t) {
  if (s.kind === 'carve') return 'carve';
  if (moved < CFG.tools.knife.tapMax) return 'tap';
  return decide(s, t) ? 'carve' : 'flick';
}
