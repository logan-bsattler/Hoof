// Procedural art for the tools in hand, the rubber block, and the pad + wrap.
// Each tool is drawn with its working point at (x, y) and its body offset away from
// the cut, so the horn under it stays readable. Generic, unbranded designs.

import { mulberry32 } from './noise.js';

const TAU = Math.PI * 2;

function lin(c, x0, y0, x1, y1, stops) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  stops.forEach(([t, col]) => g.addColorStop(t, col));
  return g;
}
const STEEL = [[0, '#5b5f66'], [0.45, '#eef1f4'], [0.6, '#b9bec5'], [1, '#4a4e55']];

// Rounded-rect subpath, added to the current path (render.js and walkoff.js use it too).
export function roundRect(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  roundRect(c, x, y, w, h, r);
}

function dropShadow(c, blur = 8, dx = 4, dy = 6, a = 0.45) {
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowBlur = blur;
  c.shadowOffsetX = dx;
  c.shadowOffsetY = dy;
}

// Hoof knife: a short hooked blade on a wooden handle. `ang` points along the handle,
// which leads the stroke (the knife is drawn toward you). `wear` 0..1 (sand, WP12.4) dulls the
// steel, fades the bright edge and scuffs the blade.
export function drawKnife(c, x, y, ang, wear = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  dropShadow(c, 6, 3, 5, 0.4);
  // Handle.
  c.fillStyle = lin(c, 0, -6, 0, 6, [[0, '#4a2d18'], [0.4, '#9a6638'], [1, '#3b2312']]);
  rrect(c, 34, -5.5, 52, 11, 5);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(40,20,8,0.5)';
  c.lineWidth = 0.6;
  for (let k = 0; k < 4; k++) {
    c.beginPath(); c.moveTo(38, -3 + k * 2); c.bezierCurveTo(55, -4 + k * 2.4, 70, -2 + k * 1.6, 84, -3 + k * 2); c.stroke();
  }
  // Ferrule.
  c.fillStyle = lin(c, 0, -4, 0, 4, STEEL);
  c.fillRect(30, -4, 6, 8);
  // Blade with a hooked tip at the origin.
  c.fillStyle = lin(c, 0, -3.5, 0, 3.5, STEEL);
  c.beginPath();
  c.moveTo(31, -3); c.lineTo(6, -2.6);
  c.quadraticCurveTo(-1, -2.4, -1.5, 2.5);
  c.quadraticCurveTo(-1.8, 6, 2.2, 6.2);
  c.quadraticCurveTo(1.2, 3, 4, 2.4);
  c.lineTo(31, 3);
  c.closePath();
  c.fill();
  if (wear > 0) {
    // Grey-brown film of sand and horn over the steel, then short scratches along the blade.
    c.fillStyle = `rgba(120,108,92,${0.55 * wear})`;
    c.fill();
    c.strokeStyle = `rgba(60,52,44,${0.7 * wear})`;
    c.lineWidth = 0.5;
    c.beginPath();
    for (let k = 0; k < Math.round(7 * wear); k++) {
      const sx = 8 + ((k * 37) % 21), sy = -1.8 + ((k * 13) % 9) * 0.5;
      c.moveTo(sx, sy); c.lineTo(sx + 2.5, sy + 0.6);
    }
    c.stroke();
  }
  c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - 0.85 * wear)})`;
  c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(30, -2.4); c.lineTo(6, -2); c.stroke();
  c.restore();
}

// Angle grinder with a carbide disc centred on (x, y). When spinning the disc blurs
// to a translucent smear so the cut stays visible. `rot` points from the disc along the body.
export function drawGrinder(c, x, y, spin, on, r, rot = 0.72) {
  const R = r * 1.25;
  c.save();
  c.translate(x, y);
  // Body: gearhead and motor housing reaching off to the lower right.
  c.save();
  c.rotate(rot);
  dropShadow(c, 12, 6, 8, 0.5);
  c.fillStyle = lin(c, 0, -14, 0, 14, [[0, '#2b2c30'], [0.4, '#6c6f76'], [1, '#1d1e21']]);
  rrect(c, R * 0.55, -13, 34, 26, 7);
  c.fill();
  c.fillStyle = lin(c, 0, -17, 0, 17, [[0, '#121214'], [0.35, '#3d3f45'], [1, '#0d0d0f']]);
  rrect(c, R * 0.55 + 28, -16.5, 120, 33, 15);
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(0,0,0,0.6)';
  for (let k = 0; k < 5; k++) c.fillRect(R * 0.55 + 60 + k * 9, -10, 4, 20); // vents
  c.fillStyle = '#b8402e';
  c.fillRect(R * 0.55 + 46, -16.5, 6, 33); // switch band
  // Side handle.
  c.fillStyle = '#18191b';
  rrect(c, R * 0.55 + 10, -48, 12, 36, 5);
  c.fill();
  c.restore();
  // Guard over the far half of the disc.
  c.strokeStyle = lin(c, -R, 0, R, 0, STEEL);
  c.lineWidth = 4;
  c.beginPath(); c.arc(0, 0, R + 2, rot - 1.57, rot + 1.58); c.stroke();

  // Disc.
  if (on) {
    const g = c.createRadialGradient(0, 0, R * 0.15, 0, 0, R);
    g.addColorStop(0, 'rgba(70,72,78,0.55)');
    g.addColorStop(0.75, 'rgba(48,48,52,0.32)');
    g.addColorStop(1, 'rgba(150,140,120,0.42)');
    c.fillStyle = g;
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    // Motion-blurred carbide teeth: smeared arcs.
    c.lineCap = 'round';
    for (let k = 0; k < 9; k++) {
      const a = spin * 1.7 + k * (TAU / 9);
      c.strokeStyle = `rgba(230,220,190,${0.15 + (k % 3) * 0.05})`;
      c.lineWidth = 1.5;
      c.beginPath(); c.arc(0, 0, R * (0.78 + (k % 3) * 0.07), a, a + 0.9); c.stroke();
    }
  } else {
    c.fillStyle = '#2b2c30';
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    const rand = mulberry32(3);
    for (let k = 0; k < 70; k++) {
      const a = rand() * TAU, rr = R * (0.55 + rand() * 0.42);
      c.fillStyle = rand() < 0.5 ? '#9a917c' : '#d9d2bf';
      c.fillRect(Math.cos(a + spin) * rr - 0.6, Math.sin(a + spin) * rr - 0.6, 1.3, 1.3);
    }
  }
  // Hub nut.
  c.fillStyle = lin(c, -5, -5, 5, 5, STEEL);
  c.beginPath(); c.arc(0, 0, 4.5, 0, TAU); c.fill();
  c.restore();
}

// Wire brush: bristle block at the contact point, handle trailing off.
export function drawBrush(c, x, y, ang) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  dropShadow(c, 8, 4, 6, 0.45);
  c.fillStyle = lin(c, 0, -10, 0, 10, [[0, '#5a3a1f'], [0.4, '#a87444'], [1, '#4a2e17']]);
  rrect(c, -26, -11, 52, 14, 4);
  c.fill();
  rrect(c, 20, -8, 70, 9, 4);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(205,210,215,0.9)';
  c.lineWidth = 0.5;
  for (let k = -24; k <= 24; k += 1.6) {
    c.beginPath(); c.moveTo(k, 3); c.lineTo(k + 0.6, 9); c.stroke();
  }
  c.restore();
}

// Nippers: two jaws meeting at (x, y), handles off along `rot` (lower right by default).
export function drawNippers(c, x, y, open, rot = 0.8) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.scale(1.4, 1.4);
  c.translate(-22, 0); // jaws centred on the bite
  dropShadow(c, 8, 4, 6, 0.45);
  const a = 0.12 + open * 0.28;
  for (const s of [-1, 1]) {
    c.save();
    c.translate(22, 0);
    c.rotate(s * a);
    c.fillStyle = lin(c, 0, -4, 0, 4, STEEL);
    c.beginPath();
    c.moveTo(-22, s * 0.5); c.quadraticCurveTo(-14, s * 8, 0, s * 4); c.lineTo(0, -s * 2); c.quadraticCurveTo(-12, s * 1, -22, s * 0.5);
    c.fill();
    c.restore();
    c.fillStyle = s < 0 ? '#9d2a22' : '#86231c';
    c.save();
    c.translate(22, 0);
    c.rotate(-s * a * 0.6);
    rrect(c, 6, s * 2 - 4, 92, 8, 4);
    c.fill();
    c.restore();
  }
  c.shadowColor = 'transparent';
  c.fillStyle = lin(c, 18, -4, 26, 4, STEEL);
  c.beginPath(); c.arc(22, 0, 4, 0, TAU); c.fill();
  c.restore();
}

// Rasp: a flat file laid along the stroke.
export function drawRasp(c, x, y, ang) {
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  dropShadow(c, 8, 4, 6, 0.4);
  c.fillStyle = lin(c, 0, -9, 0, 9, [[0, '#55595f'], [0.5, '#a9aeb5'], [1, '#43464b']]);
  rrect(c, -40, -9, 80, 18, 3);
  c.fill();
  c.shadowColor = 'transparent';
  c.strokeStyle = 'rgba(30,32,36,0.55)';
  c.lineWidth = 0.6;
  for (let k = -38; k < 38; k += 3) {
    c.beginPath(); c.moveTo(k, -8); c.lineTo(k + 4, 8); c.stroke();
    c.beginPath(); c.moveTo(k + 4, -8); c.lineTo(k, 8); c.stroke();
  }
  c.fillStyle = lin(c, 0, -6, 0, 6, [[0, '#4a2d18'], [0.4, '#9a6638'], [1, '#3b2312']]);
  rrect(c, 40, -6, 40, 12, 5);
  c.fill();
  c.restore();
}

// Hoof testers: a big pincer, one jaw tip on the spot being tested, handles along `rot`.
export function drawTesters(c, x, y, squeeze, rot = 0.9) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  dropShadow(c, 8, 4, 6, 0.45);
  c.strokeStyle = lin(c, 0, -30, 0, 30, STEEL);
  c.lineWidth = 4;
  c.lineCap = 'round';
  const gap = 34 - squeeze * 6;
  c.beginPath();
  c.moveTo(0, 0); c.quadraticCurveTo(10, -gap * 0.9, 34, -gap * 0.55);
  c.moveTo(0, gap); c.quadraticCurveTo(14, gap * 0.8, 34, -gap * 0.55 + 6);
  c.stroke();
  c.strokeStyle = '#2b2b2e';
  c.lineWidth = 7;
  c.beginPath();
  c.moveTo(36, -gap * 0.5); c.lineTo(110, -8 - squeeze * 3);
  c.moveTo(36, -gap * 0.5 + 6); c.lineTo(110, 12 + squeeze * 3);
  c.stroke();
  c.restore();
  // Contact crosshair.
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.75)';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(x - 7, y); c.lineTo(x - 3, y); c.moveTo(x + 3, y); c.lineTo(x + 7, y);
  c.moveTo(x, y - 7); c.lineTo(x, y - 3); c.moveTo(x, y + 3); c.lineTo(x, y + 7);
  c.stroke();
  c.restore();
}

// Spray bottle aimed at (x, y), held at (bx, by) (lower left by default); a mist cone while spraying.
export function drawSpray(c, x, y, on, t, bx = x - 62, by = y + 54) {
  const ang = Math.atan2(y - by, x - bx);
  if (on) {
    c.save();
    c.translate(bx, by);
    c.rotate(ang);
    const g = c.createLinearGradient(30, 0, 82, 0);
    g.addColorStop(0, 'rgba(150,230,210,0.35)');
    g.addColorStop(1, 'rgba(150,230,210,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(30, 0); c.lineTo(84, -16 - Math.sin(t * 40) * 2); c.lineTo(84, 16); c.closePath(); c.fill();
    c.restore();
  }
  c.save();
  c.translate(bx, by);
  c.rotate(ang);
  dropShadow(c, 10, 5, 7, 0.45);
  // Nozzle and trigger head.
  c.fillStyle = lin(c, 0, -5, 0, 5, [[0, '#1d3fb0'], [0.5, '#4c74ec'], [1, '#162f88']]);
  rrect(c, 10, -5, 22, 10, 3);
  c.fill();
  c.fillStyle = lin(c, 0, -14, 0, 14, [[0, '#d8b400'], [0.4, '#ffe14d'], [1, '#b89300']]);
  rrect(c, -22, -13, 36, 22, 7);
  c.fill();
  c.beginPath(); c.moveTo(-4, 9); c.quadraticCurveTo(4, 26, -6, 34); c.lineTo(-12, 30); c.quadraticCurveTo(-6, 20, -12, 9); c.fill();
  // Bottle body.
  c.fillStyle = 'rgba(235,240,245,0.85)';
  rrect(c, -64, -16, 44, 32, 9);
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = 'rgba(80,190,170,0.7)';
  rrect(c, -62, -2, 40, 16, 7);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)';
  c.fillRect(-58, -12, 30, 2.5);
  c.restore();
}

// A roll of pink cohesive bandage, shown as the pad + wrap cursor, offset (ox, oy) from the aim point.
export function drawWrapRoll(c, x, y, ox = 18, oy = 18) {
  c.save();
  c.translate(x + ox, y + oy);
  dropShadow(c, 8, 4, 6, 0.4);
  c.fillStyle = '#f5f1ea';
  rrect(c, -22, -6, 26, 22, 3);
  c.fill();
  c.fillStyle = lin(c, 0, -12, 0, 12, [[0, '#c72a78'], [0.45, '#ff5aa8'], [1, '#a3205f']]);
  rrect(c, -4, -12, 30, 24, 6);
  c.fill();
  c.shadowColor = 'transparent';
  c.fillStyle = '#d63d8a';
  c.beginPath(); c.ellipse(26, 0, 4, 12, 0, 0, TAU); c.fill();
  c.fillStyle = '#7a1747';
  c.beginPath(); c.ellipse(26, 0, 1.6, 5, 0, 0, TAU); c.fill();
  c.restore();
}

// -------------------------------------------------------------- dock icons

// Each tool laid across a 128-unit square: working point upper left, handle to the lower right.
const ICON = 128;
const Q = Math.PI / 4;
const ICON_DRAW = {
  brush: (c) => { c.translate(64, 64); c.rotate(Q); c.scale(1.3, 1.3); drawBrush(c, -32, -2, 0); },
  probe: (c) => { c.scale(1.02, 1.02); drawTesters(c, 14, 22, 0.4, 0.62); },
  nippers: (c) => { c.scale(0.68, 0.68); drawNippers(c, 34, 34, 0.7, Q); },
  grinder: (c) => { c.scale(0.66, 0.66); drawGrinder(c, 40, 40, 0.3, false, 20, Q); },
  knife: (c) => { c.scale(1.45, 1.45); drawKnife(c, 11, 11, Q); },
  rasp: (c) => { c.translate(64, 64); c.rotate(Q); c.scale(1.22, 1.22); drawRasp(c, -18, 0, 0); },
  block: (c) => miniBlock(c),
  'block:wood': (c) => miniWood(c),
  spray: (c) => { c.scale(1.12, 1.12); drawSpray(c, 108, 8, false, 0, 74, 44); },
  wrap: (c) => { c.translate(64, 64); c.rotate(-0.35); c.scale(2.1, 2.1); drawWrapRoll(c, -2, -2, 0, 0); },
};

// The rubber block on its own: a tilted black superellipse with its rim and lugs.
function miniBlock(c) {
  c.translate(64, 66);
  c.rotate(-0.5);
  dropShadow(c, 8, 4, 6, 0.5);
  superellipse(c, 0, 0, 34, 50);
  c.fillStyle = '#1b1b1d';
  c.fill();
  c.shadowColor = 'transparent';
  superellipse(c, 0, 0, 30, 46);
  c.strokeStyle = lin(c, -34, -50, 34, 50, [[0, '#85858d'], [0.5, '#3a3a3e'], [1, '#111113']]);
  c.lineWidth = 5;
  c.stroke();
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    lug(c, 20 * Math.sign(ca) * Math.abs(ca) ** (2 / 2.6), 34 * Math.sign(sa) * Math.abs(sa) ** (2 / 2.6), 5);
  }
  c.fillStyle = '#2c2c30';
  for (let k = -1; k <= 1; k++) {
    c.beginPath();
    c.moveTo(-9, k * 12 + 5); c.lineTo(9, k * 12 - 5); c.lineTo(9, k * 12 - 1); c.lineTo(-9, k * 12 + 9);
    c.closePath();
    c.fill();
  }
}

// The wood block on its own: a tilted tan block with grain and a lit bevel.
function miniWood(c) {
  c.translate(64, 66);
  c.rotate(-0.5);
  const rand = mulberry32(5);
  woodFace(c, { cx: 0, cy: 0, rx: 34, ry: 50 }, rand);
}

const iconCache = new Map();

// Draw the dock icon for tool `id` into a `size` px square at (0, 0). Rendered once at full
// scale and then shrunk, so the drop shadows shrink with the tool. `kind` picks a variant
// ('wood' for the block).
export function drawToolIcon(c, id, size, kind = '') {
  if (kind && ICON_DRAW[`${id}:${kind}`]) id = `${id}:${kind}`;
  let img = iconCache.get(id);
  if (!img) {
    img = document.createElement('canvas');
    img.width = img.height = ICON;
    const g = img.getContext('2d');
    g.save();
    ICON_DRAW[id]?.(g);
    g.restore();
    iconCache.set(id, img);
  }
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, size, size);
}

// -------------------------------------------------------------- block, pad, wrap

// Outline of a block or pad: the claw outline clipped to a superellipse.
function superellipse(c, cx, cy, rx, ry, n = 2.6) {
  c.beginPath();
  for (let k = 0; k <= 72; k++) {
    const a = (k / 72) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    c.lineTo(cx + rx * Math.sign(ca) * Math.abs(ca) ** (2 / n), cy + ry * Math.sign(sa) * Math.abs(sa) ** (2 / n));
  }
  c.closePath();
}

function polyPath(c, pts) {
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

function bbox(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// The block covers the weight-bearing sole: heel line to past the toe, a touch wider than the
// claw so the claw outline trims its edge. `side` turns the tread bars the right way round.
// Is (x, y) inside the polygon, or within `tol` of its edge?
function nearPoly(pts, x, y, tol) {
  let inside = false, d2 = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    const dx = xj - xi, dy = yj - yi;
    const t = Math.max(0, Math.min(1, ((x - xi) * dx + (y - yi) * dy) / (dx * dx + dy * dy || 1)));
    d2 = Math.min(d2, (xi + t * dx - x) ** 2 + (yi + t * dy - y) ** 2);
  }
  return inside || d2 <= tol * tol;
}

function blockFrame(clawPts) {
  const b = bbox(clawPts);
  const cx = b.x + b.w / 2;
  return { cx, cy: b.y + b.h * 0.62, rx: b.w * 0.54, ry: b.h * 0.45, side: cx < 200 ? -1 : 1 };
}

// Black rubber block, tread out: a raised rim, circular lugs and diagonal bars,
// with glue squeezing out at the edge. `press` 0..1 animates it being pressed on.
// kind 'wood' draws the taller wood block instead (WP8.4). worn: weeks of walking on it (WP9 J2),
// 1 + the knife taps so far, each tap opening the glue line wider.
export function drawBlock(c, claw, clawPts, alpha = 1, press = 1, kind = 'rubber', worn = 0) {
  const f = blockFrame(clawPts);
  const s = 1.06 - 0.06 * press;
  c.save();
  c.globalAlpha = alpha;
  c.translate(f.cx, f.cy);
  c.scale(s, s);
  c.translate(-f.cx, -f.cy);

  // Glue beads peeking out at the edge, only where the edge meets the claw: the frame is wider
  // than the claw's tapering toe, and a bead out on the floor reads as litter. An old block's
  // glue has gone grey with muck, and most of it has worn away.
  const rand = mulberry32(claw * 17);
  c.fillStyle = worn ? 'rgba(118,104,82,0.85)' : 'rgba(232,222,196,0.95)';
  for (let k = 0; k < 26; k++) {
    const a = rand() * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = f.cx + (f.rx + 1) * Math.sign(ca) * Math.abs(ca) ** (2 / 2.6);
    const py = f.cy + (f.ry + 1) * Math.sign(sa) * Math.abs(sa) ** (2 / 2.6);
    const rx = 1.5 + rand() * 3.5, ry = 1.2 + rand() * 2;
    if (!nearPoly(clawPts, px, py, 4) || (worn && k % 3)) continue;
    c.beginPath(); c.ellipse(px, py, rx, ry, a, 0, TAU); c.fill();
  }

  c.save();
  polyPath(c, clawPts);
  c.clip();
  if (kind === 'wood') {
    woodFace(c, f, rand);
    if (worn) wornFace(c, f, rand, worn - 1);
    c.restore();
    c.restore();
    return;
  }
  dropShadow(c, 10, 3, 6, 0.6);
  superellipse(c, f.cx, f.cy, f.rx, f.ry);
  c.fillStyle = '#1b1b1d';
  c.fill();
  c.shadowColor = 'transparent';
  // Raised rim, lit from the upper left.
  superellipse(c, f.cx, f.cy, f.rx - 4, f.ry - 4);
  c.strokeStyle = lin(c, f.cx - f.rx, f.cy - f.ry, f.cx + f.rx, f.cy + f.ry, [[0, '#4a4a4f'], [0.5, '#2a2a2d'], [1, '#111113']]);
  c.lineWidth = 7;
  c.stroke();
  // Circular lugs around the perimeter.
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * TAU;
    const ca = Math.cos(a), sa = Math.sin(a);
    const px = f.cx + (f.rx - 17) * Math.sign(ca) * Math.abs(ca) ** (2 / 2.6);
    const py = f.cy + (f.ry - 17) * Math.sign(sa) * Math.abs(sa) ** (2 / 2.6);
    lug(c, px, py, 7.5);
  }
  // Diagonal bars in the middle.
  c.save();
  superellipse(c, f.cx, f.cy, f.rx - 32, f.ry - 32);
  c.clip();
  for (let k = -12; k <= 12; k++) {
    const yy = f.cy + k * 13;
    c.fillStyle = '#29292c';
    c.beginPath();
    c.moveTo(f.cx - 40, yy + 16 * f.side); c.lineTo(f.cx + 40, yy - 16 * f.side);
    c.lineTo(f.cx + 40, yy - 16 * f.side + 6); c.lineTo(f.cx - 40, yy + 16 * f.side + 6);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(f.cx - 40, yy + 16 * f.side); c.lineTo(f.cx + 40, yy - 16 * f.side); c.stroke();
  }
  c.restore();
  // Dust of trimmings stuck to the rubber.
  for (let k = 0; k < 30; k++) {
    c.fillStyle = `rgba(200,180,140,${0.1 + rand() * 0.2})`;
    c.fillRect(f.cx + (rand() - 0.5) * f.rx * 1.6, f.cy + (rand() - 0.5) * f.ry * 1.6, 1 + rand(), 1 + rand());
  }
  if (worn) wornFace(c, f, rand, worn - 1);
  c.restore();
  c.restore();
}

// Weeks of walking on it: the toe end scuffed flat and pale, a film of dust over the rest,
// muck ground into the tread, and a gap where the glue has let go at the edge. Each knife tap
// (`taps`) runs the gap further round and opens it wider.
function wornFace(c, f, rand, taps = 0) {
  // Dust dulls the whole face.
  superellipse(c, f.cx, f.cy, f.rx, f.ry);
  c.fillStyle = 'rgba(120,110,95,0.22)';
  c.fill();
  // Worn flat towards the toe (the bottom of the frame), where she lands.
  c.fillStyle = lin(c, f.cx, f.cy + f.ry, f.cx, f.cy + f.ry * 0.1, [[0, 'rgba(168,158,140,0.8)'], [0.55, 'rgba(150,140,125,0.45)'], [1, 'rgba(150,140,125,0)']]);
  c.fill();
  // Muck packed into the tread.
  for (let k = 0; k < 16; k++) {
    const x = f.cx + (rand() - 0.5) * f.rx * 1.7, y = f.cy + (rand() - 0.5) * f.ry * 1.7;
    c.fillStyle = `rgba(${62 + rand() * 22 | 0},${52 + rand() * 14 | 0},${38 + rand() * 10 | 0},${0.6 + rand() * 0.3})`;
    // A clump of smaller smears, not one clean oval.
    for (let j = 0; j < 4; j++) {
      c.beginPath();
      c.ellipse(x + (rand() - 0.5) * 12, y + (rand() - 0.5) * 8, 1.5 + rand() * 5, 1 + rand() * 3, rand() * TAU, 0, TAU);
      c.fill();
    }
  }
  // Scratches from the yard floor, running heel to toe.
  c.strokeStyle = 'rgba(225,215,195,0.35)';
  c.lineWidth = 0.9;
  for (let k = 0; k < 24; k++) {
    const x = f.cx + (rand() - 0.5) * f.rx * 1.5, y = f.cy + (rand() - 0.5) * f.ry * 1.4;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 4, y + 8 + rand() * 16); c.stroke();
  }
  // The glue letting go: a dark gap round part of the rim, its pale lifted edge catching the light.
  const a0 = rand() * TAU, span = 1.6 + 0.9 * taps;
  const rim = (inset) => {
    c.beginPath();
    for (let k = 0; k <= 32; k++) {
      const a = a0 + (k / 32) * span;
      const ca = Math.cos(a), sa = Math.sin(a);
      const px = f.cx + (f.rx - inset) * Math.sign(ca) * Math.abs(ca) ** (2 / 2.6);
      const py = f.cy + (f.ry - inset) * Math.sign(sa) * Math.abs(sa) ** (2 / 2.6);
      k ? c.lineTo(px, py) : c.moveTo(px, py);
    }
    c.stroke();
  };
  const gap = 2.4 + 1.6 * taps;
  c.strokeStyle = 'rgba(8,6,4,0.85)';
  c.lineWidth = gap;
  rim(gap / 2);
  c.strokeStyle = 'rgba(200,190,170,0.55)';
  c.lineWidth = 1;
  rim(gap + 0.5);
}

// The wood block's face: squarer than the rubber one, tan with grain running heel to toe,
// a bevelled edge lit from the upper left, and scuffs of trimmings.
function woodFace(c, f, rand) {
  const rx = f.rx, ry = f.ry;
  dropShadow(c, 12, 4, 8, 0.65);
  superellipse(c, f.cx, f.cy, rx, ry, 4);
  c.fillStyle = lin(c, f.cx - rx, f.cy - ry, f.cx + rx, f.cy + ry, [[0, '#d2a46a'], [0.55, '#b98a52'], [1, '#93683a']]);
  c.fill();
  c.shadowColor = 'transparent';
  c.save();
  superellipse(c, f.cx, f.cy, rx, ry, 4);
  c.clip();
  // Grain: long wavering lines, a darker late-wood band now and then.
  for (let k = -16; k <= 16; k++) {
    const x0 = f.cx + k * rx / 15 + (rand() - 0.5) * 3;
    const late = rand() < 0.3;
    c.strokeStyle = late ? 'rgba(110,70,32,0.45)' : 'rgba(120,80,40,0.22)';
    c.lineWidth = late ? 1.6 + rand() : 0.7 + rand() * 0.6;
    const amp = 1.5 + rand() * 2.5, ph = rand() * TAU, fq = 0.025 + rand() * 0.02;
    c.beginPath();
    for (let y = f.cy - ry; y <= f.cy + ry; y += 4) {
      const x = x0 + amp * Math.sin(ph + y * fq);
      y === f.cy - ry ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
  }
  // A knot, off centre.
  const kx = f.cx + (rand() - 0.5) * rx * 0.8, ky = f.cy + (rand() - 0.2) * ry * 0.6;
  for (let r = 7; r > 0; r -= 2.2) {
    c.strokeStyle = `rgba(96,58,26,${0.25 + (7 - r) * 0.06})`;
    c.lineWidth = 1.2;
    c.beginPath(); c.ellipse(kx, ky, r * 0.8, r * 1.4, 0, 0, TAU); c.stroke();
  }
  // Scuffs of trimmings.
  for (let k = 0; k < 30; k++) {
    c.fillStyle = `rgba(235,215,170,${0.1 + rand() * 0.2})`;
    c.fillRect(f.cx + (rand() - 0.5) * rx * 1.6, f.cy + (rand() - 0.5) * ry * 1.6, 1 + rand(), 1 + rand());
  }
  c.restore();
  // Bevelled edge: light on the upper left, dark on the lower right.
  superellipse(c, f.cx, f.cy, rx - 2.5, ry - 2.5, 4);
  c.strokeStyle = lin(c, f.cx - rx, f.cy - ry, f.cx + rx, f.cy + ry, [[0, 'rgba(250,224,170,0.85)'], [0.5, 'rgba(180,130,80,0.3)'], [1, 'rgba(70,42,18,0.85)']]);
  c.lineWidth = 5;
  c.stroke();
}

function lug(c, x, y, r) {
  c.fillStyle = '#0f0f11';
  c.beginPath(); c.arc(x, y, r + 1.2, 0, TAU); c.fill();
  c.strokeStyle = lin(c, x - r, y - r, x + r, y + r, [[0, '#55555b'], [1, '#18181a']]);
  c.lineWidth = 2.6;
  c.beginPath(); c.arc(x, y, r - 1.5, 0, TAU); c.stroke();
  c.fillStyle = lin(c, x - 3, y - 3, x + 3, y + 3, [[0, '#4d4d52'], [1, '#1c1c1f']]);
  c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
}

// White treatment pad pressed over the lesion, with the antiseptic blooming through.
export function drawPad(c, lesion, clawPts, alpha = 1) {
  // A white-line track is dressed over the pocket it drained from, not where it starts.
  lesion = lesion.pocket ?? lesion;
  c.save();
  c.globalAlpha = alpha;
  polyPath(c, clawPts);
  c.clip();
  // Sized to the claw and centred a little below the lesion, nudged away from the axial wall,
  // and kept inside the claw's length.
  const b = bbox(clawPts);
  const rx = b.w * 0.455, ry = b.h * 0.29;
  const cx = lesion.x + (b.x + b.w / 2 - lesion.x) * 0.12;
  const cy = Math.max(b.y + ry * 0.6, Math.min(b.y + b.h - ry * 0.6, lesion.y + ry * 0.5));
  dropShadow(c, 8, 2, 5, 0.45);
  superellipse(c, cx, cy, rx, ry, 2.3);
  c.fillStyle = '#f7f5f0';
  c.fill();
  c.shadowColor = 'transparent';
  c.clip();
  const g = c.createRadialGradient(lesion.x, lesion.y, 2, lesion.x, lesion.y, 30);
  g.addColorStop(0, 'rgba(90,186,160,0.55)');
  g.addColorStop(1, 'rgba(90,186,160,0)');
  c.fillStyle = g;
  c.fillRect(cx - rx - 4, cy - ry - 2, rx * 2 + 8, ry * 2 + 4);
  const rand = mulberry32(8);
  c.strokeStyle = 'rgba(170,165,150,0.25)';
  c.lineWidth = 0.4;
  for (let k = 0; k < 260; k++) {
    const x = cx + (rand() - 0.5) * rx * 2, y = cy + (rand() - 0.5) * ry * 2, a = rand() * TAU;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3); c.stroke();
  }
  const sh = c.createLinearGradient(cx - rx, cy - ry, cx + rx, cy + ry);
  sh.addColorStop(0, 'rgba(255,255,255,0.25)');
  sh.addColorStop(1, 'rgba(60,50,40,0.25)');
  c.fillStyle = sh;
  c.fillRect(cx - rx - 4, cy - ry - 2, rx * 2 + 8, ry * 2 + 4);
  c.restore();
}

// Bright pink cohesive wrap around the treated claw, in overlapping turns.
export function drawWrap(c, clawPts, alpha = 1, progress = 1) {
  const xs = clawPts.map((p) => p[0]), ys = clawPts.map((p) => p[1]);
  const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6;
  const y0 = Math.min(...ys) - 4, y1 = Math.max(...ys) + 4;
  c.save();
  c.globalAlpha = alpha;
  // Wound on from the heel down: `progress` reveals it top to bottom.
  c.beginPath();
  c.rect(x0, y0, x1 - x0, (y1 - y0) * progress);
  c.clip();
  // The claw outline plus a thick stroke, so the wrap sits proud of the horn.
  polyPath(c, clawPts);
  dropShadow(c, 10, 3, 6, 0.5);
  c.fillStyle = '#f0478f';
  c.fill();
  c.lineWidth = 7;
  c.lineJoin = 'round';
  c.strokeStyle = '#f0478f';
  c.stroke();
  c.shadowColor = 'transparent';
  c.clip();
  // Overlapping turns.
  for (let y = y0 - 60; y < y1 + 40; y += 22) {
    c.fillStyle = (Math.round(y / 22) % 2) ? 'rgba(255,120,180,0.35)' : 'rgba(200,30,110,0.18)';
    c.beginPath();
    c.moveTo(x0 - 10, y); c.lineTo(x1 + 10, y - 40); c.lineTo(x1 + 10, y - 18); c.lineTo(x0 - 10, y + 22);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(130,10,70,0.45)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(x0 - 10, y + 22); c.lineTo(x1 + 10, y - 18); c.stroke();
  }
  // Crinkle texture.
  const rand = mulberry32(21);
  c.strokeStyle = 'rgba(255,220,240,0.22)';
  c.lineWidth = 0.5;
  for (let k = 0; k < 340; k++) {
    const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 3, y - 1.5 + rand() * 3); c.stroke();
  }
  // Form shading: lit upper left.
  const sh = c.createRadialGradient(x0 + (x1 - x0) * 0.35, y0 + (y1 - y0) * 0.3, 10, x0 + (x1 - x0) * 0.5, y0 + (y1 - y0) * 0.5, (y1 - y0) * 0.65);
  sh.addColorStop(0, 'rgba(255,255,255,0.18)');
  sh.addColorStop(1, 'rgba(60,0,30,0.35)');
  c.fillStyle = sh;
  c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.restore();
}
