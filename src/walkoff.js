// The reward shot: the cow is lowered and walks off. Gait reflects the work —
// sound, tender (slight bob), or lame (clear limp on the affected hind leg).

import { CFG } from './config.js';
import { roundRect } from './render.js';

const { w: W, h: H } = CFG.view;
const GROUND = 560;

const STAMP = {
  sound: { text: 'SOUND.', color: '#7bbf6a' },
  tender: { text: 'TENDER', color: '#d8a64a' },
  lame: { text: 'STILL LAME', color: '#ff6b5b' },
};

export class Walkoff {
  constructor(result, sound, { wrapped = false } = {}) {
    this.result = result;
    this.wrapped = wrapped;
    this.gait = result.gait;
    this.sound = sound;
    this.t = 0;
    this.dur = 5.4;
    this.done = false;
    this.stamped = false;
    this.lastStep = [0, 0, 0, 0];
    this.speed = this.gait === 'lame' ? 70 : this.gait === 'tender' ? 95 : 115;
    sound.moo(false);
  }

  skip() { this.t = Math.max(this.t, this.dur); }

  update(dt) {
    this.t += dt;
    const phase = this.t * (this.speed / 18);
    // Clop on each footfall.
    for (let l = 0; l < 4; l++) {
      const s = Math.sin(phase + LEGS[l].off);
      const down = s < 0 ? 1 : 0;
      if (down && !this.lastStep[l] && this.t < 4.5) this.sound.clop();
      this.lastStep[l] = down;
    }
    if (!this.stamped && this.t > 3.0) {
      this.stamped = true;
      if (this.gait === 'sound') this.sound.chime();
    }
    if (this.t >= this.dur) this.done = true;
  }

  draw(ctx) {
    const c = ctx;
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

    const x = -60 + this.t * this.speed;
    drawCow(c, x, this.t * (this.speed / 18), this.gait, this.wrapped);

    if (this.stamped) {
      const s = STAMP[this.gait];
      const k = Math.min(1, (this.t - 3.0) * 4);
      c.save();
      c.translate(200, 190);
      c.rotate(-0.08);
      c.scale(2 - k, 2 - k);
      c.globalAlpha = k;
      c.strokeStyle = s.color;
      c.lineWidth = 4;
      c.beginPath(); roundRect(c, -110, -38, 220, 76, 10); c.stroke();
      c.fillStyle = s.color;
      c.font = 'bold 40px Georgia, serif';
      c.textAlign = 'center';
      c.fillText(s.text, 0, 8);
      c.font = 'bold 13px system-ui, sans-serif';
      c.fillText(`${this.result.grade.toUpperCase()} · ${this.result.total}`, 0, 28);
      c.restore();
    }

    c.fillStyle = 'rgba(241,231,208,0.5)';
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('tap to skip', 200, H - 20);
  }
}

// Leg layout relative to body centre. `off` is the gait phase offset.
const LEGS = [
  { dx: -58, off: 0, back: true, far: true },        // left hind (affected)
  { dx: -44, off: Math.PI, back: true, far: false },
  { dx: 50, off: Math.PI / 2, back: false, far: true },
  { dx: 62, off: (3 * Math.PI) / 2, back: false, far: false },
];

function drawCow(c, x, phase, gait, wrapped) {
  const limpLeg = 0;
  const bobAmp = gait === 'lame' ? 7 : gait === 'tender' ? 3 : 1;
  // Body dips when the sore leg takes weight.
  const bob = gait === 'sound'
    ? Math.abs(Math.sin(phase)) * bobAmp
    : Math.max(0, -Math.sin(phase + LEGS[limpLeg].off)) * bobAmp;
  const by = 465 + bob;

  const leg = (L, idx) => {
    const stride = idx === limpLeg && gait !== 'sound' ? (gait === 'lame' ? 0.12 : 0.22) : 0.38;
    const s = Math.sin(phase + L.off);
    const ang = s * stride;
    const lift = Math.max(0, Math.cos(phase + L.off)) * (idx === limpLeg && gait === 'lame' ? 2 : 7);
    const hx = x + L.dx, hy = by + 30;
    const len = GROUND - hy;
    const fx = hx + Math.sin(ang) * len, fy = hy + Math.cos(ang) * len - lift;
    const kx = (hx + fx) / 2 + (L.back ? -6 : 4), ky = (hy + fy) / 2;
    c.strokeStyle = L.far ? '#cfc8bb' : '#f2ede3';
    c.lineWidth = 13;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx, hy); c.quadraticCurveTo(kx, ky, fx, fy); c.stroke();
    c.fillStyle = '#2a211c';
    c.beginPath(); roundRect(c, fx - 8, fy - 6, 16, 9, 3); c.fill();
    // The treated foot goes out in its bright pink wrap.
    if (wrapped && idx === limpLeg) {
      c.fillStyle = '#f0478f';
      c.beginPath(); roundRect(c, fx - 9, fy - 15, 18, 14, 4); c.fill();
    }
  };

  // Far legs behind the body.
  LEGS.forEach((L, i) => L.far && leg(L, i));

  // Tail.
  c.strokeStyle = '#efe9de';
  c.lineWidth = 4;
  c.beginPath();
  c.moveTo(x - 84, by - 28);
  c.quadraticCurveTo(x - 98, by + 10 + Math.sin(phase * 0.7) * 4, x - 92 + Math.sin(phase * 0.7) * 5, by + 50);
  c.stroke();
  c.fillStyle = '#2a211c';
  c.beginPath(); c.ellipse(x - 92 + Math.sin(phase * 0.7) * 5, by + 54, 5, 8, 0, 0, Math.PI * 2); c.fill();

  // Body with Holstein patches.
  c.save();
  c.beginPath(); roundRect(c, x - 88, by - 40, 176, 82, 36);
  c.fillStyle = '#f4efe6';
  c.fill();
  c.clip();
  c.fillStyle = '#1f1a17';
  for (const [px, py, rx, ry] of [[-50, -20, 30, 22], [10, 5, 26, 28], [55, -25, 20, 16], [-15, 35, 22, 12]]) {
    c.beginPath(); c.ellipse(x + px, by + py, rx, ry, 0.4, 0, Math.PI * 2); c.fill();
  }
  c.restore();

  // Udder.
  c.fillStyle = '#e7a9a0';
  c.beginPath(); c.ellipse(x - 34, by + 42, 16, 10, 0, 0, Math.PI * 2); c.fill();

  // Head and neck, nodding with the stride.
  const nod = Math.sin(phase * 2) * 2;
  c.fillStyle = '#f4efe6';
  c.beginPath();
  c.moveTo(x + 70, by - 34); c.lineTo(x + 108, by - 34 + nod); c.lineTo(x + 104, by + 2 + nod); c.lineTo(x + 70, by + 10);
  c.fill();
  c.save();
  c.translate(x + 118, by - 22 + nod);
  c.rotate(0.35);
  c.fillStyle = '#1f1a17';
  c.beginPath(); c.ellipse(0, 0, 26, 17, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#f4efe6';
  c.beginPath(); c.ellipse(4, 2, 10, 15, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e7a9a0';
  c.beginPath(); c.ellipse(20, 6, 11, 10, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#1f1a17';
  c.beginPath(); c.ellipse(-16, -14, 10, 5, -0.6, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.arc(-4, -6, 2.6, 0, Math.PI * 2); c.fill();
  c.restore();

  LEGS.forEach((L, i) => !L.far && leg(L, i));
}
