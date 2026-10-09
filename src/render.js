// Scene composition for the trimming view: backdrop, contact shadows, the layered
// hoof material (hoofart.js), strap, block and dressings, guides, HUD and the tool in hand.

import { CFG } from './config.js';
import { Z, CLAW, GEOM, clawPolygon, toeLine } from './hoof.js';
import { toolRadius } from './tools.js';
import { HoofArt } from './hoofart.js';
import { paintScenery, drawStrap, shadowSprite } from './scenery.js';
import {
  drawKnife, drawGrinder, drawBrush, drawNippers, drawRasp, drawTesters, drawSpray,
  drawWrapRoll, drawBlock, drawPad, drawWrap,
} from './toolart.js';

const { w: W, h: H } = CFG.view;
const CLAWS = [CLAW.OUTER, CLAW.INNER];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.k = 1;
    this.art = null;
    this.scenery = null;
    this.shadows = null;
    // Tool-in-hand state driven by the game loop.
    this.fx = { ang: 0.7, spin: 0, grindOn: false, biteT: 0, squeezeT: 0 };
    this.placed = { block: -9, pad: -9, wrap: -9 };
    this.time = 0;
  }

  resize(cssW, cssH, dpr) {
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const k = (cssW * dpr) / W;
    if (!k || !isFinite(k)) return;
    this.k = k;
    // Hoof buffers are sized once: 2× logical, 3× on dense screens.
    this.scenery = paintScenery(k);
    this.shadows = {};
    for (const c of CLAWS) {
      this.shadows[c] = shadowSprite(clawPolygon(c), k);
      this.shadows[c + 2] = shadowSprite(clawPolygon(c, true), k);
    }
  }

  begin(shake = 0) {
    const c = this.ctx;
    c.setTransform(this.k, 0, 0, this.k, 0, 0);
    if (shake > 0) c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }

  update(dt) {
    this.time += dt;
    const f = this.fx;
    if (f.grindOn) f.spin += dt * 30;
    f.biteT = Math.max(0, f.biteT - dt * 5);
    f.squeezeT = Math.max(0, f.squeezeT - dt * 4);
    this.art?.update(dt);
  }

  // A tool moved across the hoof: steer the sprite and record striations.
  stroke(tool, x, y, dx, dy) {
    if (Math.hypot(dx, dy) > 0.5) {
      const d = Math.atan2(dy, dx) - this.fx.ang;
      this.fx.ang += Math.atan2(Math.sin(d), Math.cos(d)) * 0.25;
    }
    this.art?.mark(tool, x, y, dx, dy, toolRadius(tool));
  }

  background() {
    const c = this.ctx;
    c.fillStyle = '#16120f';
    c.fillRect(-20, -20, W + 40, H + 40);
    if (this.scenery) c.drawImage(this.scenery, 0, 0, W, H);
  }

  hoof(hoof, diagnosed, m) {
    const c = this.ctx;
    // Created on first draw: the first resize can fire before layout gives the canvas a size.
    if (!this.art) this.art = new HoofArt(this.k >= 2.6 ? 3 : 2);
    this.art.sync(hoof);
    // Contact shadows give each claw weight against the chute.
    for (const claw of CLAWS) {
      const dead = m ? m.claws[claw].deadRemain : 1;
      if (!this.shadows) break;
      this.shadow(this.shadows[claw], 0.65);
      if (dead > 0.02) this.shadow(this.shadows[claw + 2], 0.65 * dead);
    }
    this.art.draw(c);
    drawStrap(c);

    // Colour-blind-safe lesion marker once it's been diagnosed.
    if (diagnosed && hoof.wrap < 1) {
      const L = hoof.caseDef.lesion;
      c.save();
      c.setLineDash([4, 3]);
      c.strokeStyle = '#ff6b5b';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(L.x, L.y, L.r * 2.1, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.font = 'bold 11px system-ui, sans-serif';
      c.textAlign = 'center';
      label(c, 'ulcer ▼', L.x, L.y - L.r * 2.1 - 4, '#ff6b5b');
      c.restore();
    }
  }

  shadow(sp, alpha) {
    const c = this.ctx;
    c.save();
    c.globalAlpha = alpha;
    c.drawImage(sp.img, sp.x + 4, sp.y + 7, sp.w, sp.h);
    c.restore();
  }

  weep(x, y, amount) { this.art?.weep(x, y, amount); }
  sprayDecal(x, y, r, dt) { this.art?.spray(x, y, r, dt); }

  // Guided run: a pulsing brass outline around where to work, plus a progress arc on rings.
  coach(target, progress, time) {
    if (!target) return;
    const c = this.ctx;
    const pulse = 0.55 + 0.45 * Math.sin(time * 4);
    c.save();
    c.lineWidth = 2.5;
    c.setLineDash([7, 5]);
    c.lineDashOffset = -time * 18;
    c.strokeStyle = `rgba(240,196,110,${0.5 + 0.5 * pulse})`;
    c.shadowColor = 'rgba(0,0,0,0.6)';
    c.shadowBlur = 4;
    const rects = target.kind === 'rects' ? target.list : target.kind === 'rect' ? [target] : [];
    for (const r of rects) {
      c.beginPath();
      roundRect(c, r.x, r.y, r.w, r.h, 16);
      c.stroke();
    }
    if (target.kind === 'ring') {
      c.beginPath();
      c.arc(target.x, target.y, target.r + 3 * pulse, 0, Math.PI * 2);
      c.stroke();
      if (progress > 0) {
        c.setLineDash([]);
        c.lineWidth = 4;
        c.strokeStyle = '#7bbf6a';
        c.beginPath();
        c.arc(target.x, target.y, target.r + 8, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
        c.stroke();
      }
    }
    c.restore();
  }

  guides() {
    const c = this.ctx;
    c.save();
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'center';
    for (const claw of CLAWS) {
      const mirror = claw === CLAW.OUTER ? (x) => W - x : (x) => x;

      // Trim line at the front of the living toe.
      const tl = toeLine(claw);
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(232,190,100,0.95)';
      c.lineWidth = 1.5;
      c.beginPath();
      tl.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();

      // Dish channel along the axial wall.
      c.strokeStyle = 'rgba(120,190,210,0.9)';
      c.beginPath();
      roundRect(c, Math.min(mirror(212), mirror(254)), GEOM.dishY0, 42, GEOM.dishY1 - GEOM.dishY0, 14);
      c.stroke();

      // Toe triangle: no-cut.
      c.setLineDash([2, 3]);
      c.strokeStyle = 'rgba(255,107,91,0.9)';
      path(c, [[209, 480], [242, 480], [242, 558], [222, 581], [211, 540]].map(([x, y]) => [mirror(x), y]));
      c.stroke();

      // Heel line.
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.moveTo(mirror(214), GEOM.heelY); c.lineTo(mirror(345), GEOM.heelY);
      c.stroke();
      c.setLineDash([]);

      label(c, 'trim line', mirror(272), 606, 'rgba(232,190,100,0.95)');
      label(c, 'dish', mirror(233), GEOM.dishY0 - 4, 'rgba(120,190,210,0.95)');
      label(c, 'no-cut', mirror(228), 520, 'rgba(255,107,91,0.95)');
      label(c, 'heel: leave it', mirror(290), GEOM.heelY + 13, 'rgba(255,255,255,0.8)');
    }
    c.restore();
  }

  block(hoof, ghostClaw = 0) {
    const c = this.ctx;
    const press = Math.min(1, (this.time - this.placed.block) / 0.25);
    if (hoof.block) drawBlock(c, hoof.block, clawPolygon(hoof.block), 1, press);
    if (ghostClaw && ghostClaw !== hoof.block) drawBlock(c, ghostClaw, clawPolygon(ghostClaw), 0.4, 1);
  }

  // Pad and pink wrap over the treated claw (plus a ghost pad while aiming).
  dressing(hoof, ghostClaw = 0) {
    const c = this.ctx;
    const L = hoof.caseDef.lesion;
    if (hoof.wrap >= 1) {
      const pts = clawPolygon(hoof.wrapClaw);
      drawPad(c, L, pts, Math.min(1, (this.time - this.placed.pad) / 0.2));
      if (hoof.wrap >= 2) drawWrap(c, pts, 1, Math.min(1, (this.time - this.placed.wrap) / 0.6));
    } else if (ghostClaw === L.claw) {
      drawPad(c, L, clawPolygon(L.claw), 0.35);
    }
  }

  placedNow(what) { this.placed[what] = this.time; }

  labels() {
    const c = this.ctx;
    c.save();
    c.font = 'bold 12px system-ui, sans-serif';
    c.textAlign = 'center';
    label(c, 'OUTER claw', 115, 652, 'rgba(241,231,208,0.9)');
    label(c, 'INNER claw', 285, 652, 'rgba(241,231,208,0.9)');
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
    const f = this.fx;
    c.save();
    // Working-area ring, kept faint: the tool itself carries the feel.
    if (r && tool !== 'grinder') {
      c.strokeStyle = 'rgba(255,255,255,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      c.arc(ptr.x, ptr.y, r, 0, Math.PI * 2);
      c.stroke();
    }
    switch (tool) {
      case 'knife': drawKnife(c, ptr.x, ptr.y, f.ang); break;
      case 'grinder': drawGrinder(c, ptr.x, ptr.y, f.spin, ptr.down, r); break;
      case 'brush': drawBrush(c, ptr.x, ptr.y, 0.5 + Math.sin(f.ang) * 0.2); break;
      case 'nippers': drawNippers(c, ptr.x, ptr.y, 1 - f.biteT); break;
      case 'rasp': drawRasp(c, ptr.x, ptr.y, f.ang); break;
      case 'probe': drawTesters(c, ptr.x, ptr.y, f.squeezeT); break;
      case 'spray': drawSpray(c, ptr.x, ptr.y, ptr.down, time); break;
      case 'wrap': drawWrapRoll(c, ptr.x, ptr.y); break;
      default: break;
    }

    // Thickness readout: the trimmer's gauge.
    if (guides && !['block', 'brush', 'spray', 'wrap'].includes(tool)) {
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

function label(c, text, x, y, color) {
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillText(text, x + 0.8, y + 0.8);
  c.fillStyle = color;
  c.fillText(text, x, y);
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
