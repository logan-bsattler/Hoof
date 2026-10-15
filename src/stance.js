// How she stands on the walk-in (WP14.3): a rear-view sketch of her hind legs on the intro card.
// On a hind foot with a sore outer claw she toes out, the hock a touch in, to put her weight on
// the inner claw (NYE 1:38:35, autumn 22:11). Every hind cow gets the sketch, so its being there
// says nothing; only the turned foot does. Front feet and sound or two-claw cows stand square.

import { CLAW } from './hoof.js';

// Lesion kinds that make the claw sore enough to turn her foot out.
export const TOE_OUT_KINDS = new Set(['ulcer', 'whiteline', 'foreign', 'toenecrosis', 'dds']);

export const TOE_OUT_LINE = 'She was toeing out on the walk-in: that’s the outer claw talking.';

// 'out' when the trimmed hind foot toes out, 'square' for any other hind foot, null for a front.
export function stance(cd) {
  if (cd.foot === 'front') return null;
  const L = cd.lesion;
  return L && !cd.lesions && L.claw === CLAW.OUTER && TOE_OUT_KINDS.has(L.type) ? 'out' : 'square';
}

export const STANCE_W = 160, STANCE_H = 120;
const TURN = (15 * Math.PI) / 180;
const GROUND = 110;
const FORE = 0.7; // how much ground depth shows: the eye is above her hocks, looking down

// Paint the sketch onto `canvas` (sized here for the screen's pixel ratio). `side` is the
// trimmed foot ('LH' | 'RH'); her left hind is on the viewer's left, as seen from behind.
export function drawStance(canvas, cd) {
  const kind = stance(cd);
  if (!kind) return;
  const dpr = Math.min(3, globalThis.devicePixelRatio || 1);
  canvas.width = STANCE_W * dpr;
  canvas.height = STANCE_H * dpr;
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, STANCE_W, STANCE_H);
  // Straw floor, darker toward the back of the alley.
  const fl = c.createLinearGradient(0, 60, 0, STANCE_H);
  fl.addColorStop(0, '#5c4a34');
  fl.addColorStop(1, '#a88a5e');
  c.fillStyle = fl;
  c.fillRect(0, 0, STANCE_W, STANCE_H);
  // The rump and the backs of the thighs, cut off by the top of the frame.
  c.fillStyle = '#f3eee4';
  c.beginPath();
  c.moveTo(8, 0); c.lineTo(152, 0);
  c.bezierCurveTo(150, 22, 132, 36, 114, 40);
  c.lineTo(46, 40);
  c.bezierCurveTo(28, 36, 10, 22, 8, 0);
  c.fill();
  // A black Holstein patch over one hip, and the udder's shadow between the thighs.
  c.fillStyle = '#26201c';
  c.beginPath(); c.ellipse(38, 6, 26, 15, 0.2, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(60,40,30,0.35)';
  c.beginPath(); c.ellipse(80, 38, 22, 6, 0, 0, Math.PI * 2); c.fill();
  for (const leg of ['LH', 'RH']) {
    const s = leg === 'LH' ? -1 : 1; // which way is outward on screen
    const out = kind === 'out' && cd.side === leg;
    drawLeg(c, 80 + s * 30, s, out);
  }
}

// One hind leg from behind: thigh, hock, cannon, fetlock, and both claws on the floor. `s` is
// -1 for the leg on the viewer's left. A turned-out leg has its hock a touch in and its toe out.
function drawLeg(c, x, s, out) {
  const hockX = x - (out ? s * 4 : 0), hockY = 54;
  const heelX = x + (out ? s * 2 : 0), fetY = GROUND - 24;
  const a = out ? s * TURN : 0;
  // Shadow on the floor.
  c.fillStyle = 'rgba(30,20,12,0.4)';
  c.beginPath(); c.ellipse(heelX + s * (out ? 4 : 0), GROUND - 6, 18, 8, 0, 0, Math.PI * 2); c.fill();
  // Claws first: they run away from the viewer, behind the leg. In ground coordinates (u across,
  // v away from the viewer), each runs from its heel (v 0) to its toe (v 40).
  for (const k of [-1, 1]) {
    const pts = [[k * 1, 0], [k * 10, 2], [k * 10.5, 20], [k * 6.5, 36], [k * 2.5, 40], [k * 1, 35]].map(([u, v]) => {
      const ru = u * Math.cos(a) + v * Math.sin(a), rv = -u * Math.sin(a) + v * Math.cos(a);
      return [heelX + ru, GROUND - rv * FORE];
    });
    c.fillStyle = '#2a211c';
    c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    for (const [px, py] of pts.slice(1)) c.lineTo(px, py);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(pts[1][0], pts[1][1]); c.lineTo(pts[2][0], pts[2][1]); c.stroke();
  }
  // The leg: thigh, hock, cannon, fetlock and a short pastern down to the heels.
  c.lineCap = 'round';
  c.strokeStyle = '#f3eee4';
  c.lineWidth = 20;
  c.beginPath(); c.moveTo(x + s * 4, 30); c.lineTo(hockX, hockY); c.stroke();
  c.lineWidth = 10;
  c.beginPath(); c.moveTo(hockX, hockY); c.lineTo(heelX, fetY); c.stroke();
  c.lineWidth = 9;
  c.beginPath(); c.moveTo(heelX, fetY); c.lineTo(heelX, GROUND - 8); c.stroke();
  c.fillStyle = '#f3eee4';
  c.beginPath(); c.arc(hockX, hockY, 8, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(heelX, fetY, 6.5, 0, Math.PI * 2); c.fill();
  // The point of the hock and a shade line down the inside of the cannon.
  c.strokeStyle = 'rgba(60,45,30,0.3)';
  c.lineWidth = 1.2;
  c.beginPath(); c.arc(hockX, hockY - 2, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.beginPath(); c.moveTo(hockX - s * 4, hockY + 6); c.lineTo(heelX - s * 3, fetY - 4); c.stroke();
  // Heel bulbs, nearest the viewer, turned with the foot.
  c.fillStyle = '#4a3a30';
  for (const k of [-1, 1]) {
    const u = k * 5;
    c.beginPath(); c.ellipse(heelX + u * Math.cos(a), GROUND - 4 + u * Math.sin(a) * FORE, 5, 4.5, 0, 0, Math.PI * 2); c.fill();
  }
}
