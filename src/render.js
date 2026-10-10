// Scene composition for the trimming view: backdrop, contact shadows, the layered
// hoof material (hoofart.js), strap, block and dressings, guides, HUD and the tool in hand.

import { CFG, touchAngle } from './config.js';
import { Z, CLAW, GEOM, clawPolygon, toeLine, clawBox, clawSide, clawSpan, dishRect, onClaw } from './hoof.js';
import { toolRadius } from './tools.js';
import { HoofArt } from './hoofart.js';
import { paintScenery, drawStrap, shadowSprite } from './scenery.js';
import {
  drawKnife, drawGrinder, drawBrush, drawNippers, drawRasp, drawTesters, drawSpray,
  drawWrapRoll, drawBlock, drawPad, drawWrap,
} from './toolart.js';

const { w: W, h: H } = CFG.view;
const CLAWS = [CLAW.OUTER, CLAW.INNER];

// Which guides each step shows. Cleaning and the read show none (don't spoil the reveal),
// and neither do the finish and the treatment.
const GUIDE_SETS = {
  step1: ['trim', 'heel', 'tri'],
  step2: ['trim', 'heel', 'tri'],
  step3: ['dish', 'tri'],
  step4: ['tri'],
  step5: ['heel'],
};
const GUIDE_FADE = 0.4; // s

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.k = 1;
    this.cssScale = 1; // CSS px per logical px
    this.art = null;
    this.scenery = null;
    this.shadows = null;
    // Tool-in-hand state driven by the game loop.
    this.fx = { ang: 0.7, spin: 0, grindOn: false, biteT: 0, squeezeT: 0 };
    this.placed = { block: -9, pad: -9, wrap: -9 };
    // Each guide fades toward on/off as the step changes.
    this.guideOn = new Set();
    this.guideAlpha = { trim: 0, heel: 0, tri: 0, dish: 0 };
    this.time = 0;
  }

  resize(cssW, cssH, dpr) {
    // Same size: keep the scenery and shadow buffers (repainting them is the costly part).
    const key = `${cssW}x${cssH}@${dpr}`;
    if (key === this.sizeKey && this.scenery) return;
    this.sizeKey = key;
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    const k = (cssW * dpr) / W;
    if (!k || !isFinite(k)) return;
    this.k = k;
    this.cssScale = cssW / W;
    // Hoof buffers are sized once: 2× logical, 3× on dense screens.
    this.scenery = paintScenery(k);
    this.shadows = {};
  }

  // Contact shadow sprites for one foot layout, made on first use at this scale.
  shadowsFor(side) {
    if (!this.shadows[side]) {
      const sh = this.shadows[side] = {};
      for (const c of CLAWS) {
        sh[c] = shadowSprite(clawPolygon(c, false, side), this.k);
        sh[c + 2] = shadowSprite(clawPolygon(c, true, side), this.k);
      }
    }
    return this.shadows[side];
  }

  // A canvas font at `base` logical px, raised so it never renders under CFG.view.minText CSS px.
  font(base, bold = false) {
    const px = Math.max(base, CFG.view.minText / this.cssScale);
    this.ctx.font = `${bold ? 'bold ' : ''}${px.toFixed(1)}px system-ui, sans-serif`;
    return px;
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
    for (const g in this.guideAlpha) {
      const to = this.guideOn.has(g) ? 1 : 0;
      const a = this.guideAlpha[g];
      this.guideAlpha[g] = to > a ? Math.min(to, a + dt / GUIDE_FADE) : Math.max(to, a - dt / GUIDE_FADE);
    }
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
    const shadows = this.shadows && this.shadowsFor(hoof.side);
    for (const claw of CLAWS) {
      const dead = m ? m.claws[claw].deadRemain : 1;
      if (!shadows) break;
      this.shadow(shadows[claw], 0.65);
      if (dead > 0.02) this.shadow(shadows[claw + 2], 0.65 * dead);
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
      const fs = this.font(11, true);
      c.textAlign = 'center';
      label(c, 'ulcer ▼', L.x, L.y - L.r * 2.1 - 6, '#ff6b5b', fs);
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

  // Choose the guides for the current step (an id from STEPS, or null when all are done).
  setGuides(stepId) { this.guideOn = new Set(GUIDE_SETS[stepId] ?? []); }

  guides(hoof) {
    const c = this.ctx;
    const side = hoof.side;
    const A = this.guideAlpha;
    if (!(A.trim || A.heel || A.tri || A.dish)) return;
    c.save();
    const fs = this.font(10);
    c.textAlign = 'center';
    for (const claw of CLAWS) {
      const s = clawSide(claw, side), box = clawBox(claw, side);
      const ax = onClaw(claw, side); // an x on the right-hand claw, moved onto this claw

      // Trim line at the front of the living toe.
      const tl = toeLine(claw, side);
      c.globalAlpha = A.trim;
      c.setLineDash([5, 4]);
      c.strokeStyle = 'rgba(232,190,100,0.95)';
      c.lineWidth = 1.5;
      c.beginPath();
      tl.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.stroke();

      // Dish channel along the axial wall.
      c.globalAlpha = A.dish;
      c.strokeStyle = 'rgba(120,190,210,0.9)';
      c.beginPath();
      const dr = dishRect(claw, side);
      roundRect(c, dr.x, dr.y, dr.w, dr.h, 14);
      c.stroke();

      // Toe triangle: no-cut. The Z.TRI band, clipped to the claw: a light wash plus its two
      // open edges (the claw's own outline closes it).
      const triX = GEOM.midX + s * (8 + GEOM.triW);
      c.save();
      c.globalAlpha = A.tri;
      path(c, clawPolygon(claw, false, side));
      c.clip();
      c.fillStyle = 'rgba(255,107,91,0.1)';
      c.fillRect(Math.min(GEOM.midX, triX), GEOM.triY, Math.abs(triX - GEOM.midX), H - GEOM.triY);
      c.setLineDash([2, 3]);
      c.strokeStyle = 'rgba(255,107,91,0.9)';
      c.beginPath();
      c.moveTo(GEOM.midX, GEOM.triY); c.lineTo(triX, GEOM.triY); c.lineTo(triX, H);
      c.stroke();
      c.restore();

      // Heel line, across the claw.
      const heel = clawSpan(claw, GEOM.heelY, side);
      c.globalAlpha = A.heel;
      c.setLineDash([2, 3]);
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.moveTo(heel[0] + 4, GEOM.heelY); c.lineTo(heel[1] - 4, GEOM.heelY);
      c.stroke();
      c.setLineDash([]);

      c.globalAlpha = A.trim;
      label(c, 'trim line', box.cx, box.y + box.h + 21, 'rgba(232,190,100,0.95)', fs);
      c.globalAlpha = A.dish;
      label(c, 'dish', dr.x + dr.w / 2, GEOM.dishY0 - 6, 'rgba(120,190,210,0.95)', fs);
      c.globalAlpha = A.tri;
      label(c, 'no-cut', ax(228), 520, 'rgba(255,107,91,0.95)', fs);
      c.globalAlpha = A.heel;
      label(c, 'heel: leave it', (heel[0] + heel[1]) / 2 + s * 10, GEOM.heelY + fs + 6, 'rgba(255,255,255,0.85)', fs);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  block(hoof, ghostClaw = 0) {
    const c = this.ctx;
    const press = Math.min(1, (this.time - this.placed.block) / 0.25);
    if (hoof.block) drawBlock(c, hoof.block, clawPolygon(hoof.block, false, hoof.side), 1, press);
    if (ghostClaw && ghostClaw !== hoof.block) drawBlock(c, ghostClaw, clawPolygon(ghostClaw, false, hoof.side), 0.4, 1);
  }

  // Pad and pink wrap over the treated claw (plus a ghost pad while aiming).
  dressing(hoof, ghostClaw = 0) {
    const c = this.ctx;
    const L = hoof.caseDef.lesion;
    if (hoof.wrap >= 1) {
      const pts = clawPolygon(hoof.wrapClaw, false, hoof.side);
      drawPad(c, L, pts, Math.min(1, (this.time - this.placed.pad) / 0.2));
      if (hoof.wrap >= 2) drawWrap(c, pts, 1, Math.min(1, (this.time - this.placed.wrap) / 0.6));
    } else if (ghostClaw === L.claw) {
      drawPad(c, L, clawPolygon(L.claw, false, hoof.side), 0.35);
    }
  }

  placedNow(what) { this.placed[what] = this.time; }

  labels(hoof) {
    const c = this.ctx;
    c.save();
    const fs = this.font(12, true);
    c.textAlign = 'center';
    for (const claw of CLAWS) {
      label(c, `${claw === CLAW.OUTER ? 'OUTER' : 'INNER'} claw`, clawBox(claw, hoof.side).cx, 652, 'rgba(241,231,208,0.9)', fs);
    }
    c.restore();
  }

  // Balance beam: tilts toward the taller claw. Each claw's readout sits on its own side.
  // Until the foot is clean the beam sits neutral and shows no figures: the muck hides the read.
  meter(m, side = 'LH', clean = true) {
    const c = this.ctx;
    const T = CFG.sole.target;
    const [lc, rc] = clawSide(CLAW.OUTER, side) < 0 ? [CLAW.OUTER, CLAW.INNER] : [CLAW.INNER, CLAW.OUTER];
    const name = (k) => (k === CLAW.OUTER ? 'OUTER' : 'INNER');
    const left = m.claws[lc].wbMean, right = m.claws[rc].wbMean;
    const diff = clean ? right - left : 0;
    const level = clean && Math.abs(diff) <= 0.6;
    c.save();
    // Near-opaque, so the strap and the chute read as passing under the HUD.
    c.fillStyle = 'rgba(20,14,10,0.92)';
    c.beginPath(); roundRect(c, 10, 8, W - 20, 104, 12); c.fill();

    c.translate(200, 74);
    c.fillStyle = '#6b5a45';
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-12, 22); c.lineTo(12, 22); c.closePath(); c.fill();
    const ang = Math.max(-0.3, Math.min(0.3, -diff * 0.06));
    c.rotate(ang);
    c.fillStyle = !clean ? '#8a7a64' : level ? '#7bbf6a' : '#d8a64a';
    c.fillRect(-110, -4, 220, 6);
    c.beginPath(); c.arc(-110, -1, 8, 0, Math.PI * 2); c.arc(110, -1, 8, 0, Math.PI * 2); c.fill();
    c.restore();

    c.save();
    // Corners stack name over mm: on a phone the min-text floor makes one line run into the centre.
    const fb = this.font(11, true);
    c.fillStyle = '#f1e7d0';
    const mm = (v) => (clean ? `${v.toFixed(1)} mm` : '— mm');
    c.textAlign = 'left';
    c.fillText(name(lc), 22, 28);
    c.fillText(mm(left), 22, 28 + fb);
    c.textAlign = 'right';
    c.fillText(name(rc), W - 22, 28);
    c.fillText(mm(right), W - 22, 28 + fb);
    c.textAlign = 'center';
    c.fillStyle = !clean ? 'rgba(241,231,208,0.6)' : level ? '#7bbf6a' : '#d8a64a';
    c.fillText(!clean ? 'clean to read' : level ? 'LEVEL' : `${Math.abs(diff).toFixed(1)} mm off`, 200, 28);
    const fs = this.font(10);
    c.fillStyle = 'rgba(241,231,208,0.7)';
    c.fillText(`target sole ≈ ${T} mm`, 200, 30 + fs);
    // Per-claw height gauges against the target band.
    const gy = Math.max(46, 34 + fb);
    this.gauge(c, 30, gy, clean ? left : null, m.claws[lc].deadRemain);
    this.gauge(c, W - 46, gy, clean ? right : null, m.claws[rc].deadRemain);
    c.restore();
  }

  gauge(c, x, y, v, deadRemain) {
    const h = 46, max = 15;
    const ty = (mm) => y + h - (Math.min(max, mm) / max) * h;
    const { target: T, tolerance: tol } = CFG.sole;
    c.fillStyle = 'rgba(255,255,255,0.08)';
    c.fillRect(x, y, 16, h);
    c.fillStyle = 'rgba(123,191,106,0.45)';
    c.fillRect(x, ty(T + tol), 16, ty(T - tol) - ty(T + tol));
    if (v === null) return; // not read yet
    c.fillStyle = v < T - tol ? '#ff6b5b' : Math.abs(v - T) <= tol ? '#7bbf6a' : '#d8a64a';
    c.fillRect(x - 3, ty(v) - 1.5, 22, 3);
    const fs = this.font(9);
    c.textAlign = 'center';
    c.fillStyle = deadRemain < 0.12 ? '#7bbf6a' : 'rgba(241,231,208,0.6)';
    c.fillText(deadRemain < 0.12 ? 'toe ✓' : 'toe long', x + 8, y + h + fs * 0.95);
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
    // On touch the finger is on the handle: every tool points from its tip back to the finger.
    const g = ptr.touch ? touchAngle() : null;
    const gx = Math.cos(touchAngle()) * CFG.touch.grip, gy = Math.sin(touchAngle()) * CFG.touch.grip;
    switch (tool) {
      case 'knife': drawKnife(c, ptr.x, ptr.y, g ?? f.ang); break;
      case 'grinder': drawGrinder(c, ptr.x, ptr.y, f.spin, ptr.down, r, g ?? undefined); break;
      case 'brush': drawBrush(c, ptr.x, ptr.y, g ?? 0.5 + Math.sin(f.ang) * 0.2); break;
      case 'nippers': drawNippers(c, ptr.x, ptr.y, 1 - f.biteT, g ?? undefined); break;
      case 'rasp': drawRasp(c, ptr.x, ptr.y, g ?? f.ang); break;
      case 'probe': drawTesters(c, ptr.x, ptr.y, f.squeezeT, g ?? undefined); break;
      case 'spray': g === null ? drawSpray(c, ptr.x, ptr.y, ptr.down, time)
        : drawSpray(c, ptr.x, ptr.y, ptr.down, time, ptr.x + gx * 1.15, ptr.y + gy * 1.15); break;
      case 'wrap': g === null ? drawWrapRoll(c, ptr.x, ptr.y) : drawWrapRoll(c, ptr.x, ptr.y, gx - 11 * Math.sign(gx), gy); break;
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
        const fs = this.font(11, true);
        const tw = c.measureText(txt).width + 10;
        const flip = ptr.touch && CFG.touch.leftHanded; // keep the gauge away from the finger
        const bx = flip ? Math.max(4, ptr.x - r - 6 - tw) : Math.min(W - tw - 4, ptr.x + r + 6);
        const bh = fs + 5;
        const by = ptr.y - r - bh - 2;
        c.fillStyle = 'rgba(20,14,10,0.85)';
        c.beginPath(); roundRect(c, bx, by, tw, bh, 6); c.fill();
        c.fillStyle = col;
        c.textAlign = 'left';
        c.fillText(txt, bx + 5, by + fs * 0.85 + 2);
      }
    }
    c.restore();
  }
}

// Centred text on a small dark pill, so it reads over the busy horn texture.
// Inherits the caller's globalAlpha (guides fade in and out).
function label(c, text, x, y, color, fs) {
  const w = c.measureText(text).width + fs * 0.7;
  const h = fs * 1.35;
  const a = c.globalAlpha;
  c.globalAlpha = a * 0.75;
  c.fillStyle = '#140e0a';
  c.beginPath(); roundRect(c, x - w / 2, y - fs * 0.95, w, h, Math.min(6, h / 2)); c.fill();
  c.globalAlpha = a;
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
