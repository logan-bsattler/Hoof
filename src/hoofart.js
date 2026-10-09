// Full-resolution layered material renderer for the hoof.
//
// The simulation grid stays coarse (4 px cells) for scoring. This module keeps its own
// buffers at S× the logical resolution and composes every pixel from the top down:
//   manure + straw → stained outer horn → ivory sole (growth lines, tool striations)
//   → bruise → lesion cap / wet cavity → blood
// Coarse fields are sampled bilinearly and thresholded against fine static noise, so
// material edges come out crisp and organic instead of blurry. Only the region that
// changed since the last frame is recomposed.
//
// All art is procedural: nothing here is traced from reference footage.

import { CFG } from './config.js';
import { Z, CLAW, GEOM, clawPolygon } from './hoof.js';
import { mulberry32, valueNoise, fbm, smoothstep } from './noise.js';

export const MARK = { NONE: 0, GRINDER: 1, KNIFE: 2, RASP: 3 };
const MARK_OF = { grinder: MARK.GRINDER, knife: MARK.KNIFE, rasp: MARK.RASP };

// Key light from the upper left (the work lamp), viewer straight on.
const LIGHT = norm3(-0.45, -0.65, 0.62);
const HALF = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const DOME_R = 30;   // logical px over which a claw rolls off from flat sole to rim
const DOME_H = 13;   // how convex the claw reads

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// Sole colour by remaining thickness (mm). Ground horn is near-white ivory; it warms
// to cream when overgrown and goes translucent pink as the corium shows through.
const SOLE_RAMP = [
  [0, [196, 52, 58]], [1, [214, 122, 124]], [2.5, [234, 178, 168]], [3.5, [242, 210, 198]],
  [5, [246, 234, 222]], [7, [245, 239, 224]], [9, [238, 225, 194]], [12, [226, 204, 156]],
  [16, [210, 182, 124]],
];
const RAMP_N = 256, RAMP_MAX = 16;
const RAMP = (() => {
  const lut = new Uint8ClampedArray(RAMP_N * 3);
  for (let k = 0; k < RAMP_N; k++) {
    const t = (k / (RAMP_N - 1)) * RAMP_MAX;
    let j = 1;
    while (j < SOLE_RAMP.length - 1 && t > SOLE_RAMP[j][0]) j++;
    const [t0, c0] = SOLE_RAMP[j - 1], [t1, c1] = SOLE_RAMP[j];
    const u = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
    for (let ch = 0; ch < 3; ch++) lut[k * 3 + ch] = c0[ch] + (c1[ch] - c0[ch]) * u;
  }
  return lut;
})();

const ANG_N = 256;
const COS = new Float32Array(ANG_N), SIN = new Float32Array(ANG_N);
for (let a = 0; a < ANG_N; a++) {
  COS[a] = Math.cos((a / ANG_N) * Math.PI);
  SIN[a] = Math.sin((a / ANG_N) * Math.PI);
}

export class HoofArt {
  constructor(S = 2) {
    const g = CFG.grid;
    this.S = S;
    this.X0 = g.x0; this.Y0 = g.y0;
    this.LW = g.cols * g.cell; this.LH = g.rows * g.cell;
    this.w = Math.round(this.LW * S);
    this.h = Math.round(this.LH * S);
    this.canvas = makeCanvas(this.w, this.h);
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(this.w, this.h);
    this.overlay = makeCanvas(this.w, this.h);    // fluid and spray decals
    this.octx = this.overlay.getContext('2d');
    this.octx.setTransform(S, 0, 0, S, -this.X0 * S, -this.Y0 * S);
    this.mask = null;
    this.built = false;
    this.hoof = null;
    this.drips = [];
    this.bubbles = [];
    this.fadeT = 0;
    this.decalsDirty = false;
    this.dirty = null;
  }

  // ------------------------------------------------------------ static build

  build(hoof) {
    const { S, w, h, X0, Y0 } = this;
    const n = w * h;
    const g = CFG.grid;

    // Cell class: 1/2 live outer/inner, 3/4 overgrown (dead) outer/inner.
    const cc = new Uint8Array(hoof.n);
    for (let i = 0; i < hoof.n; i++) {
      const c = hoof.claw[i];
      cc[i] = c ? c + (hoof.zone[i] & Z.DEAD ? 2 : 0) : 0;
    }
    this.cellCls = cc;

    const polys = {
      1: clawPolygon(CLAW.OUTER), 2: clawPolygon(CLAW.INNER),
      3: clawPolygon(CLAW.OUTER, true), 4: clawPolygon(CLAW.INNER, true),
    };
    this.polys = polys;
    const cls = new Uint8Array(n);
    for (const c of [1, 2, 3, 4]) fillPoly(cls, w, h, S, X0, Y0, polys[c], c);
    this.cls = cls;

    // Distance to the outline and the inward direction, per pixel.
    const edge = new Float32Array(n);
    const shade = new Uint8Array(n), domeSpec = new Uint8Array(n);
    const dnx = new Float32Array(n), dny = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const c = cls[p];
      if (!c) continue;
      const lx = X0 + ((p % w) + 0.5) / S, ly = Y0 + (Math.floor(p / w) + 0.5) / S;
      const pts = polys[c];
      let best = Infinity, bx = 0, by = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [qx, qy] = pts[i];
        const ex = qx - ax, ey = qy - ay;
        const t = Math.max(0, Math.min(1, ((lx - ax) * ex + (ly - ay) * ey) / (ex * ex + ey * ey)));
        const cx = ax + t * ex, cy = ay + t * ey;
        const d = (lx - cx) ** 2 + (ly - cy) ** 2;
        if (d < best) { best = d; bx = cx; by = cy; }
      }
      const d = Math.sqrt(best);
      edge[p] = d;
      const ix = d > 1e-4 ? (lx - bx) / d : 0, iy = d > 1e-4 ? (ly - by) / d : 0;
      // Dome profile: height rises from the rim and flattens over the sole.
      const e = Math.min(1, d / DOME_R);
      const slope = (2 * DOME_H * (1 - e)) / DOME_R;
      const N = norm3(-slope * ix, -slope * iy, 1);
      dnx[p] = N[0]; dny[p] = N[1];
      const diff = N[0] * LIGHT[0] + N[1] * LIGHT[1] + N[2] * LIGHT[2];
      const sh = Math.max(0.28, Math.min(1.12, 0.2 + (0.8 * diff) / LIGHT[2]));
      shade[p] = Math.round(sh * 200);
      const nh = Math.max(0, N[0] * HALF[0] + N[1] * HALF[1] + N[2] * HALF[2]);
      domeSpec[p] = Math.round(255 * nh ** 36);
    }
    this.edge = edge; this.shade = shade; this.domeSpec = domeSpec;

    // Static noise fields (logical-space frequencies, so they scale with S).
    const rand = mulberry32(9137);
    const N1 = valueNoise(rand), N2 = valueNoise(rand), N3 = valueNoise(rand);
    const N4 = valueNoise(rand), N5 = valueNoise(rand), N6 = valueNoise(rand);
    const nMudThr = new Uint8Array(n), nStain = new Uint8Array(n), nCav = new Uint8Array(n);
    const nGrain = new Uint8Array(n), nStreak = new Uint8Array(n), nIsle = new Uint8Array(n);
    const lump = new Float32Array(n), wet = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      const lx = X0 + ((p % w) + 0.5) / S, ly = Y0 + (Math.floor(p / w) + 0.5) / S;
      // Manure clings thickest toward the heel and in the interdigital gap.
      const heelness = smoothstep(300, 195, ly);
      const gapness = smoothstep(26, 6, Math.abs(lx - GEOM.midX) - 7);
      const thr = 0.1 + 0.8 * fbm(N1, lx / 13, ly / 13, 4) - 0.16 * (heelness + gapness);
      nMudThr[p] = clamp255(thr * 255);
      nStain[p] = clamp255(fbm(N2, lx / 21, ly / 21, 4) * 255);
      nIsle[p] = clamp255(fbm(N6, lx / 15, ly / 26, 3) * 255);
      nCav[p] = clamp255(fbm(N3, lx / 4.5, ly / 4.5, 3) * 255);
      nGrain[p] = clamp255((N4(lx * 1.3, ly * 1.3) * 0.55 + rand() * 0.45) * 255);
      nStreak[p] = clamp255(fbm(N5, lx / 1.4, ly / 10, 3) * 255);
      lump[p] = fbm(N5, lx / 2.4 + 91, ly / 2.4, 3);
      wet[p] = fbm(N3, lx / 3.2 + 40, ly / 3.2, 2);
    }
    // Wet specular from micro-normals (pixel gradients) on top of the dome normal.
    const mudSpec = new Uint8Array(n), wetSpec = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const pl = x > 0 ? p - 1 : p, pr = x < w - 1 ? p + 1 : p;
      const pu = y > 0 ? p - w : p, pd = y < h - 1 ? p + w : p;
      mudSpec[p] = specFrom(dnx[p], dny[p], (lump[pr] - lump[pl]) * S * 6, (lump[pd] - lump[pu]) * S * 6, 30);
      wetSpec[p] = specFrom(dnx[p], dny[p], (wet[pr] - wet[pl]) * S * 4, (wet[pd] - wet[pu]) * S * 4, 60);
    }
    const nLump = new Uint8Array(n);
    for (let p = 0; p < n; p++) nLump[p] = clamp255(lump[p] * 255);
    Object.assign(this, { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, nLump, mudSpec, wetSpec });

    // Straw and fibre strands embedded in the manure.
    this.straw = paintStraw(this, mulberry32(4411));

    // Groove pattern for tool striations: mostly fine lines, the odd deeper score.
    const r2 = mulberry32(77);
    this.hash = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) {
      const v = r2();
      this.hash[k] = v < 0.1 ? -1 : (v - 0.5) * 0.7;
    }

    // Bilinear neighbours: fallback cell for pixels with no same-class neighbour.
    this.fallback = new Int32Array(n).fill(-1);
    for (let p = 0; p < n; p++) {
      const c = cls[p];
      if (!c) continue;
      const lx = X0 + ((p % w) + 0.5) / S, ly = Y0 + (Math.floor(p / w) + 0.5) / S;
      const fx = (lx - g.x0) / g.cell - 0.5, fy = (ly - g.y0) / g.cell - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy);
      let ok = false;
      for (let k = 0; k < 4 && !ok; k++) {
        const cx = ix + (k & 1), cy = iy + (k >> 1);
        if (cx >= 0 && cy >= 0 && cx < g.cols && cy < g.rows && cc[cy * g.cols + cx] === c) ok = true;
      }
      if (ok) continue;
      let bestD = Infinity;
      for (let cy = iy - 3; cy <= iy + 4; cy++) {
        for (let cx = ix - 3; cx <= ix + 4; cx++) {
          if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows || cc[cy * g.cols + cx] !== c) continue;
          const d = (cx - fx) ** 2 + (cy - fy) ** 2;
          if (d < bestD) { bestD = d; this.fallback[p] = cy * g.cols + cx; }
        }
      }
    }

    // Claw silhouette mask, used to keep decals on the horn.
    this.mask = makeCanvas(w, h);
    const mctx = this.mask.getContext('2d');
    const md = mctx.createImageData(w, h);
    for (let p = 0; p < n; p++) if (cls[p]) md.data[p * 4 + 3] = 255;
    mctx.putImageData(md, 0, 0);

    this.markT = new Uint8Array(n);
    this.markA = new Uint8Array(n);
    this.built = true;
  }

  // ------------------------------------------------------------- per frame

  // Bring the buffers in line with the simulation; recompose what changed.
  sync(hoof) {
    if (!this.built) this.build(hoof);
    if (hoof !== this.hoof) {
      this.hoof = hoof;
      this.snap = {
        thick: Float32Array.from(hoof.thick), mud: Float32Array.from(hoof.mud),
        rough: Float32Array.from(hoof.rough), loose: Uint8Array.from(hoof.loose),
        blood: Uint8Array.from(hoof.blood), tint: Float32Array.from(hoof.tint),
      };
      this.looseF = new Float32Array(hoof.n);
      this.bloodF = new Float32Array(hoof.n);
      for (let i = 0; i < hoof.n; i++) { this.looseF[i] = hoof.loose[i] ? 1 : 0; this.bloodF[i] = hoof.blood[i]; }
      this.markT.fill(0);
      this.octx.save();
      this.octx.setTransform(1, 0, 0, 1, 0, 0);
      this.octx.clearRect(0, 0, this.w, this.h);
      this.octx.restore();
      this.drips = [];
      this.bubbles = [];
      this.dirty = null;
      this.compose(0, 0, this.w, this.h);
      return;
    }
    const g = CFG.grid, sn = this.snap;
    let c0 = Infinity, c1 = -1, r0 = Infinity, r1 = -1;
    for (let i = 0; i < hoof.n; i++) {
      if (!hoof.claw[i]) continue;
      if (hoof.thick[i] !== sn.thick[i] || hoof.mud[i] !== sn.mud[i] || hoof.rough[i] !== sn.rough[i] ||
          hoof.loose[i] !== sn.loose[i] || hoof.blood[i] !== sn.blood[i] || hoof.tint[i] !== sn.tint[i]) {
        sn.thick[i] = hoof.thick[i]; sn.mud[i] = hoof.mud[i]; sn.rough[i] = hoof.rough[i];
        sn.loose[i] = hoof.loose[i]; sn.blood[i] = hoof.blood[i]; sn.tint[i] = hoof.tint[i];
        this.looseF[i] = hoof.loose[i] ? 1 : 0;
        this.bloodF[i] = hoof.blood[i];
        const cx = i % g.cols, cy = (i / g.cols) | 0;
        if (cx < c0) c0 = cx;
        if (cx > c1) c1 = cx;
        if (cy < r0) r0 = cy;
        if (cy > r1) r1 = cy;
      }
    }
    if (c1 >= 0) {
      // A changed cell influences pixels up to one cell away (bilinear footprint),
      // plus the lesion's offset shadow sample.
      const S = this.S, k = g.cell * S;
      this.addDirty((c0 - 2) * k, (r0 - 2) * k, (c1 + 3) * k, (r1 + 3) * k);
    }
    if (this.dirty) {
      const [x0, y0, x1, y1] = this.dirty;
      this.dirty = null;
      this.compose(x0, y0, x1, y1);
    }
  }

  addDirty(x0, y0, x1, y1) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(this.w, Math.ceil(x1)); y1 = Math.min(this.h, Math.ceil(y1));
    if (x1 <= x0 || y1 <= y0) return;
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1];
  }

  // Record tool marks: striations run along the direction of travel.
  mark(tool, x, y, dx, dy, r) {
    const type = MARK_OF[tool];
    if (!type || !this.built) return;
    const { S, w, h, X0, Y0, cls } = this;
    const moving = Math.hypot(dx, dy) > 0.2;
    // Store the stripe normal (direction of travel + 90°) over [0, π).
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    a = ((a % Math.PI) + Math.PI) % Math.PI;
    const qa = Math.min(ANG_N - 1, Math.round((a / Math.PI) * ANG_N) % ANG_N);
    const cx = (x - X0) * S, cy = (y - Y0) * S, R = r * S * 0.92;
    const x0 = Math.max(0, Math.floor(cx - R)), x1 = Math.min(w - 1, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.min(h - 1, Math.ceil(cy + R));
    const hoof = this.hoof;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const p = py * w + px;
        const c = cls[p];
        if (!c || c > 2) continue;
        if ((px - cx) ** 2 + (py - cy) ** 2 > R * R) continue;
        if (hoof && ((hoof.block === c) || (hoof.wrap && hoof.wrapClaw === c))) continue;
        this.markT[p] = type;
        if (moving || type !== MARK.GRINDER) this.markA[p] = qa;
      }
    }
    this.addDirty(x0, y0, x1 + 1, y1 + 1);
  }

  // ----------------------------------------------------------------- compose

  compose(x0, y0, x1, y1) {
    const hoof = this.hoof;
    const { S, w, X0, Y0, cls, edge, shade, domeSpec, cellCls, fallback } = this;
    const { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, nLump, mudSpec, wetSpec, straw, hash, markT, markA } = this;
    const g = CFG.grid, cols = g.cols, rows = g.rows, cell = g.cell;
    const d = this.img.data;
    const { thick, init, mud, rough, tint } = hoof;
    const looseF = this.looseF, bloodF = this.bloodF;
    const L = hoof.caseDef.lesion, LH = hoof.caseDef.looseHorn;
    const lesionC = L.claw, heelC = LH.claw;
    const heelY = GEOM.heelY;

    let i0 = 0, i1 = 0, i2 = 0, i3 = 0, w0 = 0, w1 = 0, w2 = 0, w3 = 0;
    const sm = (a) => a[i0] * w0 + a[i1] * w1 + a[i2] * w2 + a[i3] * w3;
    // Plain bilinear sample of looseF at a logical point (for the cavity's inner shadow).
    const looseAt = (lx, ly) => {
      const fx = (lx - g.x0) / cell - 0.5, fy = (ly - g.y0) / cell - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      if (ix < 0 || iy < 0 || ix >= cols - 1 || iy >= rows - 1) return 0;
      const j = iy * cols + ix;
      return (looseF[j] * (1 - tx) + looseF[j + 1] * tx) * (1 - ty) + (looseF[j + cols] * (1 - tx) + looseF[j + cols + 1] * tx) * ty;
    };

    for (let py = y0; py < y1; py++) {
      const ly = Y0 + (py + 0.5) / S;
      const fy = (ly - g.y0) / cell - 0.5;
      const iy = Math.floor(fy), ty = fy - iy;
      for (let px = x0; px < x1; px++) {
        const p = py * w + px, o = p * 4;
        const c = cls[p];
        if (!c) { d[o + 3] = 0; continue; }
        const lx = X0 + (px + 0.5) / S;
        const fx = (lx - g.x0) / cell - 0.5;
        const ix = Math.floor(fx), tx = fx - ix;

        // Bilinear weights over neighbouring cells of the same class.
        const b = iy * cols + ix;
        i0 = b; i1 = b + 1; i2 = b + cols; i3 = b + cols + 1;
        const okx0 = ix >= 0, okx1 = ix + 1 < cols, oky0 = iy >= 0, oky1 = iy + 1 < rows;
        w0 = okx0 && oky0 && cellCls[i0] === c ? (1 - tx) * (1 - ty) : 0;
        w1 = okx1 && oky0 && cellCls[i1] === c ? tx * (1 - ty) : 0;
        w2 = okx0 && oky1 && cellCls[i2] === c ? (1 - tx) * ty : 0;
        w3 = okx1 && oky1 && cellCls[i3] === c ? tx * ty : 0;
        const ws = w0 + w1 + w2 + w3;
        if (ws > 0) {
          const k = 1 / ws;
          w0 *= k; w1 *= k; w2 *= k; w3 *= k;
          if (!w0) i0 = 0;
          if (!w1) i1 = 0;
          if (!w2) i2 = 0;
          if (!w3) i3 = 0;
        } else {
          const f = fallback[p];
          if (f < 0) { d[o + 3] = 0; continue; }
          i0 = i1 = i2 = i3 = f; w0 = 1; w1 = w2 = w3 = 0;
        }

        const t = sm(thick), m = sm(mud);
        const e = edge[p];
        const ns = nStain[p] / 255, ncv = nCav[p] / 255, ngr = nGrain[p] / 255;
        const wallW = 4.2 + 2.6 * ns;
        let R, G, B, spec = 0, wetness = 0;

        if (c >= 3) {
          // Overgrown dead toe horn: stained, layered, and gone once nipped.
          if (t + (ngr - 0.5) * 1.6 < 1.3) { d[o + 3] = 0; continue; }
          const layer = 0.5 + 0.5 * Math.sin(e * 1.15 + ns * 9);
          R = 104 - 30 * layer + 20 * ngr; G = 86 - 24 * layer + 14 * ngr; B = 52 - 14 * layer + 8 * ngr;
          if (e < wallW) { R *= 0.72; G *= 0.72; B *= 0.7; }
        } else {
          const ti = sm(init), r = sm(rough);
          const removed = ti - t;
          const onLesion = c === lesionC;
          const dL = onLesion ? Math.hypot(lx - L.x, ly - L.y) : 1e9;

          // 1. Ivory sole, coloured by thickness.
          const rk = Math.max(0, Math.min(RAMP_N - 1, Math.round((t / RAMP_MAX) * (RAMP_N - 1)))) * 3;
          R = RAMP[rk]; G = RAMP[rk + 1]; B = RAMP[rk + 2];
          // Heel bulb horn is softer and yellower.
          const heel = smoothstep(heelY + 8, heelY - 12, ly + (ns - 0.5) * 18);
          if (heel > 0) { R += (222 - R) * heel; G += (194 - G) * heel; B += (138 - B) * heel; }
          // Growth lines follow the outline; fine grain everywhere.
          const gl = 1 - 0.035 * Math.sin(e * 1.3 + ns * 10) + (ngr - 0.5) * 0.07;
          R *= gl; G *= gl; B *= gl;

          // Directional striations left by the tools.
          const mt = markT[p];
          if (mt) {
            const qa = markA[p];
            const s = px * COS[qa] + py * SIN[qa];
            let v;
            if (mt === MARK.GRINDER) v = hash[Math.floor(s * 0.8) & 1023] * (0.05 + 0.55 * r);
            else if (mt === MARK.RASP) {
              const s2 = px * SIN[qa] - py * COS[qa];
              v = (hash[Math.floor(s * 1.2) & 1023] + hash[(Math.floor(s2 * 1.2) + 512) & 1023]) * (0.03 + 0.3 * r);
            } else {
              // Knife: broad, smooth scallops with a faint sheen.
              v = Math.sin(s * 0.07 / S * 6.283) * 0.035 + hash[Math.floor(s * 0.35) & 1023] * 0.02;
              spec += 18 * Math.max(0, Math.sin(s * 0.07 / S * 6.283 + 1));
            }
            const k = 1 + v;
            R *= k; G *= k; B *= k;
          }

          // 2. Bruise streaks around the ulcer, running toward the toe.
          if (dL < L.r * 4.2) {
            const fall = (1 - dL / (L.r * 4.2)) * (ly > L.y - L.r * 0.5 ? 1 : 0.45);
            const br = smoothstep(0.5, 0.78, nStreak[p] / 255) * fall * 0.8;
            R += (222 - R) * br; G += (112 - G) * br; B += (124 - B) * br;
          }

          // Lesion cap: a small dark hole in the horn over the ulcer.
          let lf = 0;
          if (dL < L.r * 2) {
            lf = sm(looseF);
            const holeR = 2.1 + ncv * 1.1;
            if (dL < holeR * 2.4) {
              const halo = smoothstep(holeR * 2.4, holeR, dL) * 0.35;
              R *= 1 - halo; G *= 1 - halo * 1.05; B *= 1 - halo * 1.1;
            }
            if (dL < holeR) {
              const k = smoothstep(holeR, holeR * 0.55, dL);
              R += (40 - R) * k; G += (28 - G) * k; B += (22 - B) * k;
              wetness = Math.max(wetness, k);
            }
          }

          // White line and the thick stained wall rim.
          const isWall = e < wallW;
          if (isWall) {
            const k = 0.5 + 0.5 * ngr;
            R = 92 - 30 * k; G = 76 - 26 * k; B = 44 - 14 * k;
            if (e > wallW - 1) { R *= 1.3; G *= 1.3; B *= 1.25; } // bevel catching the light
          } else if (e < wallW + 1.3) {
            R = R * 0.4 + 232 * 0.6; G = G * 0.4 + 212 * 0.6; B = B * 0.4 + 162 * 0.6;
          }

          // 3. Stained outer horn: the first fraction of a mm, deeper in low spots.
          if (!isWall) {
            const isle = 4.5 * smoothstep(0.64, 0.8, nIsle[p] / 255);
            const sd = 0.3 + 0.7 * ns + isle;
            const st = smoothstep(sd + 0.3, sd - 0.05, removed);
            if (st > 0) {
              let sr = 136 - 66 * ns, sg = 108 - 48 * ns, sb = 60 - 26 * ns;
              // The dark, cracked patch that gives the ulcer away on a cleaned foot.
              if (dL < L.r * 1.9) {
                const k = smoothstep(L.r * 1.9, L.r * 0.4, dL) * 0.55;
                sr *= 1 - k; sg *= 1 - k; sb *= 1 - k;
                if (Math.abs(ncv - 0.5) < 0.035) { sr *= 0.45; sg *= 0.45; sb *= 0.45; }
              }
              R += (sr - R) * st; G += (sg - G) * st; B += (sb - B) * st;
            }
          }

          // 4. Opened cavity: wet peach/pink tissue in layers, corium at the core.
          if (dL < L.r * 2) {
            const thr = 0.3 + 0.4 * ncv;
            const open = smoothstep(thr + 0.12, thr - 0.12, lf);
            if (open > 0) {
              const u = dL / L.r;
              const fl = 0.5 + 0.5 * Math.sin(dL * 1.7 + ncv * 7);
              let cr = 238 - 40 * fl * 0.6, cg = 212 - 62 * fl * 0.6, cb = 192 - 64 * fl * 0.6;
              const mid = smoothstep(1.25, 0.95, u);
              const mr = 232 - 54 * ncv, mg = 168 - 64 * ncv, mb = 150 - 58 * ncv;
              cr += (mr - cr) * mid; cg += (mg - cg) * mid; cb += (mb - cb) * mid;
              const core = smoothstep(0.65, 0.4, u);
              cr += (196 - 46 * ngr - cr) * core; cg += (86 - 34 * ngr - cg) * core; cb += (92 - 30 * ngr - cb) * core;
              if (ngr > 0.86 && u < 1.2) { cr *= 0.55; cg *= 0.5; cb *= 0.5; } // dark pits
              // Inner shadow: the rim of horn on the lamp side overhangs the hole.
              const sh = looseAt(lx - 1.7, ly - 2.4);
              const dk = (1 - 0.5 * sh) * (0.8 + 0.2 * Math.min(1, u));
              cr *= dk; cg *= dk; cb *= dk;
              // Antiseptic pools in the crevices: blue-green.
              const tn = sm(tint) * (0.45 + 0.55 * ncv);
              cr += (96 - cr) * tn * 0.75; cg += (196 - cg) * tn * 0.75; cb += (164 - cb) * tn * 0.75;
              R += (cr - R) * open; G += (cg - G) * open; B += (cb - B) * open;
              wetness = Math.max(wetness, open);
              // A lifted flap edge catches the light on the horn side of the rim.
              if (open > 0.05 && open < 0.5) { R += 30 * (1 - open); G += 28 * (1 - open); B += 22 * (1 - open); }
            }
          }

          // Light spray tint on the horn.
          const tn = sm(tint);
          if (tn > 0.01 && dL > L.r * 1.6) {
            const k = tn * 0.16;
            R += (140 - R) * k; G += (206 - G) * k; B += (184 - B) * k;
          }

          // Loose, undermined heel horn: a lifted flake with a dark crack around it.
          if (c === heelC) {
            const dH = Math.hypot(lx - LH.x, ly - LH.y);
            if (dH < LH.r * 1.8) {
              const hl = sm(looseF);
              if (hl > 0.55) {
                const k = 0.55 + 0.45 * Math.sin(dH * 1.4 + ncv * 5);
                R = 228 - 26 * k; G = 208 - 26 * k; B = 160 - 20 * k;
              }
              if (hl > 0.3 && hl < 0.6) { R *= 0.4; G *= 0.36; B *= 0.32; }
            }
          }

          // Blood.
          const bl = sm(bloodF);
          if (bl > 0.2) {
            const k = smoothstep(0.2, 0.6, bl);
            R += (166 - R) * k; G += (12 - G) * k; B += (24 - B) * k;
            wetness = Math.max(wetness, k);
          }
        }

        // 5. Manure and straw on top. A film lingers even after the clumps go.
        const grime = e < wallW + 1 ? 0.3 : 0;
        const film = Math.min(0.55, m * 0.7 + grime) * 0.55;
        R += (104 - R) * film; G += (80 - G) * film; B += (48 - B) * film;
        const thr = nMudThr[p] / 255;
        const cov = smoothstep(thr - 0.05, thr + 0.05, m);
        let mudSp = 0;
        if (cov > 0) {
          const lu = nLump[p] / 255;
          let mr = 32 + 56 * lu, mg = 24 + 42 * lu, mb = 15 + 22 * lu;
          const sa = (straw[o + 3] / 255) * smoothstep(0.3, 0.75, cov);
          if (sa > 0) { mr += (straw[o] - mr) * sa; mg += (straw[o + 1] - mg) * sa; mb += (straw[o + 2] - mb) * sa; }
          R += (mr - R) * cov; G += (mg - G) * cov; B += (mb - B) * cov;
          mudSp = (mudSpec[p] / 255) * cov * (1 - sa * 0.7);
        }

        // 6. Form: dome shading, then wet highlights on manure, fluid and tissue.
        const sh = (shade[p] / 200) * (c >= 3 ? 0.88 : 1);
        R *= sh; G *= sh; B *= sh;
        spec += 210 * mudSp + 230 * (wetSpec[p] / 255) * wetness;
        spec += (domeSpec[p] / 255) * (60 * cov + 70 * wetness + 22);
        d[o] = R + spec;
        d[o + 1] = G + spec;
        d[o + 2] = B + spec * 0.92;
        d[o + 3] = 255;
      }
    }
    this.ctx.putImageData(this.img, 0, 0, x0, y0, x1 - x0, y1 - y0);
  }

  // -------------------------------------------------------------- live fx

  // The weeping hole: fluid runs toward the toe and bubbles froth at the opening.
  weep(x, y, amount = 1) {
    for (let k = 0; k < Math.round(6 * amount); k++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 5,
        r: 0.8 + Math.random() * 2.6, life: 1 + Math.random() * 2.5, t: 0, ph: Math.random() * 6,
      });
    }
    for (let k = 0; k < Math.max(1, Math.round(1.5 * amount)); k++) {
      this.drips.push({
        x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.5) * 4, vy: 18 + Math.random() * 20,
        life: 2.5 + Math.random() * 2, w: 1.2 + Math.random() * 1.6, col: [150, 118, 78], a: 0.1,
      });
    }
  }

  // Spray: blue-green droplets land on the horn and the odd run trickles down.
  spray(x, y, r, dt) {
    const c = this.octx;
    for (let k = 0; k < 14; k++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * r;
      c.fillStyle = `rgba(110,205,180,${0.05 + Math.random() * 0.12})`;
      c.beginPath();
      c.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 0.4 + Math.random() * 1.3, 0, Math.PI * 2);
      c.fill();
    }
    if (Math.random() < dt * 3) {
      this.drips.push({
        x: x + (Math.random() - 0.5) * r, y: y + (Math.random() - 0.5) * r * 0.6, vx: 0, vy: 26 + Math.random() * 18,
        life: 1.6 + Math.random() * 1.6, w: 1 + Math.random(), col: [96, 196, 168], a: 0.14,
      });
    }
    this.decalsDirty = true;
  }

  update(dt) {
    const c = this.octx;
    for (const dr of this.drips) {
      const nx = dr.x + dr.vx * dt, ny = dr.y + dr.vy * dt;
      c.strokeStyle = `rgba(${dr.col[0]},${dr.col[1]},${dr.col[2]},${dr.a})`;
      c.lineWidth = dr.w;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(dr.x, dr.y); c.lineTo(nx, ny); c.stroke();
      c.strokeStyle = `rgba(255,255,255,${dr.a * 0.9})`;
      c.lineWidth = dr.w * 0.3;
      c.beginPath(); c.moveTo(dr.x - dr.w * 0.25, dr.y); c.lineTo(nx - dr.w * 0.25, ny); c.stroke();
      dr.x = nx; dr.y = ny;
      dr.vy *= 1 - Math.min(1, dt * 0.7);
      dr.vx += (Math.random() - 0.5) * 30 * dt;
      dr.life -= dt;
      this.decalsDirty = true;
    }
    this.drips = this.drips.filter((dr) => dr.life > 0);
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < b.life);

    // Decals slowly dry off.
    this.fadeT += dt;
    if (this.fadeT > 0.5) {
      this.fadeT = 0;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = 'rgba(0,0,0,0.025)';
      c.fillRect(0, 0, this.w, this.h);
      c.restore();
    }
    if (this.decalsDirty && this.mask) {
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'destination-in';
      c.drawImage(this.mask, 0, 0);
      c.restore();
      this.decalsDirty = false;
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.canvas, this.X0, this.Y0, this.LW, this.LH);
    ctx.drawImage(this.overlay, this.X0, this.Y0, this.LW, this.LH);
    // Bubbles: thin glossy films that swell and pop.
    for (const b of this.bubbles) {
      const k = b.t / b.life;
      const r = b.r * (0.6 + 0.6 * Math.min(1, k * 3));
      const x = b.x + Math.sin(b.t * 3 + b.ph) * 0.6, y = b.y + k * 3;
      ctx.globalAlpha = k > 0.9 ? (1 - k) * 10 : 1;
      ctx.fillStyle = 'rgba(200,190,170,0.18)';
      ctx.strokeStyle = 'rgba(255,250,240,0.55)';
      ctx.lineWidth = 0.4;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------ helpers

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function specFrom(dnx, dny, gx, gy, power) {
  const N = norm3(dnx - gx, dny - gy, 1);
  const nh = Math.max(0, N[0] * HALF[0] + N[1] * HALF[1] + N[2] * HALF[2]);
  return Math.round(255 * nh ** power);
}

// Scanline-fill a polygon (logical coords) into a class buffer where still empty.
function fillPoly(buf, w, h, S, X0, Y0, pts, value) {
  for (let py = 0; py < h; py++) {
    const ly = Y0 + (py + 0.5) / S;
    const xs = [];
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > ly) !== (yj > ly)) xs.push(xi + ((ly - yi) * (xj - xi)) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil((xs[k] - X0) * S - 0.5));
      const b = Math.min(w - 1, Math.floor((xs[k + 1] - X0) * S - 0.5));
      for (let px = a; px <= b; px++) if (!buf[py * w + px]) buf[py * w + px] = value;
    }
  }
}

// Straw and fibre strands, denser toward the heel and in the interdigital gap.
function paintStraw(art, rand) {
  const { w, h, S, X0, Y0 } = art;
  const cv = makeCanvas(w, h);
  const c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, -X0 * S, -Y0 * S);
  c.lineCap = 'round';
  let placed = 0;
  for (let tries = 0; placed < 1100 && tries < 20000; tries++) {
    const x = 30 + rand() * 340, y = 160 + rand() * 470;
    const heel = smoothstep(330, 190, y), gap = smoothstep(40, 6, Math.abs(x - GEOM.midX));
    if (rand() > 0.35 + 0.5 * heel + 0.4 * gap) continue;
    placed++;
    const len = 4 + rand() ** 2 * 20;
    const a = rand() * Math.PI;
    const green = rand();
    const lum = 0.7 + rand() * 0.45;
    c.strokeStyle = `rgb(${(200 - 40 * green) * lum | 0},${(166 - 10 * green) * lum | 0},${(78 - 20 * green) * lum | 0})`;
    c.lineWidth = 0.45 + rand() * 0.9;
    c.beginPath();
    const bend = (rand() - 0.5) * 0.5;
    c.moveTo(x, y);
    c.quadraticCurveTo(
      x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5,
      x + Math.cos(a) * len, y + Math.sin(a) * len,
    );
    c.stroke();
    // A highlight along the strand.
    c.strokeStyle = 'rgba(255,240,190,0.35)';
    c.lineWidth *= 0.35;
    c.stroke();
  }
  return c.getImageData(0, 0, w, h).data;
}
