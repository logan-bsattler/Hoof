// The set around the hoof: a hydraulic trimming chute, the leg above the heels, a
// straw-littered floor, and the strap between the claws. The far layer is painted at
// low resolution and scaled up, which gives a cheap shallow depth of field.
// Procedural and original: no reference imagery is used.

import { light } from './seasonart.js';
import { CFG } from './config.js';
import { mulberry32 } from './noise.js';

const { w: W, h: H } = CFG.view;
const B = CFG.view.phone.bleed; // painted past each side, for the wider phone framing

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

// Paint the static backdrop at scale k (device px per logical px). The result covers logical
// x −B…W+B, so draw it at (−B, 0, W + 2B, H).
export function paintScenery(k, season = 'spring') {
  const out = canvas((W + 2 * B) * k, H * k);
  const c = out.getContext('2d');
  c.setTransform(k, 0, 0, k, B * k, 0);

  // Far layer, out of focus: barn floor and steel posts.
  const fk = Math.max(0.3, k * 0.28);
  const far = canvas((W + 2 * B) * fk, H * fk);
  const f = far.getContext('2d');
  f.setTransform(fk, 0, 0, fk, B * fk, 0);
  paintFar(f, season);
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(far, -B, 0, W + 2 * B, H);

  // Near layer, in focus: the chute hardware beside and above the foot.
  paintChute(c);
  paintLeg(c);
  return out;
}

function paintFar(c, season) {
  const rand = mulberry32(512);
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#16120f');
  bg.addColorStop(0.45, '#2a231c');
  bg.addColorStop(1, '#3b3127');
  c.fillStyle = bg;
  c.fillRect(-B, 0, W + 2 * B, H);

  // Daylight from the barn door, upper right, in the season's colour (WP15.1).
  const sun = c.createRadialGradient(360, 260, 10, 360, 260, 300);
  sun.addColorStop(0, light(season));
  sun.addColorStop(1, light(season, 0));
  c.fillStyle = sun;
  c.fillRect(-B, 0, W + 2 * B, H);

  // Floor: manure-dark concrete with straw bedding. The bleed strips get their own seeds,
  // so the main scene's floor is the same as before they existed.
  paintFloor(c, rand, 0, W);
  paintFloor(c, mulberry32(513), -B, B);
  paintFloor(c, mulberry32(514), W, B);

  // Steel posts of the chute on the right, and a far rail.
  for (const [x, wd] of [[352, 20], [384, 16], [452, 14]]) {
    const g = c.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
    g.addColorStop(0, '#15161a'); g.addColorStop(0.35, '#4a4d55'); g.addColorStop(1, '#101114');
    c.fillStyle = g;
    c.fillRect(x - wd / 2, 0, wd, 520);
  }
  c.fillStyle = 'rgba(20,20,24,0.8)';
  c.fillRect(-B, 300, W + 2 * B, 8);
}

// Muck and straw over the floor strip x0…x0+w (counts scale with the width).
function paintFloor(c, rand, x0, w) {
  const n = w / W;
  for (let k = 0; k < 260 * n; k++) {
    const x = x0 + rand() * w, y = 380 + rand() * 360;
    c.fillStyle = `rgba(${20 + rand() * 30 | 0},${16 + rand() * 20 | 0},${10 + rand() * 14 | 0},0.5)`;
    c.beginPath(); c.ellipse(x, y, 4 + rand() * 14, 2 + rand() * 6, 0, 0, Math.PI * 2); c.fill();
  }
  c.lineCap = 'round';
  for (let k = 0; k < 1400 * n; k++) {
    const x = x0 + rand() * w, y = 330 + rand() ** 0.7 * 400;
    const len = 6 + rand() * 26, a = rand() * Math.PI;
    const l = 0.55 + rand() * 0.6;
    c.strokeStyle = `rgba(${210 * l | 0},${172 * l | 0},${92 * l | 0},${0.35 + rand() * 0.5})`;
    c.lineWidth = 0.8 + rand() * 1.6;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.5); c.stroke();
  }
}

function steel(c, x0, y0, x1, y1, light = '#5d6068', dark = '#1a1b1f') {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, dark); g.addColorStop(0.45, light); g.addColorStop(1, dark);
  return g;
}

function bolt(c, x, y, r) {
  c.save();
  c.translate(x, y);
  c.fillStyle = steel(c, -r, -r, r, r, '#8a8c90', '#2a2b2e');
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.5)';
  c.lineWidth = 0.8;
  c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath(); c.arc(-r * 0.25, -r * 0.3, r * 0.35, 0, Math.PI * 2); c.fill();
  c.restore();
}

function paintChute(c) {
  // Dark steel frame plate down the left side.
  c.fillStyle = steel(c, 0, 0, 70, 0, '#3b3d43', '#141518');
  c.beginPath();
  c.moveTo(-B, 96); c.lineTo(58, 96); c.lineTo(66, 150); c.lineTo(52, 430); c.lineTo(-B, 440);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.6)';
  c.lineWidth = 1.5;
  c.stroke();
  // Rust and grime.
  const rand = mulberry32(99);
  for (let k = 0; k < 80; k++) {
    c.fillStyle = `rgba(${90 + rand() * 50 | 0},${50 + rand() * 30 | 0},${20},${0.1 + rand() * 0.2})`;
    c.beginPath(); c.arc(rand() * 60, 100 + rand() * 330, 0.5 + rand() * 3, 0, Math.PI * 2); c.fill();
  }

  // Hydraulic cylinder across the top: barrel plus a chrome rod.
  c.fillStyle = steel(c, 0, 118, 0, 150, '#555860', '#121316');
  c.fillRect(-B, 118, 66 + B, 32);
  c.fillStyle = steel(c, 0, 125, 0, 143, '#f4f6f8', '#5a5e66');
  c.fillRect(64, 125, 108, 18);
  c.fillStyle = 'rgba(255,255,255,0.65)';
  c.fillRect(64, 129, 108, 2);
  // Clevis block with bolts at the rod end.
  c.fillStyle = steel(c, 168, 112, 198, 156, '#6a6d74', '#1d1e22');
  c.fillRect(166, 112, 30, 44);
  bolt(c, 181, 124, 6.5);
  bolt(c, 181, 145, 5);

  // Round boss and pivot bolt beside the outer claw.
  c.fillStyle = steel(c, 14, 228, 54, 268, '#7b7768', '#25241f');
  c.beginPath(); c.arc(32, 250, 21, 0, Math.PI * 2); c.fill();
  bolt(c, 32, 250, 8);
  bolt(c, 30, 330, 7);

  // Black hydraulic hose looping down and away.
  c.strokeStyle = '#0b0b0c';
  c.lineWidth = 9;
  c.lineCap = 'round';
  c.beginPath(); c.moveTo(-B, 330); c.quadraticCurveTo(-40, 345, -10, 380); c.bezierCurveTo(40, 470, 10, 560, 90, 640); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.12)';
  c.lineWidth = 2;
  c.beginPath(); c.moveTo(-B, 327); c.quadraticCurveTo(-38, 342, -8, 377); c.bezierCurveTo(42, 466, 12, 556, 92, 636); c.stroke();
}

// The lower leg above the heel bulbs, receding toward the chute.
function paintLeg(c) {
  const g = c.createLinearGradient(0, 100, 0, 230);
  g.addColorStop(0, '#0e0c0b');
  g.addColorStop(1, '#2a2119');
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(70, 90); c.bezierCurveTo(90, 160, 60, 200, 60, 240);
  c.lineTo(340, 240); c.bezierCurveTo(340, 200, 312, 160, 330, 90);
  c.closePath();
  c.fill();
  // Hair and caked dirt.
  const rand = mulberry32(31);
  c.lineCap = 'round';
  for (let k = 0; k < 500; k++) {
    const x = 70 + rand() * 260, y = 96 + rand() * 140;
    const l = rand();
    c.strokeStyle = `rgba(${60 + 50 * l | 0},${46 + 36 * l | 0},${28 + 18 * l | 0},${0.25 + rand() * 0.4})`;
    c.lineWidth = 0.5 + rand();
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rand() - 0.5) * 4, y + 3 + rand() * 6); c.stroke();
  }
  // Interdigital cleft: a dark wedge between the heels.
  const cg = c.createLinearGradient(185, 0, 215, 0);
  cg.addColorStop(0, 'rgba(0,0,0,0)'); cg.addColorStop(0.5, 'rgba(0,0,0,0.85)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = cg;
  c.fillRect(185, 170, 30, 450);
}

// The strap that runs between the claws, drawn in front of the hoof.
export function drawStrap(c) {
  c.save();
  c.beginPath();
  c.moveTo(194, -10); c.lineTo(204, -10); c.lineTo(205.5, 300); c.lineTo(197.5, 330); c.closePath();
  const g = c.createLinearGradient(194, 0, 206, 0);
  g.addColorStop(0, '#1d5a35'); g.addColorStop(0.45, '#3f9c62'); g.addColorStop(1, '#1a4c2d');
  c.fillStyle = g;
  c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.35)';
  c.lineWidth = 0.8;
  c.stroke();
  // Weave lines and muck.
  c.strokeStyle = 'rgba(255,255,255,0.08)';
  for (let y = 0; y < 320; y += 3) { c.beginPath(); c.moveTo(195, y); c.lineTo(205, y + 1); c.stroke(); }
  const rand = mulberry32(5);
  for (let k = 0; k < 40; k++) {
    c.fillStyle = `rgba(60,44,26,${0.3 + rand() * 0.5})`;
    c.beginPath(); c.arc(195 + rand() * 10, 150 + rand() * 180, 0.6 + rand() * 1.8, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// Soft contact shadow for a polygon, prepared once (blur via low-res upscale).
export function shadowSprite(pts, k) {
  const pad = 30, s = Math.max(0.25, k * 0.25);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  const w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  const cv = canvas(w * s, h * s);
  const c = cv.getContext('2d');
  c.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
  c.fillStyle = '#000';
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  // Second pass at an even lower resolution softens it further.
  const cv2 = canvas(cv.width * 0.5, cv.height * 0.5);
  cv2.getContext('2d').drawImage(cv, 0, 0, cv2.width, cv2.height);
  return { img: cv2, x: x0, y: y0, w, h };
}
