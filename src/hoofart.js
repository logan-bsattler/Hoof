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
import { Z, CLAW, LOOSE, GEOM, DECOY_DEPTH, clawPolygon, distToPath } from './hoof.js';
import { mulberry32, valueNoise, fbm, smoothstep } from './noise.js';

export const MARK = { NONE: 0, GRINDER: 1, KNIFE: 2, RASP: 3 };
const MARK_OF = { grinder: MARK.GRINDER, knife: MARK.KNIFE, rasp: MARK.RASP };

// Key light from the upper left (the work lamp), viewer straight on.
const LIGHT = norm3(-0.45, -0.65, 0.62);
const HALF = norm3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
const DOME_R = 28;   // logical px over which a claw rolls off from flat sole to rim
const DOME_H = 12;   // how convex the claw reads
// Cut relief: removed horn sits lower, so cuts get lit walls. About 0.7 mm per logical px,
// exaggerated a little so a 2 mm step still reads.
const RELIEF = 1.5 / 0.7;
const CAVITY_MAX = 4;      // mm: deepest the opened ulcer core reads below the sole around it
const ARC_R = 5;           // grinder striation arcs: radius as a multiple of the disc radius

function norm3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

// Sole colour by remaining thickness (mm). Ground horn is near-white ivory; it warms
// to cream when overgrown and goes translucent pink as the corium shows through.
const SOLE_RAMP = [
  [0, [196, 52, 58]], [1, [214, 122, 124]], [2.5, [234, 180, 166]], [3.5, [242, 204, 188]],
  [4.5, [246, 220, 200]], [7, [245, 226, 202]], [9, [240, 218, 182]], [12, [226, 200, 150]],
  [16, [208, 180, 122]],
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

    // Rounded outlines: the model's polygons are coarse, and their corners would facet the rim.
    const polys = {
      1: smoothPoly(clawPolygon(CLAW.OUTER, false, hoof.side)), 2: smoothPoly(clawPolygon(CLAW.INNER, false, hoof.side)),
      3: smoothPoly(clawPolygon(CLAW.OUTER, true, hoof.side)), 4: smoothPoly(clawPolygon(CLAW.INNER, true, hoof.side)),
    };
    this.polys = polys;
    const cls = new Uint8Array(n);
    for (const c of [1, 2, 3, 4]) fillPoly(cls, w, h, S, X0, Y0, polys[c], c);
    this.cls = cls;

    // Distance to the outline, per pixel.
    const edge = new Float32Array(n);
    const dome = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      const c = cls[p];
      if (!c) continue;
      const lx = X0 + ((p % w) + 0.5) / S, ly = Y0 + (Math.floor(p / w) + 0.5) / S;
      const pts = polys[c];
      let best = Infinity;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [ax, ay] = pts[j], [qx, qy] = pts[i];
        const ex = qx - ax, ey = qy - ay;
        const t = Math.max(0, Math.min(1, ((lx - ax) * ex + (ly - ay) * ey) / (ex * ex + ey * ey)));
        const d = (lx - ax - t * ex) ** 2 + (ly - ay - t * ey) ** 2;
        if (d < best) best = d;
      }
      const d = Math.sqrt(best);
      edge[p] = d;
      // Dome profile: rises from the rim and flattens over the sole.
      const e = Math.min(1, d / DOME_R);
      dome[p] = DOME_H * (1 - (1 - e) * (1 - e));
    }
    // Blur the height so the distance field's medial creases don't show in the light,
    // then keep its slope (height per logical px) as each pixel's base normal.
    const br = Math.max(1, Math.round(1.5 * S));
    boxBlur(dome, w, h, br); boxBlur(dome, w, h, br);
    const sx0 = new Float32Array(n), sy0 = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const pl = x > 0 ? p - 1 : p, pr = x < w - 1 ? p + 1 : p;
      const pu = y > 0 ? p - w : p, pd = y < h - 1 ? p + w : p;
      sx0[p] = ((dome[pr] - dome[pl]) * S) / (pr - pl || 1);
      sy0[p] = ((dome[pd] - dome[pu]) * S) / ((pd - pu) / w || 1);
    }
    this.edge = edge; this.sx0 = sx0; this.sy0 = sy0;
    const dnx = new Float32Array(n), dny = new Float32Array(n);
    for (let p = 0; p < n; p++) { dnx[p] = -sx0[p]; dny[p] = -sy0[p]; }

    // Static noise fields (logical-space frequencies, so they scale with S).
    const rand = mulberry32(9137);
    const N1 = valueNoise(rand), N2 = valueNoise(rand), N3 = valueNoise(rand);
    const N4 = valueNoise(rand), N5 = valueNoise(rand), N6 = valueNoise(rand);
    const nMudThr = new Uint8Array(n), nStain = new Uint8Array(n), nCav = new Uint8Array(n);
    const nGrain = new Uint8Array(n), nStreak = new Uint8Array(n), nIsle = new Uint8Array(n);
    const lump = new Float32Array(n), wet = new Float32Array(n), glint = new Float32Array(n);
    const nTone = new Uint8Array(n), nFleck = new Uint8Array(n);
    const N7 = valueNoise(rand), N8 = valueNoise(rand);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      const lx = X0 + ((p % w) + 0.5) / S, ly = Y0 + (Math.floor(p / w) + 0.5) / S;
      // Manure clings thickest toward the heel and in the interdigital gap.
      const heelness = smoothstep(300, 195, ly);
      const gapness = smoothstep(26, 6, Math.abs(lx - GEOM.midX) - 7);
      const thr = Math.max(0.18, 0.12 + 0.8 * fbm(N1, lx / 13, ly / 13, 4) - 0.16 * (heelness + gapness));
      nMudThr[p] = clamp255(thr * 255);
      nStain[p] = clamp255(fbm(N2, lx / 21, ly / 21, 4) * 255);
      nIsle[p] = clamp255(fbm(N6, lx / 15, ly / 26, 3) * 255);
      nCav[p] = clamp255(fbm(N3, lx / 4.5, ly / 4.5, 3) * 255);
      nGrain[p] = clamp255((N4(lx * 1.3, ly * 1.3) * 0.55 + rand() * 0.45) * 255);
      nStreak[p] = clamp255(fbm(N5, lx / 1.4, ly / 10, 3) * 255);
      lump[p] = fbm(N5, lx / 2.4 + 91, ly / 2.4, 3);
      wet[p] = fbm(N3, lx / 3.2 + 40, ly / 3.2, 2);
      // Fine wet bumps on the manure: each crest throws a small sharp glint.
      glint[p] = fbm(N8, lx / 0.9, ly / 0.9, 2);
      // Broad peach/cream mottling in the horn, as in a waxy, translucent material.
      nTone[p] = clamp255(fbm(N7, lx / 34, ly / 40, 3) * 255);
      // Sparse dark flecks of grit pressed into the sole.
      nFleck[p] = clamp255(N7(lx * 1.9 + 300, ly * 1.9) * 255);
    }
    // Wet specular from micro-normals (pixel gradients) on top of the dome normal.
    const mudSpec = new Uint8Array(n), wetSpec = new Uint8Array(n);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const pl = x > 0 ? p - 1 : p, pr = x < w - 1 ? p + 1 : p;
      const pu = y > 0 ? p - w : p, pd = y < h - 1 ? p + w : p;
      const broad = specFrom(dnx[p], dny[p], (lump[pr] - lump[pl]) * S * 6, (lump[pd] - lump[pu]) * S * 6, 30);
      const sharp = specFrom(dnx[p], dny[p], (glint[pr] - glint[pl]) * S * 5, (glint[pd] - glint[pu]) * S * 5, 140);
      mudSpec[p] = Math.min(255, broad * 0.3 + sharp * 0.5);
      wetSpec[p] = specFrom(dnx[p], dny[p], (wet[pr] - wet[pl]) * S * 4, (wet[pd] - wet[pu]) * S * 4, 60);
    }
    // Manure relief: lumps at two scales plus fine wet ripples. Its slope tilts the normal,
    // so the lamp itself picks out the clumps and throws glints off their wet crests.
    const mudX = new Float32Array(n), mudY = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      const x = p % w, y = (p / w) | 0;
      const pl = x > 0 ? p - 1 : p, pr = x < w - 1 ? p + 1 : p;
      const pu = y > 0 ? p - w : p, pd = y < h - 1 ? p + w : p;
      // Some stretches are slick and smooth, others clumpy.
      const clumpy = 0.25 + 1.1 * smoothstep(0.35, 0.7, nStain[p] / 255);
      const hx = (lump[pr] - lump[pl]) * 1.4 * clumpy + (glint[pr] - glint[pl]) * 0.35 + (wet[pr] - wet[pl]) * 1.8;
      const hy = (lump[pd] - lump[pu]) * 1.4 * clumpy + (glint[pd] - glint[pu]) * 0.35 + (wet[pd] - wet[pu]) * 1.8;
      mudX[p] = (hx * S) / (pr - pl || 1);
      mudY[p] = (hy * S) / ((pd - pu) / w || 1);
    }
    this.mudX = mudX; this.mudY = mudY;
    const nLump = new Uint8Array(n);
    for (let p = 0; p < n; p++) nLump[p] = clamp255(lump[p] * 255);
    Object.assign(this, { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, nLump, nTone, nFleck, mudSpec, wetSpec });

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
    // Grinder marks are arcs of the disc rim: each pixel keeps the arc's centre (render px).
    this.arcX = new Int16Array(n);
    this.arcY = new Int16Array(n);
    this.built = true;
    this.builtSide = hoof.side;
  }

  // ------------------------------------------------------------- per frame

  // Bring the buffers in line with the simulation; recompose what changed.
  sync(hoof) {
    // The outline buffers depend on which way round the foot is.
    if (!this.built || this.builtSide !== hoof.side) this.build(hoof);
    if (hoof !== this.hoof) {
      this.hoof = hoof;
      this.snap = {
        thick: Float32Array.from(hoof.thick), mud: Float32Array.from(hoof.mud),
        rough: Float32Array.from(hoof.rough), loose: Uint8Array.from(hoof.loose),
        blood: Uint8Array.from(hoof.blood), tint: Float32Array.from(hoof.tint),
      };
      this.looseF = new Float32Array(hoof.n);
      this.bloodF = new Float32Array(hoof.n);
      // Where the ulcer's cap of loose horn started: the pocket can only open inside it.
      this.ulcerF = new Float32Array(hoof.n);
      // Likewise the white-line track's under-run horn: the groove can only open along it.
      this.tractF = new Float32Array(hoof.n);
      // The heel cleft's skin, and the DD patch on it.
      this.cleftF = new Float32Array(hoof.n);
      this.ddF = new Float32Array(hoof.n);
      for (let i = 0; i < hoof.n; i++) {
        this.looseF[i] = hoof.loose[i] ? 1 : 0; this.bloodF[i] = hoof.blood[i];
        this.ulcerF[i] = hoof.looseInit[i] === LOOSE.ULCER ? 1 : 0;
        this.tractF[i] = hoof.looseInit[i] === LOOSE.TRACT ? 1 : 0;
        this.cleftF[i] = hoof.zone[i] & Z.CLEFT ? 1 : 0;
        this.ddF[i] = hoof.zone[i] & Z.DD ? 1 : 0;
      }
      this.markT.fill(0);
      this.octx.save();
      this.octx.setTransform(1, 0, 0, 1, 0, 0);
      this.octx.clearRect(0, 0, this.w, this.h);
      this.octx.restore();
      this.drips = [];
      this.bubbles = [];
      this.dirty = null;
      this.rg = null;
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
    // The disc's rim sweeps arcs that run along the pass, bowing to one side.
    const ml = Math.hypot(dx, dy) || 1;
    const ax = Math.round(cx - (dy / ml) * R * ARC_R), ay = Math.round(cy + (dx / ml) * R * ARC_R);
    const hoof = this.hoof;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const p = py * w + px;
        const c = cls[p];
        if (!c || c > 2) continue;
        if ((px - cx) ** 2 + (py - cy) ** 2 > R * R) continue;
        if (hoof && ((hoof.block === c) || (hoof.wrap && hoof.wrapClaw === c))) continue;
        const fresh = this.markT[p] !== type;
        this.markT[p] = type;
        if (moving || type !== MARK.GRINDER) this.markA[p] = qa;
        if (type === MARK.GRINDER && (moving || fresh)) {
          this.arcX[p] = moving ? ax : Math.round(cx);
          this.arcY[p] = moving ? ay : Math.round(cy + R * ARC_R);
        }
      }
    }
    this.addDirty(x0, y0, x1 + 1, y1 + 1);
  }

  // ----------------------------------------------------------------- compose

  // Per claw, how far each cell's surface sits below where it started (mm, <= 0): removed
  // horn and lifted heel flakes. Padded past the claw's edge so the spline doesn't read the
  // outline as a cliff. The ulcer core starts thin (corium just under it), so it is measured
  // against the sole around it instead: flush while capped, a pit once opened.
  reliefGrid() {
    const hoof = this.hoof, n = hoof.n, cols = CFG.grid.cols, cc = this.cellCls;
    if (!this.rg) {
      this.rg = { 1: new Float32Array(n), 2: new Float32Array(n), ok: new Uint8Array(n), nx: new Uint8Array(n) };
      // Starting level of the sole round the ulcer core: the mean of the loose rim cells.
      let sum = 0, k = 0;
      for (let i = 0; i < n; i++) {
        if (hoof.looseInit[i] === LOOSE.ULCER && !(hoof.zone[i] & Z.ULCER)) { sum += hoof.init[i]; k++; }
      }
      this.rg.coreRef = k ? sum / k : 0;
    }
    const { ok, nx, coreRef } = this.rg;
    for (const c of [1, 2]) {
      const a = this.rg[c];
      for (let i = 0; i < n; i++) {
        ok[i] = cc[i] === c ? 1 : 0;
        if (!ok[i]) { a[i] = 0; continue; }
        let v = hoof.thick[i] - hoof.init[i];
        const lg = hoof.looseInit[i];
        if (hoof.zone[i] & Z.ULCER) {
          // Capped: let the padding below carry the surrounding level across it.
          if (hoof.loose[i]) { ok[i] = 0; continue; }
          v = Math.max(-CAVITY_MAX, hoof.thick[i] - coreRef);
        } else if (lg === LOOSE.HEEL) v -= 1.2 * (1 - this.looseF[i]);
        a[i] = v;
      }
      for (let round = 0; round < 3; round++) {
        nx.set(ok);
        for (let i = 0; i < n; i++) {
          if (ok[i]) continue;
          const x = i % cols;
          let s = 0, k = 0;
          if (x > 0 && ok[i - 1]) { s += a[i - 1]; k++; }
          if (x < cols - 1 && ok[i + 1]) { s += a[i + 1]; k++; }
          if (i >= cols && ok[i - cols]) { s += a[i - cols]; k++; }
          if (i + cols < n && ok[i + cols]) { s += a[i + cols]; k++; }
          if (k) { a[i] = s / k; nx[i] = 1; }
        }
        ok.set(nx);
      }
    }
    return this.rg;
  }

  compose(x0, y0, x1, y1) {
    const hoof = this.hoof;
    const { S, w, X0, Y0, cls, edge, sx0, sy0, cellCls, fallback } = this;
    const { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, nLump, nTone, nFleck, mudSpec, wetSpec, straw, hash, markT, markA, arcX, arcY } = this;
    const g = CFG.grid, cols = g.cols, rows = g.rows, cell = g.cell;
    const d = this.img.data;
    const { thick, init, mud, rough, tint } = hoof;
    const looseF = this.looseF, bloodF = this.bloodF, ulcerF = this.ulcerF, tractF = this.tractF;
    const L = hoof.caseDef.lesion, LH = hoof.caseDef.looseHorn;
    const cleftF = this.cleftF, ddF = this.ddF, DDL = L?.type === 'dd' ? L : null;
    const lesionC = L?.claw ?? CLAW.NONE, heelC = LH.claw;
    // The ulcer art keys off dL (distance to the ulcer) and Lr; with no ulcer, dL stays huge.
    const ulcerC = L?.type === 'ulcer' ? L.claw : CLAW.NONE, Lr = ulcerC ? L.r : 0;
    // The white-line track's box: pixels outside it skip the per-pixel path distance.
    const T = L?.type === 'whiteline' ? L : null;
    let tb = null;
    if (T) {
      const K = T.pocket, m = T.w * 2.2, xs = T.path.map((q) => q[0]), ys = T.path.map((q) => q[1]);
      tb = [Math.min(...xs, K.x - K.r * 1.8) - m, Math.min(...ys, K.y - K.r * 1.8) - m,
        Math.max(...xs, K.x + K.r * 1.8) + m, Math.max(...ys, K.y + K.r * 1.8) + m];
    }
    const heelY = GEOM.heelY;
    const decoys = (hoof.caseDef.findings ?? []).filter((f) => f.kind !== L?.type);

    let i0 = 0, i1 = 0, i2 = 0, i3 = 0, w0 = 0, w1 = 0, w2 = 0, w3 = 0;
    const sm = (a) => a[i0] * w0 + a[i1] * w1 + a[i2] * w2 + a[i3] * w3;
    // Plain bilinear sample of looseF at a logical point (for the cavity's inner shadow).
    const fieldAt = (a, lx, ly) => {
      const fx = (lx - g.x0) / cell - 0.5, fy = (ly - g.y0) / cell - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      if (ix < 0 || iy < 0 || ix >= cols - 1 || iy >= rows - 1) return 0;
      const j = iy * cols + ix;
      return (a[j] * (1 - tx) + a[j + 1] * tx) * (1 - ty) + (a[j + cols] * (1 - tx) + a[j + cols + 1] * tx) * ty;
    };
    const looseAt = (lx, ly) => {
      const fx = (lx - g.x0) / cell - 0.5, fy = (ly - g.y0) / cell - 0.5;
      const ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      if (ix < 0 || iy < 0 || ix >= cols - 1 || iy >= rows - 1) return 0;
      const j = iy * cols + ix;
      return (looseF[j] * (1 - tx) + looseF[j + 1] * tx) * (1 - ty) + (looseF[j + cols] * (1 - tx) + looseF[j + cols + 1] * tx) * ty;
    };

    const RG = this.reliefGrid();
    const PER = Math.max(2.4, 0.9 * S);  // striation spacing, render px
    const GPER = 2.6 * S;                // grinder arcs are broader
    const kx = new Float32Array(4), kdx = new Float32Array(4), ky = new Float32Array(4), kdy = new Float32Array(4);
    const reliefOut = new Float32Array(3);
    // Cubic B-spline over the padded relief grid: smooth value and slope (mm per cell).
    const relief = (a, ix, iy) => {
      let v = 0, vx = 0, vy = 0;
      for (let j = 0; j < 4; j++) {
        const ry = Math.max(0, Math.min(rows - 1, iy - 1 + j)) * cols;
        let rv = 0, rdx = 0;
        for (let i = 0; i < 4; i++) {
          const q = a[ry + Math.max(0, Math.min(cols - 1, ix - 1 + i))];
          rv += kx[i] * q; rdx += kdx[i] * q;
        }
        v += ky[j] * rv; vx += ky[j] * rdx; vy += kdy[j] * rv;
      }
      reliefOut[0] = v; reliefOut[1] = vx; reliefOut[2] = vy;
    };

    for (let py = y0; py < y1; py++) {
      const ly = Y0 + (py + 0.5) / S;
      const fy = (ly - g.y0) / cell - 0.5;
      const iy = Math.floor(fy), ty = fy - iy;
      bspline(ty, ky, kdy);
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
        // The wall band wanders in width, and its inner edge is ragged where the crust broke off.
        const wallW = 5.5 + 5 * ns + (ncv - 0.5) * 2.2;
        let R, G, B, spec = 0, wetness = 0, crust = 0;
        // Surface slope (height per logical px): the claw's dome plus cut relief and tool marks.
        let gx = sx0[p], gy = sy0[p];
        let sheen = 1;

        if (c >= 3) {
          // Overgrown dead toe horn: stained, layered, and gone once nipped. The edge sits
          // midway between a kept and a nipped cell and is torn with noise, so leftover
          // stubs break off raggedly instead of showing the cell grid.
          const kept = t / Math.max(0.5, sm(init));
          const tear = 0.5 + (ncv - 0.5) * 0.7 + (ngr - 0.5) * 0.18;
          if (kept < tear) { d[o + 3] = 0; continue; }
          // Kept dark and cool (slate-brown) so it reads against the warm straw floor.
          const layer = 0.5 + 0.5 * Math.sin(e * 1.15 + ns * 9);
          R = 78 - 22 * layer + 16 * ngr; G = 70 - 20 * layer + 14 * ngr; B = 62 - 14 * layer + 12 * ngr;
          if (e < 1.6) { R *= 0.35; G *= 0.35; B *= 0.38; }
          else if (e < wallW) { R *= 0.6; G *= 0.6; B *= 0.62; }
          else if (e < wallW + 1.5) { R += 26; G += 24; B += 22; }
          // Where the jaws went through, the fresh cross-section shows paler horn.
          if (kept < 0.97) {
            const face = smoothstep(tear + 0.16, tear + 0.03, kept);
            R += (150 + 20 * ngr - R) * face; G += (136 + 18 * ngr - G) * face; B += (108 + 14 * ngr - B) * face;
          }
        } else {
          const ti = sm(init), r = sm(rough);
          const removed = ti - t;
          bspline(tx, kx, kdx);
          relief(RG[c], ix, iy);
          gx += (reliefOut[1] / cell) * RELIEF;
          gy += (reliefOut[2] / cell) * RELIEF;
          sheen = 1 - 0.6 * r;
          const dL = c === ulcerC ? Math.hypot(lx - L.x, ly - L.y) : 1e9;
          let decoyDark = 0;

          // 1. Ivory sole, coloured by thickness.
          const rk = Math.max(0, Math.min(RAMP_N - 1, Math.round((t / RAMP_MAX) * (RAMP_N - 1)))) * 3;
          R = RAMP[rk]; G = RAMP[rk + 1]; B = RAMP[rk + 2];
          // Heel bulb horn is softer and yellower.
          const heel = smoothstep(heelY + 8, heelY - 12, ly + (ns - 0.5) * 18);
          if (heel > 0) { R += (222 - R) * heel; G += (194 - G) * heel; B += (138 - B) * heel; }
          // Waxy horn: broad patches drift between peach and cream, and the sole warms to
          // amber as it rolls toward the wall.
          const tone = nTone[p] / 255 - 0.5;
          R += 10 * tone; G -= 4 * tone; B -= 12 * tone;
          const amber = smoothstep(wallW + 14, wallW + 2, e) * 0.35;
          R += (232 - R) * amber; G += (192 - G) * amber; B += (130 - B) * amber;
          // Growth lines follow the outline; a faint grain, and the odd fleck of grit.
          const gl = 1 - 0.025 * Math.sin(e * 1.3 + ns * 10) + (ngr - 0.5) * 0.025;
          R *= gl; G *= gl; B *= gl;
          if (nFleck[p] > 246 && ngr > 0.5) { const k = 0.62 + 0.2 * ncv; R *= k; G *= k * 0.95; B *= k * 0.9; }

          // Directional striations left by the tools.
          const mt = markT[p];
          if (mt) {
            const qa = markA[p];
            let v;
            if (mt === MARK.GRINDER) {
              // Soft, shallow arcs from the disc rim: broad ridges a few px apart that catch the
              // lamp, fading in and out along their length, with the odd deeper score.
              const ax = px - arcX[p], ay = py - arcY[p];
              const sr = Math.sqrt(ax * ax + ay * ay) || 1;
              const f = sr / GPER, ring = Math.floor(f), ph = (f - ring) * 6.2832;
              const hv = hash[ring & 1023];
              const fade = 0.35 + 0.65 * (nStreak[p] / 255);
              const amp = (hv < 0 ? 1 : 0.35 + hv) * (0.3 + 1.2 * r) * fade;
              const sl = -Math.sin(ph) * amp * 0.05;
              gx += (ax / sr) * sl; gy += (ay / sr) * sl;
              v = Math.cos(ph) * amp * 0.006 - (hv < 0 ? 0.02 * (0.3 + r) * Math.max(0, 1 - Math.abs(f - ring - 0.5) * 5) : 0);
            } else if (mt === MARK.RASP) {
              const s = px * COS[qa] + py * SIN[qa], s2 = px * SIN[qa] - py * COS[qa];
              v = (hash[Math.floor(s / PER) & 1023] + hash[(Math.floor(s2 / PER) + 512) & 1023]) * (0.02 + 0.2 * r);
            } else {
              // Knife: faint nick lines along the pull; the relief gives the scoop its shape.
              const s = px * COS[qa] + py * SIN[qa];
              v = hash[Math.floor(s / (PER * 1.6)) & 1023] * 0.025;
              sheen = 1.25;
            }
            const k = 1 + v;
            R *= k; G *= k; B *= k;
          }

          // 2. Bruise streaks around the ulcer, running toward the toe.
          if (dL < Lr * 4.2) {
            const fall = (1 - dL / (Lr * 4.2)) * (ly > L.y - Lr * 0.5 ? 1 : 0.45);
            const br = smoothstep(0.5, 0.78, nStreak[p] / 255) * fall * 0.8;
            R += (222 - R) * br; G += (112 - G) * br; B += (124 - B) * br;
          }

          // Decoys: a reddish bruise in the horn, or a dark stain like the ulcer's, without the
          // hole. Both are surface marks that trimming takes off (DECOY_DEPTH).
          for (const f of decoys) {
            if (f.claw !== c) continue;
            const dd = Math.hypot(lx - f.x, ly - f.y);
            if (dd > f.r * 2) continue;
            const keep = smoothstep(DECOY_DEPTH[f.kind], DECOY_DEPTH[f.kind] * 0.4, removed);
            if (f.kind === 'bruise') {
              const k = smoothstep(f.r * 2, f.r * 0.5, dd + (ncv - 0.5) * 8) * (0.35 + 0.4 * smoothstep(0.4, 0.75, nStreak[p] / 255)) * keep;
              R += (196 - R) * k; G += (96 - G) * k; B += (92 - B) * k;
            } else {
              decoyDark = Math.max(decoyDark, smoothstep(f.r * 1.9, f.r * 0.4, dd + (ncv - 0.5) * 6) * 0.55 * keep);
            }
          }

          // Lesion cap: a small dark hole in the horn over the ulcer.
          let lf = 0;
          if (dL < Lr * 2.4) {
            lf = sm(looseF);
            const holeR = 2.1 + ncv * 1.1;
            if (dL < holeR * 2.4) {
              // The bruised ring round the hole goes with the cap once the pocket is opened.
              const halo = smoothstep(holeR * 2.4, holeR, dL) * 0.35 * smoothstep(0.4, 0.9, lf);
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
            // Stained, speckled wall horn. Once the grinder takes it down, the inner part of
            // the cut face comes up a cleaner tan; the outer edge stays dark and dirty.
            // Crusted with dried manure: dark brown-black lumps, the odd paler fleck.
            const lu = nLump[p] / 255;
            const k = 0.5 + 0.5 * ngr;
            R = 70 - 30 * k + 34 * lu * ns; G = 56 - 24 * k + 24 * lu * ns; B = 34 - 12 * k + 10 * lu;
            if (ngr > 0.86) { R *= 0.6; G *= 0.6; B *= 0.6; }
            else if (ngr < 0.06 && lu > 0.5) { R += 60; G += 50; B += 26; }
            const face = 0.55 * smoothstep(0.3, 1.6, removed) * smoothstep(wallW * 0.4, wallW * 0.75, e);
            R += (192 - 30 * k - R) * face; G += (166 - 26 * k - G) * face; B += (112 - 20 * k - B) * face;
            crust = 1 - face / 0.55;
            if (e < 1.4) { R *= 0.55; G *= 0.55; B *= 0.55; }
          } else if (e < wallW + 1.4) {
            // White line: a yellowish seam between wall and sole.
            const k = smoothstep(wallW + 1.4, wallW + 0.4, e) * 0.7;
            R += (226 - R) * k; G += (200 - G) * k; B += (140 - B) * k;
          }

          // 3. Stained outer horn: the first fraction of a mm, deeper in low spots.
          if (!isWall) {
            const isle = 0.9 * smoothstep(0.66, 0.82, nIsle[p] / 255);
            const sd = 0.2 + 0.4 * ns + isle;
            // Jitter the cut depth at pixel scale so the stain breaks off in a crisp, ragged edge.
            const rj = removed + (ngr - 0.5) * 0.14 + (ncv - 0.5) * 0.3;
            const st = smoothstep(sd + 0.07, sd - 0.03, rj);
            // The stained crust has thickness: a dark lip where it breaks off.
            const lip = st * (1 - st) * 4;
            if (lip > 0) { const k = 1 - 0.3 * lip; R *= k; G *= k; B *= k; }
            if (st > 0) {
              // Manure-stained horn: a warm brown, darker where the stain soaked deeper, with dark,
              // wet residue left packed into the low spots after brushing.
              const gk = 0.9 + 0.2 * ngr;
              let sr = (124 - 70 * ns) * gk, sg = (88 - 50 * ns) * gk, sb = (50 - 28 * ns) * gk;
              const res = smoothstep(0.58, 0.8, nIsle[p] / 255 + (nLump[p] / 255 - 0.5) * 0.35);
              sr += (40 - sr) * res * 0.8; sg += (29 - sg) * res * 0.8; sb += (17 - sb) * res * 0.8;
              crust = Math.max(crust, res * st * 0.8);
              // The dark, cracked patch that gives the ulcer away on a cleaned foot.
              if (dL < Lr * 1.9) {
                const k = smoothstep(Lr * 1.9, Lr * 0.4, dL) * 0.55;
                sr *= 1 - k; sg *= 1 - k; sb *= 1 - k;
                if (Math.abs(ncv - 0.5) < 0.02 && ngr > 0.35) { sr *= 0.7; sg *= 0.7; sb *= 0.7; }
              }
              if (decoyDark > 0) { sr *= 1 - decoyDark; sg *= 1 - decoyDark; sb *= 1 - decoyDark; }
              R += (sr - R) * st; G += (sg - G) * st; B += (sb - B) * st;
            }
          }

          // 4. Opened cavity: wet peach/pink tissue in layers, corium at the core.
          if (dL < Lr * 2.4) {
            // Ragged opening: the edge wanders with two scales of noise. It follows the knife
            // where the cap was cut, and the cap's own ragged outline where it is all gone.
            const thr = 0.22 + 0.36 * ncv + 0.3 * (nIsle[p] / 255 - 0.5);
            // Sample the cap footprint through a warped lookup so its edge never shows the cell grid.
            const uf = fieldAt(ulcerF, lx + (nIsle[p] / 255 - 0.5) * 9, ly + (nStain[p] / 255 - 0.5) * 9), ut = 0.3 + 0.4 * ncv + 0.2 * (ngr - 0.5);
            const open = smoothstep(thr + 0.08, thr - 0.08, lf) * smoothstep(ut - 0.06, ut + 0.06, uf);
            if (open > 0) {
              const u = dL / Lr;
              // Loose layers: wet, translucent pale-yellow horn, greyer where it sits deeper, with
              // dark crevices between flaps. Noise contours, not rings, so no two flaps match.
              const ls = nStreak[p] / 255;
              const flap = smoothstep(0.46, 0.6, ncv * 0.7 + ls * 0.3);
              const deep = smoothstep(1.4, 0.4, u) * (1 - flap);
              let cr = 192 + 26 * flap - 46 * deep, cg = 184 + 22 * flap - 44 * deep, cb = 146 + 20 * flap - 30 * deep;
              // Crevices only in the deepest noise troughs, so they stay small and scattered.
              const pit = smoothstep(0.26, 0.15, ncv) * 0.9;
              cr += (66 - cr) * pit; cg += (42 - cg) * pit; cb += (44 - cb) * pit;
              // Flap edges catch a bright rim.
              const fe = smoothstep(0.4, 0.5, ncv * 0.7 + ls * 0.3) * (1 - flap);
              cr += 40 * fe; cg += 36 * fe; cb += 30 * fe;
              // The corium shows pink-red at the very centre.
              const core = smoothstep(0.45, 0.2, u + (ncv - 0.5) * 0.4);
              cr += (176 - 40 * ngr - cr) * core; cg += (78 - 30 * ngr - cg) * core; cb += (84 - 28 * ngr - cb) * core;
              // Walls: the rim of horn on the lamp side overhangs the hole and shades it,
              // while the far wall faces the lamp and shows a band of pale cut horn.
              const sh = looseAt(lx - 1.7, ly - 2.4);
              const dk = (1 - 0.55 * sh) * (0.8 + 0.2 * Math.min(1, u));
              cr *= dk; cg *= dk; cb *= dk;
              const fw = smoothstep(0.35, 0.8, looseAt(lx + 1.3, ly + 1.8)) * (1 - sh);
              cr += (236 - 10 * ngr - cr) * fw * 0.8; cg += (206 - 10 * ngr - cg) * fw * 0.8; cb += (186 - 8 * ngr - cb) * fw * 0.8;
              // Antiseptic pools in the crevices and stains the rest only faintly.
              const tn = sm(tint) * (0.18 + 0.7 * smoothstep(0.5, 0.25, ncv));
              cr += (96 - cr) * tn * 0.75; cg += (196 - cg) * tn * 0.75; cb += (164 - cb) * tn * 0.75;
              R += (cr - R) * open; G += (cg - G) * open; B += (cb - B) * open;
              wetness = Math.max(wetness, open);
              // A lifted flap edge catches the light on the horn side of the rim.
              if (open > 0.05 && open < 0.5) { R += 30 * (1 - open); G += 28 * (1 - open); B += 22 * (1 - open); }
            }
          }

          // White-line abscess: a dark seam of packed grit in the white line, the pared groove
          // that follows it in from the wall, and the drained pocket at its end.
          if (c === lesionC && T && lx > tb[0] && lx < tb[2] && ly > tb[1] && ly < tb[3]) {
            const dT = distToPath(lx, ly, T.path).d, K = T.pocket, dP = Math.hypot(lx - K.x, ly - K.y);
            const lf = sm(looseF);
            // Sealed: a ragged dark line, thinner than the track, and a faint grey shadow over
            // the pocket where the pus pools under the sole.
            const sw = T.w * (0.45 + 0.35 * ncv);
            const seam = smoothstep(sw, sw * 0.3, dT + (ngr - 0.5) * 1.2) * lf * 0.85;
            R += (58 - R) * seam; G += (48 - G) * seam; B += (40 - B) * seam;
            const pool = smoothstep(K.r * 1.3, K.r * 0.3, dP) * 0.16 * lf;
            R *= 1 - pool; G *= 1 - pool; B *= 1 - pool * 0.8;
            // Opened: walls of clean pale horn, grey grit and pus along the bottom, heaviest in the
            // pocket. The footprint is read through a warped lookup so the groove's edge is ragged.
            const tf = fieldAt(tractF, lx + (nIsle[p] / 255 - 0.5) * 5, ly + (nStain[p] / 255 - 0.5) * 5);
            const open = smoothstep(0.65, 0.25, lf) * smoothstep(0.25, 0.55, tf);
            if (open > 0) {
              const inPocket = smoothstep(K.r * 1.1, K.r * 0.6, dP);
              const bottom = Math.max(smoothstep(T.w * 0.9, T.w * 0.2, dT), inPocket);
              let cr = 228 - 10 * ngr, cg = 210 - 10 * ngr, cb = 176 - 8 * ngr;
              const pus = bottom * (0.5 + 0.35 * inPocket) * (0.8 + 0.4 * ncv);
              cr += (74 - cr) * pus; cg += (70 - cg) * pus; cb += (62 - cb) * pus;
              // Pink-grey corium shows through at the pocket's centre once it has drained.
              const core = smoothstep(0.55, 0.2, dP / K.r + (ncv - 0.5) * 0.4) * inPocket * 0.6;
              cr += (168 - cr) * core; cg += (110 - cg) * core; cb += (106 - cb) * core;
              R += (cr - R) * open; G += (cg - G) * open; B += (cb - B) * open;
              wetness = Math.max(wetness, open * (0.4 + 0.6 * bottom));
            }
          }

          // Heel cleft: soft, greyish-pink skin where the bulbs fold in toward each other.
          const cf = smoothstep(0.25, 0.75, fieldAt(cleftF, lx + (nIsle[p] / 255 - 0.5) * 4, ly + (nStain[p] / 255 - 0.5) * 4));
          if (cf > 0) {
            const k = cf * 0.55;
            R += (172 + 16 * ngr - R) * k; G += (134 + 12 * ngr - G) * k; B += (120 + 10 * ngr - B) * k;
            // Digital dermatitis: a raw, strawberry-red patch, pitted with pale dots, inside a rim
            // of thickened greyish-white skin. The spray stains it teal.
            if (DDL && c === DDL.claw) {
              const u = Math.hypot((lx - DDL.x) / (DDL.r * 0.75), (ly - DDL.y) / (DDL.r * 1.05)) + (ncv - 0.5) * 0.25;
              const on = smoothstep(0.3, 0.6, fieldAt(ddF, lx, ly)) * cf;
              const raw = smoothstep(0.92, 0.78, u) * on;
              const rim = smoothstep(0.7, 0.9, u) * smoothstep(1.2, 0.98, u) * on;
              if (raw + rim > 0) {
                let cr = 196 - 30 * ncv, cg = 44 + 16 * ncv, cb = 50 + 12 * ncv;
                const dot = smoothstep(0.72, 0.86, ngr) * 0.7;
                cr += (238 - cr) * dot; cg += (162 - cg) * dot; cb += (150 - cb) * dot;
                const tn = sm(tint) * 0.7;
                cr += (62 - cr) * tn; cg += (158 - cg) * tn; cb += (146 - cb) * tn;
                R += (cr - R) * raw; G += (cg - G) * raw; B += (cb - B) * raw;
                R += (232 - R) * rim * 0.8; G += (226 - G) * rim * 0.8; B += (212 - B) * rim * 0.8;
                wetness = Math.max(wetness, raw * 0.9);
              }
            }
          }

          // Light spray tint on the horn.
          const tn = sm(tint);
          if (tn > 0.01 && dL > Lr * 1.6) {
            const k = tn * 0.16;
            R += (140 - R) * k; G += (206 - G) * k; B += (184 - B) * k;
          }

          // Loose, undermined heel horn: a lifted, curling flake of old stained horn. Its outline
          // is read through a warped lookup so it tears raggedly instead of tracing cells; the
          // free toe-side edge stands proud, catching the lamp and shadowing the sole below.
          if (c === heelC) {
            const dH = Math.hypot(lx - LH.x, ly - LH.y);
            if (dH < LH.r * 2.2) {
              const wx = (nIsle[p] / 255 - 0.5) * 7, wy = (nStain[p] / 255 - 0.5) * 7;
              const ft = 0.5 + (ncv - 0.5) * 0.5;
              const on = smoothstep(ft - 0.05, ft + 0.05, fieldAt(looseF, lx + wx, ly + wy));
              // Shadow cast onto the sole by the flake's lifted edge (lamp at upper left).
              const by = smoothstep(ft - 0.05, ft + 0.05, fieldAt(looseF, lx + wx - 1.4, ly + wy - 2.2));
              const shade = by * (1 - on) * 0.55;
              R *= 1 - shade; G *= 1 - shade; B *= 1 - shade * 0.9;
              if (on > 0) {
                const lift = smoothstep(LH.y - LH.r, LH.y + LH.r * 1.2, ly + (ncv - 0.5) * 8);
                const layer = 0.5 + 0.5 * Math.sin((ly - LH.y) * 1.1 + ncv * 6 + (lx - LH.x) * 0.25);
                let fr = 168 - 30 * layer + 24 * lift, fg = 140 - 26 * layer + 22 * lift, fb = 92 - 18 * layer + 14 * lift;
                // Dark seam of dirt where the flake parts from the sole beneath.
                const seam = on * (1 - on) * 4;
                fr *= 1 - 0.6 * seam; fg *= 1 - 0.6 * seam; fb *= 1 - 0.6 * seam;
                R += (fr - R) * on; G += (fg - G) * on; B += (fb - B) * on;
                gy -= 0.5 * lift * on;
              }
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
        const film = smoothstep(0.03, 0.5, m) * 0.4;
        R += (104 - R) * film; G += (80 - G) * film; B += (48 - B) * film;
        const thr = nMudThr[p] / 255;
        const cov = smoothstep(thr - 0.05, thr + 0.05, m);
        let mudSp = 0;
        if (cov > 0) {
          const rel = cov * (0.35 + 0.65 * smoothstep(thr, thr + 0.3, m));
          gx += this.mudX[p] * rel; gy += this.mudY[p] * rel;
          // Thin smears are a translucent orange-brown; thick, wet clumps go near black.
          const lu = nLump[p] / 255;
          const deep = smoothstep(thr - 0.05, thr + 0.25, m + (lu - 0.5) * 0.4);
          const tk = 0.8 + 0.4 * lu;
          let mr = 92 * tk, mg = 62 * tk, mb = 32 * tk;
          mr += (28 + 30 * lu - mr) * deep; mg += (20 + 21 * lu - mg) * deep; mb += (12 + 11 * lu - mb) * deep;
          const sa = (straw[o + 3] / 255) * smoothstep(0.3, 0.75, cov);
          if (sa > 0) { mr += (straw[o] - mr) * sa; mg += (straw[o + 1] - mg) * sa; mb += (straw[o + 2] - mb) * sa; }
          R += (mr - R) * cov; G += (mg - G) * cov; B += (mb - B) * cov;
          mudSp = (mudSpec[p] / 255) * cov * (1 - sa * 0.7);
        }

        // 6. Form: lit from the work lamp, then a waxy sheen on clean horn and
        // wet highlights on manure, fluid and tissue.
        const nl = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * nl, ny = -gy * nl, nz = nl;
        const diff = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
        const sh = Math.max(0.24, Math.min(1.14, 0.2 + (0.8 * diff) / LIGHT[2])) * (c >= 3 ? 0.88 : 1);
        // Horn is translucent, so its shadows warm instead of going grey.
        R *= sh < 1 ? Math.pow(sh, 0.8) : sh; G *= sh; B *= sh < 1 ? Math.pow(sh, 1.2) : sh;
        const nh = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
        const nh4 = nh * nh * nh * nh, nh16 = nh4 * nh4 * nh4 * nh4;
        const clean = (1 - cov) * (c >= 3 ? 0.4 : 1);
        spec += clean * sheen * (30 * nh16 * nh4 + 12 * nh4 * nh4);
        spec += 210 * mudSp + 120 * (mudSpec[p] / 255) * crust * (1 - cov) + 110 * (wetSpec[p] / 255) * wetness;
        spec += (nh16 * nh16 * 170 + nh16 * 25) * cov * (1 - 0.6 * (straw[o + 3] / 255)) + (nh16 * 40 + nh4 * 10) * wetness;
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

// Cubic B-spline weights and their derivatives at fraction t.
function bspline(t, k, dk) {
  const t2 = t * t, t3 = t2 * t, it = 1 - t;
  k[0] = (it * it * it) / 6; k[1] = (3 * t3 - 6 * t2 + 4) / 6;
  k[2] = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6; k[3] = t3 / 6;
  dk[0] = -(it * it) / 2; dk[1] = (3 * t2 - 4 * t) / 2;
  dk[2] = (-3 * t2 + 2 * t + 1) / 2; dk[3] = t2 / 2;
}

// Chaikin corner cutting on a closed polygon.
function smoothPoly(pts, rounds = 3) {
  for (let r = 0; r < rounds; r++) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    pts = out;
  }
  return pts;
}

// In-place separable box blur.
function boxBlur(a, w, h, r) {
  const tmp = new Float32Array(Math.max(w, h));
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[o + Math.max(0, Math.min(w - 1, x))];
    for (let x = 0; x < w; x++) {
      tmp[x] = acc / span;
      acc += a[o + Math.min(w - 1, x + r + 1)] - a[o + Math.max(0, x - r)];
    }
    for (let x = 0; x < w; x++) a[o + x] = tmp[x];
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += a[Math.max(0, Math.min(h - 1, y)) * w + x];
    for (let y = 0; y < h; y++) {
      tmp[y] = acc / span;
      acc += a[Math.min(h - 1, y + r + 1) * w + x] - a[Math.max(0, y - r) * w + x];
    }
    for (let y = 0; y < h; y++) a[y * w + x] = tmp[y];
  }
}

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
  for (let tries = 0; placed < 950 && tries < 20000; tries++) {
    const x = 30 + rand() * 340, y = 160 + rand() * 470;
    const heel = smoothstep(330, 190, y), gap = smoothstep(40, 6, Math.abs(x - GEOM.midX));
    if (rand() > 0.2 + 0.6 * heel + 0.5 * gap) continue;
    placed++;
    const len = 3 + rand() ** 2 * 16;
    const a = rand() * Math.PI;
    // Mostly muted, manure-soaked fibres; a few pale dry stalks stand out.
    const kind = rand();
    const lum = 0.7 + rand() * 0.4;
    const col = kind < 0.3 ? [100, 76, 42] : kind < 0.75 ? [168, 146, 90] : [214, 192, 132];
    c.strokeStyle = `rgb(${col[0] * lum | 0},${col[1] * lum | 0},${col[2] * lum | 0})`;
    c.lineWidth = 0.3 + rand() * 0.6;
    const bend = (rand() - 0.5) * 0.5;
    const strand = (ox, oy) => {
      c.beginPath();
      c.moveTo(x + ox, y + oy);
      c.quadraticCurveTo(
        x + ox + Math.cos(a + bend) * len * 0.5, y + oy + Math.sin(a + bend) * len * 0.5,
        x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len,
      );
    };
    // A soft shadow on the manure, down-right of the strand (the lamp is upper left).
    const lw = c.lineWidth, sc = c.strokeStyle;
    c.strokeStyle = 'rgba(10,6,2,0.55)';
    c.lineWidth = lw * 1.6;
    strand(0.45, 0.6); c.stroke();
    c.strokeStyle = sc; c.lineWidth = lw;
    strand(0, 0); c.stroke();
    // A highlight along the strand.
    c.strokeStyle = 'rgba(255,240,190,0.22)';
    c.lineWidth *= 0.35;
    c.stroke();
  }
  return c.getImageData(0, 0, w, h).data;
}
