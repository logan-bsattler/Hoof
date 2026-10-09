// Canvas rendering for the trimming scene: barn backdrop, the hoof (from the
// simulation grid), guided lines, the block, the balance beam, and cursors.

import { CFG } from './config.js';
import { Z, CLAW, LOOSE, clawPolygon, toeLine } from './hoof.js';
import { toolRadius } from './tools.js';

const { w: W, h: H } = CFG.view;
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Horn colour by remaining sole thickness: pink when thin, cream at target,
// weathered yellow-brown when overgrown.
const HORN = [
  [0, [200, 40, 50]], [1, [214, 120, 120]], [3, [232, 178, 162]],
  [5, [238, 212, 186]], [7, [236, 222, 190]], [8.5, [212, 186, 136]],
  [11, [168, 138, 92]], [15, [132, 106, 72]],
];
function hornColor(t) {
  if (t <= HORN[0][0]) return HORN[0][1];
  for (let k = 1; k < HORN.length; k++) {
    if (t <= HORN[k][0]) {
      const [t0, c0] = HORN[k - 1];
      const [t1, c1] = HORN[k];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return HORN[HORN.length - 1][1];
}

const MUD_A = [70, 50, 32];
const MUD_B = [108, 82, 54];
const DEAD = [118, 96, 66];
const HEEL = [196, 168, 156];
const BRUISE = [92, 58, 46];
const ULCER = [158, 44, 50];
const BLOOD = [190, 14, 26];
const LOOSE_C = [214, 196, 158];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const g = CFG.grid;
    this.grid = document.createElement('canvas');
    this.grid.width = g.cols;
    this.grid.height = g.rows;
    this.gctx = this.grid.getContext('2d');
    this.img = this.gctx.createImageData(g.cols, g.rows);
    this.grain = this.makeGrain();
    this.k = 1;
  }

  makeGrain() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const x = c.getContext('2d');
    const d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
      d.data[i + 3] = 40;
    }
    x.putImageData(d, 0, 0);
    return this.ctx.createPattern(c, 'repeat');
  }

  resize(cssW, cssH, dpr) {
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.k = (cssW * dpr) / W;
  }

  begin(shake = 0) {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    if (shake > 0) c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  background() {
    const c = this.ctx;
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#2a1f17');
    bg.addColorStop(1, '#16100c');
    c.fillStyle = bg;
    c.fillRect(-20, -20, W + 40, H + 40);
    // Barn planks.
    c.strokeStyle = 'rgba(0,0,0,0.25)';
    c.lineWidth = 1;
    for (let x = 0; x < W; x += 50) {
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
    }
    // Work light on the hoof.
    const sp = c.createRadialGradient(200, 400, 30, 200, 400, 330);
    sp.addColorStop(0, 'rgba(255,226,170,0.20)');
    sp.addColorStop(1, 'rgba(255,226,170,0)');
    c.fillStyle = sp;
    c.fillRect(0, 0, W, H);
  }

  // The leg and dewclaws behind the heel bulbs.
  leg() {
    const c = this.ctx;
    c.save();
    c.fillStyle = '#231d1a';
    c.beginPath();
    c.ellipse(200, 690, 190, 130, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = '#e9e4da';
    c.beginPath();
    c.ellipse(285, 668, 60, 34, -0.3, 0, Math.PI * 2);
    c.ellipse(95, 705, 50, 30, 0.4, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#3a2f28';
    for (const x of [150, 250]) {
      c.beginPath();
      c.ellipse(x, 640, 16, 11, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  hoof(hoof, diagnosed) {
    const d = this.img.data;
    const n = hoof.n;
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      const c = hoof.claw[i];
      if (!c) { d[p + 3] = 0; continue; }
      const z = hoof.zone[i];
      const t = hoof.thick[i];
      const nz = hoof.noise[i];
      let col;

      if (z & Z.DEAD) {
        if (t <= 0.05) { d[p + 3] = 0; continue; }
        col = mix(DEAD, [86, 70, 50], 0.5 + nz * 0.5);
      } else if (hoof.blood[i]) {
        col = BLOOD;
      } else if (z & Z.ULCER) {
        col = hoof.loose[i] ? mix(BRUISE, [70, 45, 36], 0.5 + nz * 0.3) : mix(ULCER, [110, 30, 34], 0.4 + nz * 0.4);
      } else if (hoof.loose[i]) {
        col = mix(LOOSE_C, [150, 125, 90], nz > 0.35 ? 0.7 : 0.15);
        if (hoof.looseInit[i] === LOOSE.ULCER) col = mix(col, BRUISE, 0.35);
      } else if (z & Z.HEEL) {
        col = mix(HEEL, hornColor(t), 0.25);
      } else {
        col = hornColor(t);
        if (z & Z.WALL) col = mix(col, [150, 132, 104], 0.45);
        else if (z & Z.WL) col = mix(col, [248, 242, 226], 0.45);
      }
      // Texture + roughness (grinder swirls, weathered surface).
      const shade = 1 + nz * 0.06 - hoof.rough[i] * (0.1 + Math.max(0, nz) * 0.25);
      col = [col[0] * shade, col[1] * shade, col[2] * shade];

      const mud = hoof.mud[i];
      if (mud > 0.01) {
        const mc = mix(MUD_A, MUD_B, 0.5 + nz * 0.5);
        col = mix(col, mc, Math.min(1, mud * 1.15));
      }
      d[p] = col[0]; d[p + 1] = col[1]; d[p + 2] = col[2]; d[p + 3] = 255;
    }
    this.gctx.putImageData(this.img, 0, 0);

    const c = this.ctx;
    const g = CFG.grid;
    c.save();
    c.imageSmoothingEnabled = true;
    c.drawImage(this.grid, g.x0, g.y0, g.cols * g.cell, g.rows * g.cell);

    // Fine grain over the live claws, then a crisp outline.
    for (const claw of [CLAW.OUTER, CLAW.INNER]) {
      const pts = clawPolygon(claw);
      c.save();
      path(c, pts);
      c.clip();
      c.globalCompositeOperation = 'multiply';
      c.fillStyle = this.grain;
      c.fillRect(0, 0, W, H);
      c.restore();
      path(c, pts);
      c.strokeStyle = 'rgba(38,24,14,0.85)';
      c.lineWidth = 2;
      c.stroke();
    }

    // Colour-blind-safe lesion marker once it's been diagnosed.
    if (diagnosed) {
      const L = hoof.caseDef.lesion;
      c.setLineDash([4, 3]);
      c.strokeStyle = '#ff6b5b';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(L.x, L.y, L.r * 1.9, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = '#ff6b5b';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('▲ ulcer', L.x, L.y - L.r * 1.9 - 4);
    }
    c.restore();
  }

  guides(hoof) {
    const c = this.ctx;
    c.save();
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'center';
    for (const claw of [CLAW.OUTER, CLAW.INNER]) {
      const mirror = claw === CLAW.OUTER ? (x) => W - x : (x) => x;

      // Trim line at the front of the living toe.
      const tl = toeLine(claw);
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(232,190,100,0.95)';
      c.lineWidth = 1.5;
      c.beginPath();
      tl.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();

      // Dish channel.
      c.strokeStyle = 'rgba(120,190,210,0.9)';
      c.beginPath();
      roundRect(c, Math.min(mirror(212), mirror(254)), 310, 42, 195, 14);
      c.stroke();

      // Toe triangle: no-cut.
      c.setLineDash([2, 3]);
      c.strokeStyle = 'rgba(255,107,91,0.9)';
      path(c, [[209, 300], [242, 300], [242, 222], [222, 199], [211, 240]].map(([x, y]) => [mirror(x), y]));
      c.stroke();

      // Heel line.
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.beginPath();
      c.moveTo(mirror(214), 522); c.lineTo(mirror(345), 522);
      c.stroke();
      c.setLineDash([]);

      c.fillStyle = 'rgba(232,190,100,0.95)';
      c.fillText('trim line', mirror(270), 192);
      c.fillStyle = 'rgba(120,190,210,0.95)';
      c.fillText('dish', mirror(233), 304);
      c.fillStyle = 'rgba(255,107,91,0.95)';
      c.fillText('no-cut', mirror(226), 262);
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillText('heel: leave it', mirror(290), 517);
    }
    c.restore();
  }

  block(hoof, ghostClaw = 0) {
    const draw = (claw, alpha) => {
      const c = this.ctx;
      const cx = claw === CLAW.OUTER ? W - 282 : 282;
      c.save();
      c.globalAlpha = alpha;
      c.translate(cx, 405);
      c.fillStyle = '#e8e2d0';
      c.beginPath(); roundRect(c, -36, -82, 72, 164, 12); c.fill();
      c.fillStyle = '#a77b4a';
      c.beginPath(); roundRect(c, -32, -78, 64, 156, 10); c.fill();
      c.strokeStyle = 'rgba(80,50,25,0.5)';
      c.lineWidth = 1;
      for (let x = -24; x <= 24; x += 8) {
        c.beginPath(); c.moveTo(x, -74); c.bezierCurveTo(x + 4, -20, x - 4, 20, x + 2, 74); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillText('BLOCK', 0, 4);
      c.restore();
    };
    if (hoof.block) draw(hoof.block, 1);
    if (ghostClaw && ghostClaw !== hoof.block) draw(ghostClaw, 0.35);
  }

  labels() {
    const c = this.ctx;
    c.save();
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = 'rgba(241,231,208,0.8)';
    c.fillText('OUTER claw', 115, 618);
    c.fillText('INNER claw', 285, 618);
    c.restore();
  }

  // Balance beam: tilts toward the taller claw.
  meter(m) {
    const c = this.ctx;
    const T = CFG.sole.target;
    const outer = m.claws[CLAW.OUTER].wbMean;
    const inner = m.claws[CLAW.INNER].wbMean;
    const diff = inner - outer;
    const level = Math.abs(diff) <= 0.6;
    c.save();
    c.fillStyle = 'rgba(20,14,10,0.7)';
    c.beginPath(); roundRect(c, 10, 8, W - 20, 104, 12); c.fill();

    c.translate(200, 74);
    c.fillStyle = '#6b5a45';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-12, 22); c.lineTo(12, 22); c.closePath(); c.fill();
    const ang = Math.max(-0.3, Math.min(0.3, -diff * 0.06));
    c.rotate(ang);
    c.fillStyle = level ? '#7bbf6a' : '#d8a64a';
    c.fillRect(-110, -4, 220, 6);
    c.beginPath(); c.arc(-110, -1, 8, 0, Math.PI * 2); c.arc(110, -1, 8, 0, Math.PI * 2); c.fill();
    c.restore();

    c.save();
    c.font = 'bold 11px system-ui, sans-serif';
    c.fillStyle = '#f1e7d0';
    c.textAlign = 'left';
    c.fillText(`OUTER ${outer.toFixed(1)} mm`, 22, 28);
    c.textAlign = 'right';
    c.fillText(`INNER ${inner.toFixed(1)} mm`, W - 22, 28);
    c.textAlign = 'center';
    c.fillStyle = level ? '#7bbf6a' : '#d8a64a';
    c.fillText(level ? 'LEVEL' : `${Math.abs(diff).toFixed(1)} mm off`, 200, 28);
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = 'rgba(241,231,208,0.6)';
    c.fillText(`target sole ≈ ${T} mm`, 200, 42);
    // Per-claw height gauges against the target band.
    this.gauge(c, 30, 48, outer, m.claws[CLAW.OUTER].deadRemain);
    this.gauge(c, W - 46, 48, inner, m.claws[CLAW.INNER].deadRemain);
    c.restore();
  }

  gauge(c, x, y, v, deadRemain) {
    const h = 56, max = 15;
    const ty = (mm) => y + h - (Math.min(max, mm) / max) * h;
    const { target: T, tolerance: tol } = CFG.sole;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(x, y, 16, h);
    c.fillStyle = 'rgba(123,191,106,0.45)';
    c.fillRect(x, ty(T + tol), 16, ty(T - tol) - ty(T + tol));
    c.fillStyle = v < T - tol ? '#ff6b5b' : Math.abs(v - T) <= tol ? '#7bbf6a' : '#d8a64a';
    c.fillRect(x - 3, ty(v) - 1.5, 22, 3);
    c.font = '9px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillStyle = deadRemain < 0.12 ? '#7bbf6a' : 'rgba(241,231,208,0.6)';
    c.fillText(deadRemain < 0.12 ? 'toe ✓' : 'toe long', x + 8, y + h + 6);
    if (v < T - tol) {
      c.fillStyle = '#ff6b5b';
      c.fillText('too thin', x + 8, y - 3);
    }
  }

  cursor(tool, ptr, hoof, guides, time) {
    if (!ptr.over && !ptr.down) return;
    const c = this.ctx;
    const r = toolRadius(tool);
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 1.2;
    if (tool === 'probe') {
      c.beginPath();
      c.moveTo(ptr.x - 9, ptr.y); c.lineTo(ptr.x + 9, ptr.y);
      c.moveTo(ptr.x, ptr.y - 9); c.lineTo(ptr.x, ptr.y + 9);
      c.stroke();
    } else if (r) {
      c.beginPath();
      c.arc(ptr.x, ptr.y, r, 0, Math.PI * 2);
      c.stroke();
      if (tool === 'grinder' && ptr.down) {
        c.strokeStyle = 'rgba(255,255,255,0.45)';
        for (let a = 0; a < 6; a++) {
          const th = time * 30 + (a * Math.PI) / 3;
          c.beginPath();
          c.moveTo(ptr.x + Math.cos(th) * r * 0.3, ptr.y + Math.sin(th) * r * 0.3);
          c.lineTo(ptr.x + Math.cos(th) * r * 0.9, ptr.y + Math.sin(th) * r * 0.9);
          c.stroke();
        }
      }
    }

    // Thickness readout: the trimmer's gauge.
    if (guides && tool !== 'block' && tool !== 'brush') {
      const i = hoof.cellAt(ptr.x, ptr.y);
      if (i >= 0 && (hoof.zone[i] & Z.LIVE) && !(hoof.zone[i] & Z.ULCER)) {
        const t = hoof.thick[i];
        const tgt = hoof.zoneTarget(i);
        const dirty = hoof.mud[i] > 0.35;
        const txt = dirty ? '— mm' : `${t.toFixed(1)} mm`;
        const col = dirty ? '#999' : t < CFG.sole.thin ? '#ff6b5b' : Math.abs(t - tgt) <= CFG.sole.tolerance ? '#7bbf6a' : t > tgt ? '#d8a64a' : '#f0a090';
        c.font = 'bold 11px system-ui, sans-serif';
        const tw = c.measureText(txt).width + 10;
        const bx = Math.min(W - tw - 4, ptr.x + r + 6);
        const by = ptr.y - r - 18;
        c.fillStyle = 'rgba(20,14,10,0.85)';
        c.beginPath(); roundRect(c, bx, by, tw, 16, 6); c.fill();
        c.fillStyle = col;
        c.textAlign = 'left';
        c.fillText(txt, bx + 5, by + 12);
      }
    }
    c.restore();
  }
}

function path(c, pts) {
  c.beginPath();
  pts.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
}

export function roundRect(c, x, y, w, h, r) {
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
