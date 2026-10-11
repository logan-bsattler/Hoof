// The reward shot. First a short weight test on the trimmed foot (where she'll stand), then
// she's lowered and walks off. Gait reflects the work: sound, tender (a slight hitch), or lame
// (arched back, short stride and a hurried step off the affected hind), scored on the AHDB
// 0-3 mobility scale.

import { CFG } from './config.js';
import { roundRect } from './toolart.js';
import { CLAW, clawPolygon, lesionSpot } from './hoof.js';
import { mulberry32, valueNoise, fbm, smoothstep } from './noise.js';

const { w: W, h: H } = CFG.view;
const GROUND = 560;
const TAU = Math.PI * 2;

const WEIGH = 1.7;    // s of weight test before the walk
const FADE = 0.35;    // s crossfade into the alley
const WALK = 5.4;     // s of walking
const STAMP_AT = 3.0; // s into the walk
const DUTY = 0.7;     // share of each stride a foot spends on the ground
const STRIDE = DUTY * TAU * 12; // px a planted foot travels back, so it doesn't skate

const STAMP = {
  sound: { text: 'SOUND.', color: '#7bbf6a' },
  tender: { text: 'TENDER', color: '#d8a64a' },
  lame: { text: 'STILL LAME', color: '#ff6b5b' },
};
const MOBILITY = ['good mobility', 'imperfect mobility', 'impaired mobility', 'severely impaired mobility'];

// Lateral-sequence walk: left hind, left fore, right hind, right fore, a quarter cycle apart.
// She walks to the right, so her left legs are the far ones. `hip` is along the body from its centre.
const LEGS = [
  { id: 'LH', k: 0, hip: -64, hind: true, far: true },
  { id: 'LF', k: 1, hip: 56, hind: false, far: true },
  { id: 'RH', k: 2, hip: -52, hind: true, far: false },
  { id: 'RF', k: 3, hip: 68, hind: false, far: false },
];

export class Walkoff {
  // `drawFoot(ctx)` paints the trimmed foot for the weight test; `hoof` supplies its contact map.
  constructor(result, sound, { wrapped = false, side = 'LH', foot = 'hind', hoof = null, drawFoot = null } = {}) {
    this.result = result;
    this.wrapped = wrapped;
    this.limpLeg = LEGS.findIndex((L) => L.id === side[0] + (foot === 'front' ? 'F' : 'H')); // index into LEGS
    this.gait = result.gait;
    this.mobility = result.mobility ?? 0;
    this.sound = sound;
    this.hoof = hoof;
    this.drawFoot = drawFoot;
    this.weigh = hoof && drawFoot ? WEIGH : 0;
    this.contact = hoof ? contactPath(hoof) : null;
    this.t = 0;
    this.dur = this.weigh + WALK;
    this.done = false;
    this.stamped = false;
    this.mooed = false;
    this.phase = 0;
    this.lastU = LEGS.map(() => 0);
    this.speed = this.gait === 'lame' ? 70 : this.gait === 'tender' ? 92 : 112;
    this.patches = patchTexture(7 + (hoof?.caseDef?.seed ?? 0));
  }

  skip() { this.t = Math.max(this.t, this.dur); }

  update(dt) {
    this.t += dt;
    const w = this.t - this.weigh;
    if (w >= 0 && !this.mooed) { this.mooed = true; this.sound.moo(false); }
    if (w > 0) {
      // A sore foot is hurried off: the cycle speeds up while it bears weight.
      const hurry = this.gait === 'lame' ? 1.45 : this.gait === 'tender' ? 1.2 : 1;
      const onSore = cycle(this.phase, LEGS[this.limpLeg].k) < DUTY;
      this.phase += dt * (this.speed / 12) * (onSore ? hurry : 1);
      // Clop as each foot lands.
      LEGS.forEach((L, l) => {
        const u = cycle(this.phase, L.k);
        if (u < this.lastU[l] && w < WALK - 0.9) this.sound.clop();
        this.lastU[l] = u;
      });
    }
    if (!this.stamped && w > STAMP_AT) {
      this.stamped = true;
      if (this.gait === 'sound') this.sound.chime();
    }
    if (this.t >= this.dur) this.done = true;
  }

  draw(ctx) {
    const c = ctx;
    const w = this.t - this.weigh;
    if (w < FADE && this.weigh) this.drawWeigh(c, Math.min(this.t, this.weigh));
    if (w > 0) {
      c.save();
      c.globalAlpha = Math.min(1, w / FADE);
      this.drawWalk(c, w);
      c.restore();
    }
  }

  // The trimmed foot with the floor contact glowing: green where she stands, the ulcer off-loaded.
  drawWeigh(c, t) {
    this.drawFoot(c);
    const k = smoothstep(0, 0.5, t);
    const pulse = 0.85 + 0.15 * Math.sin(t * 7);
    c.save();
    c.fillStyle = `rgba(20,14,10,${0.35 * k})`;
    c.fillRect(-20, -20, W + 40, H + 40);
    // Cells are square: clip them to the claw outlines so the glow follows the horn.
    c.save();
    c.beginPath();
    for (const claw of [CLAW.OUTER, CLAW.INNER]) {
      clawPolygon(claw, false, this.hoof.side).forEach(([px, py], j) => (j ? c.lineTo(px, py) : c.moveTo(px, py)));
      c.closePath();
    }
    c.clip();
    c.globalAlpha = k * pulse;
    c.fillStyle = 'rgba(120,230,130,0.6)';
    c.fill(this.contact);
    c.restore();
    c.globalAlpha = k;
    const L = lesionSpot(this.hoof.caseDef.lesion);
    c.textAlign = 'center';
    if (L) {
      c.setLineDash([5, 4]);
      c.strokeStyle = '#8fd0ff';
      c.lineWidth = 2;
      c.beginPath(); c.arc(L.x, L.y, L.r * 2.1, 0, TAU); c.stroke();
      c.setLineDash([]);
      c.font = 'bold 14px system-ui, sans-serif';
      pill(c, 'off the floor', L.x, L.y + L.r * 2.1 + 20, '#8fd0ff');
    }
    c.font = 'bold 18px system-ui, sans-serif';
    pill(c, 'Weight test: where she stands', W / 2, 150, '#c8f0c0');
    c.restore();
  }

  drawWalk(c, w) {
    // Barn alley.
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3a2b1f');
    bg.addColorStop(0.75, '#22180f');
    c.fillStyle = bg;
    c.fillRect(-20, -20, W + 40, H + 40);
    c.fillStyle = '#4a3a2a';
    c.fillRect(-20, GROUND, W + 40, H - GROUND + 20);
    c.fillStyle = 'rgba(255,230,180,0.08)';
    for (let x = -40; x < W + 40; x += 60) c.fillRect(x, 180, 30, 260); // windows of light
    // Trimming chute on the left.
    c.fillStyle = '#5a4632';
    c.fillRect(8, 300, 10, GROUND - 300);
    c.fillRect(70, 300, 10, GROUND - 300);
    c.fillRect(8, 300, 72, 10);

    // Drawn a size up, standing on the alley floor.
    const cx = -110 + w * this.speed;
    c.save();
    c.translate(cx, GROUND);
    c.scale(1.25, 1.25);
    c.translate(-cx, -GROUND);
    this.drawCow(c, cx);
    c.restore();

    if (this.stamped) {
      const s = STAMP[this.gait];
      const k = Math.min(1, (w - STAMP_AT) * 4);
      c.save();
      c.translate(200, 190);
      c.rotate(-0.08);
      c.scale(2 - k, 2 - k);
      c.globalAlpha *= k;
      c.strokeStyle = s.color;
      c.lineWidth = 4;
      c.beginPath(); roundRect(c, -140, -42, 280, 96, 10); c.stroke();
      c.fillStyle = s.color;
      c.font = 'bold 36px Georgia, serif';
      c.textAlign = 'center';
      c.fillText(s.text, 0, 4);
      c.font = 'bold 14px system-ui, sans-serif';
      c.fillText(`${this.result.grade.toUpperCase()} · ${this.result.total}`, 0, 25);
      c.fillText(`Mobility score ${this.mobility} · ${MOBILITY[this.mobility]}`, 0, 44);
      c.restore();
    }

    c.fillStyle = 'rgba(241,231,208,0.6)';
    c.font = '13px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('tap to skip', 200, H - 20);
  }

  drawCow(c, x) {
    const gait = this.gait;
    const limp = LEGS[this.limpLeg];
    const uSore = cycle(this.phase, limp.k);
    // Lameness: the back arches, the head drops, and the hip hikes off the sore foot.
    const arch = gait === 'lame' ? 9 : gait === 'tender' ? 3 : 0;
    const hike = gait === 'sound' ? 0 : (gait === 'lame' ? 6 : 2.5) * (uSore < DUTY ? Math.sin((uSore / DUTY) * Math.PI) : 0);
    const bob = Math.abs(Math.sin(this.phase)) * 1.2;
    const y = 452 - hike + bob;
    const nod = Math.sin(this.phase * 2) * 2 + (gait === 'lame' ? 6 : 0) + hike * 0.8;

    // Ground shadow.
    const sh = c.createRadialGradient(x, GROUND + 3, 10, x, GROUND + 3, 130);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sh;
    c.save();
    c.translate(x, GROUND + 3);
    c.scale(1, 0.09);
    c.beginPath(); c.arc(0, 0, 130, 0, TAU); c.fill();
    c.restore();

    // Legs hang from under the body: the barrel and thighs cover their tops.
    LEGS.forEach((L, i) => L.far && this.leg(c, L, i, x, y));
    LEGS.forEach((L, i) => !L.far && this.leg(c, L, i, x, y));
    tail(c, x, y, this.phase);
    body(c, x, y, arch, this.patches);
    head(c, x, y, nod);
  }

  // One jointed leg, solved from hip to fetlock. Hind legs bend back at the hock, fore legs
  // forward at the knee.
  leg(c, L, i, x, y) {
    const sore = i === this.limpLeg && this.gait !== 'sound';
    const S = STRIDE * (sore ? (this.gait === 'lame' ? 0.5 : 0.75) : 1);
    const u = cycle(this.phase, L.k);
    let fx, lift;
    if (u < DUTY) { fx = S / 2 - (u / DUTY) * S; lift = 0; }
    else {
      const s = (u - DUTY) / (1 - DUTY);
      fx = -S / 2 + S * smoothstep(0, 1, s);
      lift = Math.sin(s * Math.PI) * (sore ? 5 : 14);
    }
    const hx = x + L.hip, hy = y + (L.hind ? 4 : 10);
    const ax = hx + fx, ay = GROUND - 10 - lift; // fetlock
    const [L1, L2] = L.hind ? [58, 44] : [50, 46];
    const [jx, jy] = ik(hx, hy, ax, ay, L1, L2, L.hind ? 1 : -1);
    const skin = L.far ? '#d4cdc0' : '#f3eee4';
    c.lineCap = 'round';
    c.strokeStyle = skin;
    c.lineWidth = L.hind ? 17 : 14;
    c.beginPath(); c.moveTo(hx, hy - 12); c.lineTo(jx, jy); c.stroke();
    c.lineWidth = 9;
    c.beginPath(); c.moveTo(jx, jy); c.lineTo(ax, ay); c.stroke();
    // Joint and fetlock knobs, a little shading on the far side.
    c.fillStyle = skin;
    c.beginPath(); c.arc(jx, jy, L.hind ? 7 : 6, 0, TAU); c.fill();
    c.beginPath(); c.arc(ax, ay, 5.5, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(60,45,30,0.25)';
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(jx + 4, jy); c.lineTo(ax + 3, ay); c.stroke();
    // Hoof: two dark claws.
    c.fillStyle = '#2a211c';
    c.beginPath();
    c.moveTo(ax - 7, ay + 2); c.lineTo(ax + 7, ay + 2); c.lineTo(ax + 11, ay + 11); c.lineTo(ax - 7, ay + 11);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.moveTo(ax + 2, ay + 4); c.lineTo(ax + 3, ay + 11); c.stroke();
    // The treated foot goes out in its bright pink wrap.
    if (this.wrapped && i === this.limpLeg) {
      c.fillStyle = '#f0478f';
      c.beginPath(); roundRect(c, ax - 9, ay - 8, 19, 16, 4); c.fill();
      c.strokeStyle = 'rgba(130,10,70,0.5)';
      c.beginPath(); c.moveTo(ax - 8, ay + 2); c.lineTo(ax + 9, ay - 4); c.stroke();
    }
  }
}

// 0..1 position of leg `k` in its stride; 0 is touchdown.
function cycle(phase, k) {
  const u = phase / TAU - k / 4;
  return u - Math.floor(u);
}

// Two-bone IK: the joint between (hx, hy) and (ax, ay), bending to `bend` (+1 back, -1 forward).
function ik(hx, hy, ax, ay, L1, L2, bend) {
  const d = Math.min(L1 + L2 - 0.5, Math.hypot(ax - hx, ay - hy));
  const a0 = Math.atan2(ay - hy, ax - hx);
  const A = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d))));
  const a = a0 + bend * A;
  return [hx + Math.cos(a) * L1, hy + Math.sin(a) * L1];
}

// Side-on silhouette facing right: pin bones and tail head, hook bone, the back line (arched when
// lame), withers, neck and dewlap, brisket, belly and flank.
function bodyPath(c, x, y, arch) {
  c.beginPath();
  c.moveTo(x - 96, y - 30);
  c.bezierCurveTo(x - 90, y - 44, x - 80, y - 48, x - 68, y - 46);                 // pin to hook bone
  c.bezierCurveTo(x - 30, y - 48 - arch, x + 20, y - 48 - arch, x + 52, y - 46);    // back
  c.quadraticCurveTo(x + 66, y - 54, x + 80, y - 46);                              // withers
  c.quadraticCurveTo(x + 96, y - 40, x + 106, y - 34);                             // neck top
  c.lineTo(x + 108, y - 8);
  c.bezierCurveTo(x + 100, y + 14, x + 90, y + 30, x + 80, y + 34);                // dewlap
  c.quadraticCurveTo(x + 70, y + 44, x + 52, y + 42);                              // brisket
  c.bezierCurveTo(x + 20, y + 50, x - 30, y + 52, x - 52, y + 40);                 // belly
  c.quadraticCurveTo(x - 70, y + 34, x - 78, y + 20);                              // flank to stifle
  c.bezierCurveTo(x - 96, y + 10, x - 102, y - 12, x - 96, y - 30);                // thigh and rump
  c.closePath();
}

function body(c, x, y, arch, patches) {
  // Udder, under the belly between the hind legs.
  c.fillStyle = '#e8aaa0';
  c.beginPath(); c.ellipse(x - 46, y + 44, 17, 11, 0, 0, TAU); c.fill();
  c.fillRect(x - 54, y + 50, 4, 8);
  c.fillRect(x - 40, y + 50, 4, 8);

  c.save();
  bodyPath(c, x, y, arch);
  c.fillStyle = '#f4efe6';
  c.fill();
  c.clip();
  c.drawImage(patches, x - 110, y - 70);
  // Form shading: lit from above, the belly and rump turning away.
  const g = c.createLinearGradient(0, y - 56, 0, y + 52);
  g.addColorStop(0, 'rgba(255,255,255,0.14)');
  g.addColorStop(0.55, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(40,25,10,0.32)');
  c.fillStyle = g;
  c.fillRect(x - 120, y - 70, 240, 130);
  const r = c.createRadialGradient(x - 70, y - 18, 4, x - 70, y - 10, 46);
  r.addColorStop(0, 'rgba(255,255,255,0.12)');
  r.addColorStop(1, 'rgba(0,0,0,0.12)');
  c.fillStyle = r;
  c.fillRect(x - 120, y - 70, 100, 130);
  c.restore();

  c.strokeStyle = 'rgba(40,28,18,0.35)';
  c.lineWidth = 1.2;
  bodyPath(c, x, y, arch);
  c.stroke();
  // Hook and pin bones catch the light.
  c.fillStyle = 'rgba(255,255,255,0.18)';
  c.beginPath(); c.ellipse(x - 70, y - 42, 7, 3, 0, 0, TAU); c.fill();
}

function tail(c, x, y, phase) {
  const sw = Math.sin(phase * 0.7) * 5;
  c.strokeStyle = '#ece5d8';
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(x - 94, y - 34);
  c.bezierCurveTo(x - 108, y - 20, x - 104 + sw * 0.4, y + 20, x - 102 + sw, y + 58);
  c.stroke();
  c.fillStyle = '#2a211c';
  c.beginPath(); c.ellipse(x - 102 + sw, y + 64, 5, 10, 0, 0, TAU); c.fill();
}

function head(c, x, y, nod) {
  c.save();
  c.translate(x + 112, y - 28 + nod);
  c.rotate(0.55);
  // Black head with a white blaze, pink muzzle, ear and eye.
  c.fillStyle = '#1f1a17';
  c.beginPath();
  c.moveTo(-14, -16);
  c.bezierCurveTo(4, -22, 30, -14, 40, -2);
  c.bezierCurveTo(44, 8, 36, 16, 24, 16);
  c.bezierCurveTo(10, 18, -12, 12, -16, 2);
  c.closePath();
  c.fill();
  c.fillStyle = '#f4efe6';
  c.beginPath();
  c.moveTo(-6, -12); c.bezierCurveTo(8, -12, 22, -6, 30, 2); c.bezierCurveTo(18, 4, 4, 0, -6, -12);
  c.fill();
  c.fillStyle = '#e7a9a0';
  c.beginPath(); c.ellipse(36, 6, 9, 10, 0.3, 0, TAU); c.fill();
  c.fillStyle = '#9a5a55';
  c.beginPath(); c.arc(40, 6, 1.6, 0, TAU); c.fill();
  c.fillStyle = '#1f1a17';
  c.beginPath(); c.ellipse(-16, -14, 11, 5, -0.7, 0, TAU); c.fill();
  c.fillStyle = '#c98f86';
  c.beginPath(); c.ellipse(-16, -14, 6, 2.4, -0.7, 0, TAU); c.fill();
  c.fillStyle = '#0c0a09';
  c.beginPath(); c.arc(2, -6, 2.6, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)';
  c.beginPath(); c.arc(2.8, -6.8, 0.8, 0, TAU); c.fill();
  c.restore();
}

// Holstein patches: thresholded fractal noise, soft-edged, painted once per cow.
function patchTexture(seed) {
  const w = 220, h = 130;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const noise = valueNoise(mulberry32(seed));
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const n = fbm(noise, px / 42, py / 34, 3);
      const a = smoothstep(0.5, 0.54, n);
      const o = (py * w + px) * 4;
      img.data[o] = 31; img.data[o + 1] = 26; img.data[o + 2] = 23;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  return cv;
}

// One path of every floor-contact cell, built once.
function contactPath(hoof) {
  const map = hoof.contactMap();
  const p = new Path2D();
  const s = hoof.g.cell;
  for (let i = 0; i < map.length; i++) {
    if (map[i]) p.rect(hoof.cellX(i) - s / 2, hoof.cellY(i) - s / 2, s, s);
  }
  return p;
}

function pill(c, text, x, y, color) {
  const fs = parseFloat(c.font.match(/(\d+(\.\d+)?)px/)[1]);
  const w = c.measureText(text).width + fs;
  c.fillStyle = 'rgba(20,14,10,0.8)';
  c.beginPath(); roundRect(c, x - w / 2, y - fs * 1.05, w, fs * 1.5, 8); c.fill();
  c.fillStyle = color;
  c.fillText(text, x, y);
}
