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
// Shade curves for the warm shadows (sh^0.8 red, sh^1.2 blue), tabulated over the shade's range.
const SH_LO = 0.2, SH_N = 1024, SH_K = SH_N / (1 - SH_LO);
const SH_R = new Float32Array(SH_N + 2), SH_B = new Float32Array(SH_N + 2);
for (let j = 0; j < SH_N + 2; j++) { const v = SH_LO + j / SH_K; SH_R[j] = v ** 0.8; SH_B[j] = v ** 1.2; }
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

const WEEP = {
  serum: { rgb: [150, 118, 78], a: 0.1, w: 1 },
  pus: { rgb: [178, 164, 104], a: 0.22, w: 1.5 },
  blood: { rgb: [150, 30, 32], a: 0.28, w: 1.1 },
};

const ANG_N = 256;
const COS = new Float32Array(ANG_N), SIN = new Float32Array(ANG_N);
for (let a = 0; a < ANG_N; a++) {
  COS[a] = Math.cos((a / ANG_N) * Math.PI);
  SIN[a] = Math.sin((a / ANG_N) * Math.PI);
}

// Foot rot's heel flush: how near the cleft a pixel is, from a smooth spread of side samples.
const NEAR_TAPS = [4, 8, 12, 16, 20, 24, 28].map((dx) => [dx, 0.5 * Math.exp(-dx / 12)]);

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

  // Everything that depends only on which way round the foot is, in slices: yields its
  // progress 0..1 so a new foot can come up behind a loading bar instead of freezing the game.
  *buildSteps(hoof) {
    this.built = false;
    const { S, w, h, X0, Y0 } = this;
    const n = w * h;
    // Rows per slice: each per-pixel pass hands control back this often.
    const B = 16;
    const bands = function* (lo, hi, pass) {
      for (let y = 0; y < h; y += B) {
        pass(y * w, Math.min(h, y + B) * w);
        yield lo + ((hi - lo) * Math.min(h, y + B)) / h;
      }
    };

    // Rounded outlines: the model's polygons are coarse, and their corners would facet the rim.
    const polys = {
      1: smoothPoly(clawPolygon(CLAW.OUTER, false, hoof.side)), 2: smoothPoly(clawPolygon(CLAW.INNER, false, hoof.side)),
      3: smoothPoly(clawPolygon(CLAW.OUTER, true, hoof.side)), 4: smoothPoly(clawPolygon(CLAW.INNER, true, hoof.side)),
    };
    this.polys = polys;
    const cls = new Uint8Array(n);
    for (const c of [1, 2, 3, 4]) fillPoly(cls, w, h, S, X0, Y0, polys[c], c);
    this.cls = cls;
    yield 0.04;

    // Distance to the outline, per pixel.
    const edge = new Float32Array(n);
    const dome = new Float32Array(n);
    for (const f of outlineDistance(edge, cls, w, h, S, X0, Y0, polys)) yield 0.04 + 0.26 * f;
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      // Dome profile: rises from the rim and flattens over the sole.
      const e = Math.min(1, edge[p] / DOME_R);
      dome[p] = DOME_H * (1 - (1 - e) * (1 - e));
    }
    // Blur the height so the distance field's medial creases don't show in the light,
    // then keep its slope (height per logical px) as each pixel's base normal.
    const br = Math.max(1, Math.round(1.5 * S));
    boxBlur(dome, w, h, br); yield 0.33;
    boxBlur(dome, w, h, br); yield 0.36;
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
    yield 0.4;

    // Static noise fields, read through the claw mask (outside it stays 0 for the rim gradients).
    const nz = noiseFields(S, w, h, X0, Y0, cls);
    for (const f of nz.steps) yield 0.4 + 0.25 * f;
    const { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, lump, wet, glint, nTone, nFleck } = maskFields(nz.fields, cls);
    yield 0.66;
    // Wet specular from micro-normals (pixel gradients) on top of the dome normal.
    const mudSpec = new Uint8Array(n), wetSpec = new Uint8Array(n);
    yield* bands(0.66, 0.84, (a, b) => {
      for (let p = a; p < b; p++) {
        if (!cls[p]) continue;
        const x = p % w, y = (p / w) | 0;
        const pl = x > 0 ? p - 1 : p, pr = x < w - 1 ? p + 1 : p;
        const pu = y > 0 ? p - w : p, pd = y < h - 1 ? p + w : p;
        const broad = specFrom(dnx[p], dny[p], (lump[pr] - lump[pl]) * S * 6, (lump[pd] - lump[pu]) * S * 6, 30);
        const sharp = specFrom(dnx[p], dny[p], (glint[pr] - glint[pl]) * S * 5, (glint[pd] - glint[pu]) * S * 5, 140);
        mudSpec[p] = Math.min(255, broad * 0.3 + sharp * 0.5);
        wetSpec[p] = specFrom(dnx[p], dny[p], (wet[pr] - wet[pl]) * S * 4, (wet[pd] - wet[pu]) * S * 4, 60);
      }
    });
    // Manure relief: lumps at two scales plus fine wet ripples. Its slope tilts the normal,
    // so the lamp itself picks out the clumps and throws glints off their wet crests.
    const mudX = new Float32Array(n), mudY = new Float32Array(n);
    yield* bands(0.84, 0.9, (a, b) => {
      for (let p = a; p < b; p++) {
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
    });
    this.mudX = mudX; this.mudY = mudY;
    const nLump = new Uint8Array(n);
    for (let p = 0; p < n; p++) nLump[p] = clamp255(lump[p] * 255);
    Object.assign(this, { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, nLump, nTone, nFleck, mudSpec, wetSpec });
    // Growth lines follow the outline: static per pixel, so worked out once here.
    const growth = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      if (!cls[p]) continue;
      growth[p] = 1 - 0.025 * Math.sin(edge[p] * 1.3 + (nStain[p] / 255) * 10) + (nGrain[p] / 255 - 0.5) * 0.025;
    }
    this.growth = growth;

    // Straw and fibre strands embedded in the manure.
    this.straw = paintStraw(this, mulberry32(4411));
    yield 0.95;

    // Groove pattern for tool striations: mostly fine lines, the odd deeper score.
    const r2 = mulberry32(77);
    this.hash = new Float32Array(1024);
    for (let k = 0; k < 1024; k++) {
      const v = r2();
      this.hash[k] = v < 0.1 ? -1 : (v - 0.5) * 0.7;
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
    yield 1;
  }

  // Take on a new foot: its cell classes (overgrowth varies cow to cow), fresh state and a
  // full compose, in slices. Yields progress 0..1.
  *adoptSteps(hoof) {
    const { S, w, h, X0, Y0, cls } = this;
    const n = w * h, g = CFG.grid;
    // Cell class: 1/2 live outer/inner, 3/4 overgrown (dead) outer/inner.
    const cc = new Uint8Array(hoof.n);
    for (let i = 0; i < hoof.n; i++) {
      const c = hoof.claw[i];
      cc[i] = c ? c + (hoof.zone[i] & Z.DEAD ? 2 : 0) : 0;
    }
    this.cellCls = cc;
    // Bilinear neighbours: fallback cell for pixels with no same-class neighbour.
    const fallback = new Int32Array(n).fill(-1);
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
          if (d < bestD) { bestD = d; fallback[p] = cy * g.cols + cx; }
        }
      }
    }
    this.fallback = fallback;
    yield 0.12;

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
    // And the toe necrosis's dead horn: the pared pit can only open inside it.
    this.necroF = new Float32Array(hoof.n);
    // And the double sole's false sole: the new sole shows only inside it.
    this.doubleF = new Float32Array(hoof.n);
    // The heel cleft's skin, and the DD patch on it.
    this.cleftF = new Float32Array(hoof.n);
    this.ddF = new Float32Array(hoof.n);
    for (let i = 0; i < hoof.n; i++) {
      this.looseF[i] = hoof.loose[i] ? 1 : 0; this.bloodF[i] = hoof.blood[i];
      this.ulcerF[i] = hoof.looseInit[i] === LOOSE.ULCER ? 1 : 0;
      this.tractF[i] = hoof.looseInit[i] === LOOSE.TRACT ? 1 : 0;
      this.necroF[i] = hoof.looseInit[i] === LOOSE.NECRO ? 1 : 0;
      this.doubleF[i] = hoof.looseInit[i] === LOOSE.DOUBLE ? 1 : 0;
      this.cleftF[i] = hoof.zone[i] & Z.CLEFT ? 1 : 0;
      this.ddF[i] = hoof.zone[i] & Z.DD ? 1 : 0;
    }
    this.isleF = stainIslands(hoof);
    this.mudK = mudBody(hoof);
    // Its thin end per cell, so compose doesn't run the smoothstep per pixel.
    this.mudThin = this.mudK.map((k) => 1 - smoothstep(0.15, 0.55, k));
    this.markT.fill(0);
    this.octx.save();
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.clearRect(0, 0, this.w, this.h);
    this.octx.restore();
    this.drips = [];
    this.bubbles = [];
    this.dirty = null;
    this.rg = null;
    for (let y = 0; y < h; y += 8) {
      this.compose(0, y, w, Math.min(h, y + 8));
      yield 0.12 + (0.88 * Math.min(h, y + 8)) / h;
    }
  }

  // The whole of getting a new foot ready to draw. Yields progress 0..1.
  *prepare(hoof) {
    const split = !this.built || this.builtSide !== hoof.side ? 0.7 : 0;
    if (split) for (const f of this.buildSteps(hoof)) yield f * split;
    for (const f of this.adoptSteps(hoof)) yield split + f * (1 - split);
  }

  // Work toward having `hoof` ready for at most `ms`. Returns progress 0..1; 1 is ready.
  prepareFor(hoof, ms = Infinity) {
    if (hoof === this.hoof && !this.job) return 1;
    if (!this.job || this.jobHoof !== hoof) { this.job = this.prepare(hoof); this.jobHoof = hoof; this.jobP = 0; }
    const end = performance.now() + ms;
    for (;;) {
      const r = this.job.next();
      if (r.done) { this.job = null; return 1; }
      this.jobP = r.value;
      if (performance.now() >= end) return this.jobP;
    }
  }

  // ------------------------------------------------------------- per frame

  // Bring the buffers in line with the simulation; recompose what changed.
  sync(hoof) {
    // A new foot (or one still loading) is finished here in one go if nobody sliced it up.
    if (hoof !== this.hoof || this.job) { this.prepareFor(hoof); return; }
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
    // The disc's rim sweeps arcs that run along the pass, bowing to one side. One centre serves
    // the whole pass, so the arcs run on unbroken from stamp to stamp; a new pass (a jump, a
    // turn, or the arcs swinging too far round the centre) starts a fresh one.
    const ml = Math.hypot(dx, dy) || 1, ux = dx / ml, uy = dy / ml;
    let ax, ay;
    if (type === MARK.GRINDER && moving) {
      const P = this.pass, far = R * ARC_R;
      const keep = P && P.R === R && Math.hypot(cx - P.x, cy - P.y) < R &&
        ux * P.ux + uy * P.uy > 0.75 && Math.abs(Math.hypot(cx - P.ax, cy - P.ay) - far) < R * 1.2;
      if (keep) { P.x = cx; P.y = cy; ax = P.ax; ay = P.ay; }
      else {
        ax = Math.round(cx - uy * far); ay = Math.round(cy + ux * far);
        this.pass = { x: cx, y: cy, ux, uy, ax, ay, R };
      }
    }
    const hoof = this.hoof;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const p = py * w + px;
        const c = cls[p];
        if (!c || c > 2) continue;
        if ((px - cx) ** 2 + (py - cy) ** 2 > R * R) continue;
        if (hoof && ((hoof.block === c) || hoof.wrappedOn(c) > 0)) continue;
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
      // The grinder takes horn cell by cell, and the overlap of its passes leaves rows; a real
      // disc levels as it goes. A 1-2-1 smoothing (rows, then columns) takes out that cell-scale
      // egg-crate and keeps the broad form. The ulcer core keeps its crisp rim.
      const tmp = this.rg.tmp ??= new Float32Array(n);
      const zone = hoof.zone;
      for (const step of [1, cols]) {
        tmp.set(a);
        for (let i = cols; i < n - cols; i++) {
          if (cc[i] !== c || zone[i] & Z.ULCER) continue;
          const l = i - step, r = i + step;
          if (zone[l] & Z.ULCER || zone[r] & Z.ULCER) continue;
          a[i] = 0.25 * tmp[l] + 0.5 * tmp[i] + 0.25 * tmp[r];
        }
      }
    }
    return this.rg;
  }

  compose(x0, y0, x1, y1) {
    const hoof = this.hoof;
    const { S, w, X0, Y0, cls, edge, sx0, sy0, cellCls, fallback } = this;
    const { nMudThr, nStain, nIsle, nCav, nGrain, nStreak, nLump, nTone, nFleck, mudSpec, wetSpec, straw, hash, markT, markA, arcX, arcY, growth, mudX, mudY } = this;
    const g = CFG.grid, cols = g.cols, rows = g.rows, cell = g.cell, gx0 = g.x0;
    const d = this.img.data;
    const { thick, init, mud, rough, tint } = hoof;
    const looseF = this.looseF, bloodF = this.bloodF, ulcerF = this.ulcerF, tractF = this.tractF, isleF = this.isleF, mudK = this.mudK, mudThin = this.mudThin;
    const L = hoof.caseDef.lesion, LH = hoof.caseDef.looseHorn;
    const cleftF = this.cleftF, ddF = this.ddF, DDL = L?.type === 'dd' ? L : null;
    const rot = L?.type === 'footrot';
    const lesionC = L?.claw ?? CLAW.NONE, heelC = LH.claw;
    // The ulcer art keys off dL (distance to the claw's ulcer) and Lr; with no ulcer, dL stays
    // huge. Each claw can carry its own (a J3 pair).
    const ulcerOn = { [CLAW.OUTER]: null, [CLAW.INNER]: null };
    for (const l of hoof.lesions()) if (l.type === 'ulcer') ulcerOn[l.claw] = l;
    // The white-line track's box: pixels outside it skip the per-pixel path distance.
    const T = hoof.lesions().find((l) => l.type === 'whiteline') ?? null;
    const PU = L?.type === 'foreign' ? L : null;
    const NE = L?.type === 'toenecrosis' ? L : null, necroF = this.necroF;
    const DS = L?.type === 'doublesole' ? L : null, doubleF = this.doubleF;
    let tb = null;
    if (T) {
      const K = T.pocket, m = T.w * 2.2, xs = T.path.map((q) => q[0]), ys = T.path.map((q) => q[1]);
      tb = [Math.min(...xs, K.x - K.r * 1.8) - m, Math.min(...ys, K.y - K.r * 1.8) - m,
        Math.max(...xs, K.x + K.r * 1.8) + m, Math.max(...ys, K.y + K.r * 1.8) + m];
    }
    const heelY = GEOM.heelY;
    // A toe-dragger (D26): each claw's lowest dead-toe row, where the tip scuffs on the ground.
    if (this.tipFor !== hoof) {
      this.tipFor = hoof;
      this.tipY = { [CLAW.OUTER]: -1e9, [CLAW.INNER]: -1e9 };
      if (hoof.caseDef.toeDrag) for (let i = 0; i < hoof.n; i++) if (hoof.zone[i] & Z.DEAD) this.tipY[hoof.claw[i]] = Math.max(this.tipY[hoof.claw[i]], hoof.cellY(i));
    }
    const tipY = this.tipY;
    const decoys = (hoof.caseDef.findings ?? []).filter((f) => !hoof.isLesionFinding(f));

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
    // The spline's column weights depend only on the pixel column: worked out once.
    if (!this.kxTab) {
      const kx = new Float32Array(4), kdx = new Float32Array(4);
      this.kxTab = new Float32Array(w * 4); this.kdxTab = new Float32Array(w * 4);
      for (let px = 0; px < w; px++) {
        const fx = (X0 + (px + 0.5) / S - g.x0) / cell - 0.5;
        bspline(fx - Math.floor(fx), kx, kdx);
        this.kxTab.set(kx, px * 4); this.kdxTab.set(kdx, px * 4);
      }
    }
    const kxTab = this.kxTab, kdxTab = this.kdxTab;
    const ky = new Float32Array(4), kdy = new Float32Array(4);
    // Cubic B-spline over the padded relief grid: smooth value and slope (mm per cell). It is
    // separable, so each pixel row first folds the grid's rows down to one value (and its y
    // slope) per cell column, for each claw; a pixel then only blends four columns.
    const colV = { 1: new Float64Array(cols), 2: new Float64Array(cols) };
    const colVy = { 1: new Float64Array(cols), 2: new Float64Array(cols) };
    const cx0 = Math.max(0, Math.floor((X0 + (x0 + 0.5) / S - g.x0) / cell - 0.5) - 1);
    const cx1 = Math.min(cols - 1, Math.floor((X0 + (x1 - 0.5) / S - g.x0) / cell - 0.5) + 2);
    // Decoys this patch can reach.
    const near = (f) => f.x + f.r * 2 > X0 + x0 / S && f.x - f.r * 2 < X0 + x1 / S && f.y + f.r * 2 > Y0 + y0 / S && f.y - f.r * 2 < Y0 + y1 / S;
    const decoysHere = decoys.filter(near);
    // The heel cleft's box (logical px), padded for the bilinear reach and the warped lookup.
    if (this.cleftFor !== hoof) {
      this.cleftFor = hoof;
      const bx = [Infinity, Infinity, -Infinity, -Infinity];
      for (let i = 0; i < hoof.n; i++) {
        if (!cleftF[i]) continue;
        const x = hoof.cellX(i), y = hoof.cellY(i);
        bx[0] = Math.min(bx[0], x); bx[1] = Math.min(bx[1], y); bx[2] = Math.max(bx[2], x); bx[3] = Math.max(bx[3], y);
      }
      const pad = cell * 1.5 + 3;
      this.cleftBox = [bx[0] - pad, bx[1] - pad, bx[2] + pad, bx[3] + pad];
    }
    const cb = this.cleftBox;

    for (let py = y0; py < y1; py++) {
      const ly = Y0 + (py + 0.5) / S;
      const fy = (ly - g.y0) / cell - 0.5;
      const iy = Math.floor(fy), ty = fy - iy;
      bspline(ty, ky, kdy);
      for (const c of [1, 2]) {
        const a = RG[c], cv = colV[c], cvy = colVy[c];
        const r0 = Math.max(0, Math.min(rows - 1, iy - 1)) * cols, r1 = Math.max(0, Math.min(rows - 1, iy)) * cols;
        const r2 = Math.max(0, Math.min(rows - 1, iy + 1)) * cols, r3 = Math.max(0, Math.min(rows - 1, iy + 2)) * cols;
        for (let x = cx0; x <= cx1; x++) {
          const q0 = a[r0 + x], q1 = a[r1 + x], q2 = a[r2 + x], q3 = a[r3 + x];
          cv[x] = ky[0] * q0 + ky[1] * q1 + ky[2] * q2 + ky[3] * q3;
          cvy[x] = kdy[0] * q0 + kdy[1] * q1 + kdy[2] * q2 + kdy[3] * q3;
        }
      }
      for (let px = x0; px < x1; px++) {
        const p = py * w + px, o = p * 4;
        const c = cls[p];
        if (!c) { d[o + 3] = 0; continue; }
        const lx = X0 + (px + 0.5) / S;
        const fx = (lx - gx0) / cell - 0.5;
        const ix = Math.floor(fx), tx = fx - ix;

        // Bilinear weights over neighbouring cells of the same class.
        const b = iy * cols + ix;
        // Per-pixel locals (not closure-captured), so each field read below stays cheap.
        let i0 = b, i1 = b + 1, i2 = b + cols, i3 = b + cols + 1, w0, w1, w2, w3;
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

        const t = (thick[i0] * w0 + thick[i1] * w1 + thick[i2] * w2 + thick[i3] * w3), m = (mud[i0] * w0 + mud[i1] * w1 + mud[i2] * w2 + mud[i3] * w3);
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
          const kept = t / Math.max(0.5, (init[i0] * w0 + init[i1] * w1 + init[i2] * w2 + init[i3] * w3));
          const tear = 0.5 + (ncv - 0.5) * 0.7 + (ngr - 0.5) * 0.18;
          if (kept < tear) { d[o + 3] = 0; continue; }
          // Kept dark and cool (slate-brown) so it reads against the warm straw floor.
          const layer = 0.5 + 0.5 * Math.sin(e * 1.15 + ns * 9);
          R = 78 - 22 * layer + 16 * ngr; G = 70 - 20 * layer + 14 * ngr; B = 62 - 14 * layer + 12 * ngr;
          if (e < 1.6) { R *= 0.35; G *= 0.35; B *= 0.38; }
          else if (e < wallW) { R *= 0.6; G *= 0.6; B *= 0.62; }
          else if (e < wallW + 1.5) { R += 26; G += 24; B += 22; }
          // Dragged along the ground, the tip wears square: dusty pale horn, scored lengthwise.
          // The rounded tip is ground off flat, a little ragged, with a dark worn lip along the cut.
          const cut = tipY[c - 2] - 12 + (ngr - 0.5) * 1.6 + (ns - 0.5) * 1.2;
          if (ly > cut) { d[o + 3] = 0; continue; }
          const scuff = smoothstep(cut - 26 + 8 * ns, cut - 8, ly);
          if (scuff > 0) {
            const score = 1 + 0.2 * (ncv - 0.5) + 0.14 * (ngr - 0.5) - (nFleck[p] > 232 ? 0.35 : 0);
            const k = scuff * 0.95;
            R += (212 * score - R) * k; G += (200 * score - G) * k; B += (174 * score - B) * k;
            sheen *= 1 - 0.9 * scuff; // ground matte
            if (cut - ly < 1.6) { R *= 0.55; G *= 0.53; B *= 0.5; }
          }
          // Where the jaws went through, the fresh cross-section shows paler horn.
          if (kept < 0.97) {
            const face = smoothstep(tear + 0.16, tear + 0.03, kept);
            R += (150 + 20 * ngr - R) * face; G += (136 + 18 * ngr - G) * face; B += (108 + 14 * ngr - B) * face;
          }
        } else {
          const ti = (init[i0] * w0 + init[i1] * w1 + init[i2] * w2 + init[i3] * w3), r = (rough[i0] * w0 + rough[i1] * w1 + rough[i2] * w2 + rough[i3] * w3);
          const removed = ti - t;
          {
            const cv = colV[c], cvy = colVy[c], k4 = px * 4;
            let vx = 0, vy = 0;
            for (let i = 0; i < 4; i++) {
              const col = Math.max(0, Math.min(cols - 1, ix - 1 + i));
              vx += kdxTab[k4 + i] * cv[col]; vy += kxTab[k4 + i] * cvy[col];
            }
            gx += (vx / cell) * RELIEF;
            gy += (vy / cell) * RELIEF;
          }
          sheen = 1 - 0.6 * r;
          const UL = ulcerOn[c], Lr = UL ? UL.r : 0;
          const dL = UL ? Math.sqrt((lx - UL.x) * (lx - UL.x) + (ly - UL.y) * (ly - UL.y)) : 1e9;
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
          const gl = growth[p];
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
              // Fades on a broad, round noise: the streak field runs lengthwise and would chop the
              // arcs into columns across a sideways pass (a woven look).
              const fade = 0.3 + 0.7 * smoothstep(0.3, 0.7, ns);
              const hv = hash[ring & 1023];
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
            const fall = (1 - dL / (Lr * 4.2)) * (ly > UL.y - Lr * 0.5 ? 1 : 0.45);
            const br = smoothstep(0.5, 0.78, nStreak[p] / 255) * fall * 0.8;
            R += (222 - R) * br; G += (112 - G) * br; B += (124 - B) * br;
          }

          // Decoys: a reddish bruise in the horn, or a dark stain like the ulcer's, without the
          // hole. Both are surface marks that trimming takes off (DECOY_DEPTH).
          for (let k = 0; k < decoysHere.length; k++) {
            const f = decoysHere[k];
            if (f.claw !== c) continue;
            const dd = Math.sqrt((lx - f.x) * (lx - f.x) + (ly - f.y) * (ly - f.y));
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
            lf = (looseF[i0] * w0 + looseF[i1] * w1 + looseF[i2] * w2 + looseF[i3] * w3);
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
            // Low spots keep their stain through a level pass: small pockets from the noise, and
            // the cow's big islands, whose edge the noise breaks up.
            const ni = nIsle[p] / 255;
            const isl = isleF[i0] * w0 + isleF[i1] * w1 + isleF[i2] * w2 + isleF[i3] * w3;
            const isle = 0.6 * smoothstep(0.66, 0.82, ni) + (isl > 0.01 ? Math.max(0, isl + (ni - 0.5) * 2.4 * Math.min(1, isl) + (ncv - 0.5) * 0.6) : 0);
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
              // An island the grinder skimmed past is darker still: packed, wet manure in the hollow.
              const res = Math.max(smoothstep(0.58, 0.8, ni + (nLump[p] / 255 - 0.5) * 0.35),
                smoothstep(0.4, 1.4, isle - removed) * smoothstep(0.3, 1.4, removed) * (0.75 + 0.25 * (nLump[p] / 255)));
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
              // Nothing like the pared sole round it: raw, wet tissue, angry red at the centre and
              // bruised brown toward the rim, where flaps of undermined horn still hang over.
              // Noise contours, not rings, so no two pockets match.
              const ls = nStreak[p] / 255;
              const raw = smoothstep(1.35, 0.35, u + (ncv - 0.5) * 0.45);
              let cr = 112 + 64 * raw - 22 * ngr, cg = 58 - 4 * raw - 14 * ngr, cb = 48 - 12 * ngr;
              // Granulation: pebbly knots of brighter red over the core.
              const knot = smoothstep(0.62, 0.78, ngr) * raw;
              cr += 46 * knot; cg += 10 * knot; cb += 8 * knot;
              // Yellow-grey pus pooled in the low spots, thinning toward the centre.
              const pus = smoothstep(0.32, 0.18, ncv) * (1 - 0.6 * raw);
              cr += (198 - cr) * pus * 0.85; cg += (182 - cg) * pus * 0.85; cb += (112 - cb) * pus * 0.85;
              // Undermined horn at the rim: pale flaps with dark gaps under them.
              const flap = smoothstep(0.5, 0.62, ncv * 0.7 + ls * 0.3) * smoothstep(0.75, 1.3, u);
              cr += (218 - cr) * flap * 0.75; cg += (196 - cg) * flap * 0.75; cb += (160 - cb) * flap * 0.75;
              const gap = smoothstep(0.42, 0.5, ncv * 0.7 + ls * 0.3) * (1 - flap) * smoothstep(0.8, 1.3, u);
              cr *= 1 - 0.45 * gap; cg *= 1 - 0.5 * gap; cb *= 1 - 0.5 * gap;
              // Walls: the rim of horn on the lamp side overhangs the hole and shades it,
              // while the far wall faces the lamp and shows a band of pale cut horn.
              const sh = looseAt(lx - 1.7, ly - 2.4);
              const dk = (1 - 0.55 * sh) * (0.8 + 0.2 * Math.min(1, u));
              cr *= dk; cg *= dk; cb *= dk;
              const fw = smoothstep(0.35, 0.8, looseAt(lx + 1.3, ly + 1.8)) * (1 - sh);
              cr += (236 - 10 * ngr - cr) * fw * 0.8; cg += (206 - 10 * ngr - cg) * fw * 0.8; cb += (186 - 8 * ngr - cb) * fw * 0.8;
              // Antiseptic pools in the crevices and stains the rest only faintly.
              const tn = (tint[i0] * w0 + tint[i1] * w1 + tint[i2] * w2 + tint[i3] * w3) * (0.18 + 0.7 * smoothstep(0.5, 0.25, ncv));
              cr += (96 - cr) * tn * 0.75; cg += (196 - cg) * tn * 0.75; cb += (164 - cb) * tn * 0.75;
              R += (cr - R) * open; G += (cg - G) * open; B += (cb - B) * open;
              wetness = Math.max(wetness, open);
              // A lifted flap edge catches the light on the horn side of the rim.
              if (open > 0.05 && open < 0.5) { R += 30 * (1 - open); G += 28 * (1 - open); B += 22 * (1 - open); }
            }
          }

          // Puncture: a crisp, too-regular dark dot or ruled line with a glint of whatever went
          // in; opened, a pale funnel stepping down to grey pus on the mark.
          if (c === lesionC && PU && Math.abs(lx - PU.x) < PU.pocket.r * 2 && Math.abs(ly - PU.y) < PU.pocket.r * 2) {
            const K = PU.pocket, dP = Math.hypot(lx - K.x, ly - K.y);
            const dM = PU.shape === 'line' ? distToPath(lx, ly, [PU.a, PU.b]).d - PU.w * 0.6 : Math.hypot(lx - PU.x, ly - PU.y) - PU.r;
            // How closed the puncture's own horn is here: the loose field blends with sound horn
            // at its rim, so read it against the tract's footprint.
            const lf = Math.min(1, (looseF[i0] * w0 + looseF[i1] * w1 + looseF[i2] * w2 + looseF[i3] * w3) / Math.max(0.05, (tractF[i0] * w0 + tractF[i1] * w1 + tractF[i2] * w2 + tractF[i3] * w3)));
            const mark = smoothstep(0.5, -0.5, dM) * lf;
            const pool = smoothstep(K.r * 1.2, K.r * 0.4, dP) * 0.1 * lf;
            R *= 1 - pool; G *= 1 - pool; B *= 1 - pool * 0.8;
            // A thin pale rim of horn pushed in at the edge: it keeps the shape crisp on a dark,
            // stained sole, where a plain dark mark would sink into the stains.
            const rim = smoothstep(1.8, 0.7, dM) * smoothstep(-0.1, 0.6, dM) * lf * 0.55;
            if (rim > 0) { R += (206 - R) * rim; G += (186 - G) * rim; B += (148 - B) * rim; }
            if (mark > 0) {
              R += (22 - R) * mark; G += (18 - G) * mark; B += (16 - B) * mark;
              const glint = PU.shape === 'line' ? smoothstep(0.9, 0.97, ngr) * smoothstep(-0.4, -1.2, dM)
                : smoothstep(1.3, 0.3, Math.hypot(lx - PU.x + 1.5, ly - PU.y + 1.5));
              spec += 80 * glint * mark;
            }
            const tf = fieldAt(tractF, lx + (nIsle[p] / 255 - 0.5) * 3, ly + (nStain[p] / 255 - 0.5) * 3);
            const open = smoothstep(0.65, 0.25, lf) * smoothstep(0.25, 0.55, tf);
            if (open > 0) {
              // Paler toward the rim, shadowed as it steps down, grey pus at the bottom on the mark.
              const down = smoothstep(K.r, 0, dP);
              let cr = 230 - 40 * down - 8 * ngr, cg = 212 - 44 * down - 8 * ngr, cb = 178 - 40 * down - 6 * ngr;
              const pus = smoothstep(1.5, -0.5, dM) * (0.75 + 0.3 * ncv);
              cr += (78 - cr) * pus; cg += (74 - cg) * pus; cb += (64 - cb) * pus;
              R += (cr - R) * open; G += (cg - G) * open; B += (cb - B) * open;
              wetness = Math.max(wetness, open * (0.3 + 0.6 * pus));
            }
          }

          // Toe necrosis: black, crumbling dead horn at the toe tip, cracked and flaking at its
          // ragged edge; pared out, a pit of clean pale horn, shadowed where it steps down.
          if (c === lesionC && NE && Math.abs(lx - NE.x) < NE.r * 1.6 && Math.abs(ly - NE.y) < NE.r * 1.6) {
            // Read the loose field against the patch's own footprint, warped so its edge is ragged.
            const wx = (nIsle[p] / 255 - 0.5) * 6, wy = (nStain[p] / 255 - 0.5) * 6;
            const nf = fieldAt(necroF, lx + wx, ly + wy);
            const lf = Math.min(1, fieldAt(looseF, lx + wx, ly + wy) / Math.max(0.05, nf));
            const inside = smoothstep(0.3 + 0.2 * ncv, 0.6 + 0.2 * ncv, nf);
            const dead = inside * smoothstep(0.35, 0.65, lf);
            if (dead > 0) {
              // Near-black, a little green-grey where it crumbles, with paler flecks of dry crust.
              const crumb = smoothstep(0.55, 0.8, ngr);
              let cr = 30 + 18 * crumb, cg = 28 + 18 * crumb, cb = 24 + 12 * crumb;
              const fleck = smoothstep(0.93, 0.98, ngr) * smoothstep(0.4, 0.7, ncv);
              cr += (112 - cr) * fleck; cg += (104 - cg) * fleck; cb += (86 - cb) * fleck;
              // Cracks run through it on the noise contours.
              const crack = smoothstep(0.03, 0, Math.abs(ncv - 0.5)) * 0.8;
              cr *= 1 - crack; cg *= 1 - crack; cb *= 1 - crack;
              // A dark, damp rim where the rot meets sound horn.
              const rim = smoothstep(0.55, 0.3, nf) * 0.5;
              cr *= 1 - rim; cg *= 1 - rim; cb *= 1 - rim;
              R += (cr - R) * dead; G += (cg - G) * dead; B += (cb - B) * dead;
              wetness = Math.max(wetness, dead * 0.25 * (1 - crumb));
              crust = Math.max(crust, dead * 0.6);
            }
            const open = inside * smoothstep(0.65, 0.35, lf);
            if (open > 0) {
              // Healthy horn underneath: pale and clean, darker toward the pit's walls on the lamp side.
              let cr = 226 - 14 * ngr, cg = 204 - 12 * ngr, cb = 164 - 10 * ngr;
              const sh = (1 - smoothstep(0.3, 0.7, fieldAt(necroF, lx - 1.7, ly - 2.4))) * 0.35;
              const wall = smoothstep(0.75, 0.45, nf) * 0.3;
              const k = 1 - sh - wall;
              cr *= k; cg *= k; cb *= k;
              // A few grey specks of dead horn left in the grain.
              const left = smoothstep(0.95, 0.99, ngr) * 0.6;
              cr += (60 - cr) * left; cg += (56 - cg) * left; cb += (50 - cb) * left;
              R += (cr - R) * open; G += (cg - G) * open; B += (cb - B) * open;
            }
          }

          // Double sole: a layer of old sole lifting off the new one. Chalky, dull and flaky, its
          // toe-side edge lifted into a pale lip over a dark gap that shadows the sole below it.
          // Pared off, the new sole under it: paler, smoother, a little waxy.
          if (c === lesionC && DS && Math.abs(lx - DS.x) < DS.r * 1.5 && Math.abs(ly - DS.y) < DS.r * 1.5) {
            const wx = (nIsle[p] / 255 - 0.5) * 7, wy = (nStain[p] / 255 - 0.5) * 7;
            const ft = 0.5 + (ncv - 0.5) * 0.3;
            // How much false sole is on at a point: its footprint, times its own loose field.
            const onAt = (ax, ay) => {
              const df = fieldAt(doubleF, ax, ay);
              return smoothstep(ft - 0.06, ft + 0.06, df) * smoothstep(0.35, 0.65, Math.min(1, fieldAt(looseF, ax, ay) / Math.max(0.05, df)));
            };
            const df = fieldAt(doubleF, lx + wx, ly + wy);
            const inside = smoothstep(ft - 0.06, ft + 0.06, df);
            const on = onAt(lx + wx, ly + wy);
            // The edge lifts most on the toe side, a ragged stretch of it.
            const lift = smoothstep(DS.y - DS.r * 0.1, DS.y + DS.r * 0.9, ly + (ncv - 0.5) * 14);
            // The lifted lip throws a shadow down and right (lamp at upper left) into the gap.
            const by = onAt(lx + wx - 2.2, ly + wy - 3.4);
            const shade = by * (1 - on) * (0.25 + 0.5 * lift);
            R *= 1 - shade; G *= 1 - shade; B *= 1 - shade * 0.9;
            if (on > 0) {
              // Old, dried sole: the sole's own tone and stains, dulled and greyed toward chalk.
              const lum = (R + G + B) / 3;
              let cr = R + (lum * 1.06 + 36 - R) * 0.45, cg = G + (lum * 1.02 + 32 - G) * 0.45, cb = B + (lum * 0.9 + 20 - B) * 0.45;
              // Flaky layers: terraces of the cavity noise, lit from the upper left, so each
              // flake has a pale edge facing the lamp and a dark one away from it.
              const off = Math.max(1, Math.round(1.4 * S)) * (w + 1);
              const nUL = nCav[Math.max(0, p - off)] / 255, nDR = nCav[Math.min(nCav.length - 1, p + off)] / 255;
              const q = (v) => Math.floor(v * 7 + (ngr - 0.5) * 0.6);
              const emb = Math.max(-1, Math.min(1, (q(ncv) - q(nUL)) - (q(ncv) - q(nDR)) * 0.5));
              const fl = emb > 0 ? 30 * emb : 20 * emb;
              cr += fl; cg += fl * 0.95; cb += fl * 0.8;
              // A few flakes already curling up: a brighter, drier scale with a fine dark crack.
              const curl = smoothstep(0.72, 0.8, ngr) * smoothstep(0.55, 0.7, ncv) * 0.5;
              cr += (lum + 46 - cr) * curl; cg += (lum + 40 - cg) * curl; cb += (lum + 22 - cb) * curl;
              const crack = smoothstep(0.03, 0, Math.abs(ncv - 0.5)) * 0.45;
              cr *= 1 - crack; cg *= 1 - crack; cb *= 1 - crack * 0.9;
              // The rim of the layer, where it has lifted: a thin pale lip catching the lamp,
              // a dark gap just inside it.
              const rimB = smoothstep(ft + 0.3, ft + 0.06, df) * inside;
              const lip = smoothstep(0.55, 0.95, rimB) * lift;
              cr += (lum + 70 - cr) * lip * 0.75; cg += (lum + 62 - cg) * lip * 0.75; cb += (lum + 40 - cb) * lip * 0.75;
              const gap = smoothstep(0.15, 0.5, rimB) * smoothstep(0.85, 0.55, rimB) * lift * 0.45;
              cr *= 1 - gap; cg *= 1 - gap; cb *= 1 - gap;
              // Where it still lies flat, the layer's edge melts into the sole.
              const lay = on * (0.55 + 0.4 * Math.max(lift, smoothstep(0.1, 0.6, 1 - rimB)));
              R += (cr - R) * lay; G += (cg - G) * lay; B += (cb - B) * lay;
              crust = Math.max(crust, on * 0.5);
              sheen = Math.min(sheen, 1 - 0.5 * on);
              gy -= 0.6 * lip * on;
            }
            const open = inside * (1 - smoothstep(0.35, 0.65, Math.min(1, fieldAt(looseF, lx + wx, ly + wy) / Math.max(0.05, df))));
            if (open > 0) {
              // The new sole: a shade paler and cleaner than the old, finer-grained, a little waxy.
              R += (R + 14 - 4 * ngr - R) * open * 0.6; G += (G + 12 - 4 * ngr - G) * open * 0.6; B += (B + 8 - 4 * ngr - B) * open * 0.6;
              sheen = Math.max(sheen, 1 + 0.2 * open);
            }
          }

          // White-line abscess: a dark seam of packed grit in the white line, the pared groove
          // that follows it in from the wall, and the drained pocket at its end.
          if (T && c === T.claw && lx > tb[0] && lx < tb[2] && ly > tb[1] && ly < tb[3]) {
            const dT = distToPath(lx, ly, T.path).d, K = T.pocket, dP = Math.hypot(lx - K.x, ly - K.y);
            const lf = (looseF[i0] * w0 + looseF[i1] * w1 + looseF[i2] * w2 + looseF[i3] * w3);
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
          const cf = lx < cb[0] || lx > cb[2] || ly < cb[1] || ly > cb[3] ? 0
            : smoothstep(0.25, 0.75, fieldAt(cleftF, lx + (nIsle[p] / 255 - 0.5) * 4, ly + (nStain[p] / 255 - 0.5) * 4));
          if (cf > 0) {
            const k = cf * 0.55;
            R += (172 + 16 * ngr - R) * k; G += (134 + 12 * ngr - G) * k; B += (120 + 10 * ngr - B) * k;
            // Digital dermatitis: a raw, strawberry-red patch, pitted with pale dots, inside a rim
            // of thickened greyish-white skin. The spray stains it teal.
            // Foot rot: the skin has split down the cleft into a grey, moist, foul crack on both
            // claws. The spray stains it teal.
            if (rot) {
              // Inflamed red at the margin, grey dead skin inside, a dark wet crack along the edge.
              const u = cf + (ncv - 0.5) * 0.35;
              const split = smoothstep(0.5, 0.85, u);
              const margin = smoothstep(0.25, 0.5, u) * (1 - split);
              let cr = 116 - 22 * ncv + 10 * ngr, cg = 106 - 18 * ncv + 8 * ngr, cb = 96 - 12 * ncv + 6 * ngr;
              const crack = smoothstep(5 + 3 * ncv, 1, e) * split;
              cr += (52 - cr) * crack; cg += (42 - cg) * crack; cb += (38 - cb) * crack;
              const tn = (tint[i0] * w0 + tint[i1] * w1 + tint[i2] * w2 + tint[i3] * w3) * 0.7;
              cr += (62 - cr) * tn; cg += (158 - cg) * tn; cb += (146 - cb) * tn;
              R += (cr - R) * split; G += (cg - G) * split; B += (cb - B) * split;
              const mk = margin * 0.8 * (1 - 0.6 * tn);
              R += (196 - R) * mk; G += (84 - G) * mk; B += (78 - B) * mk;
              wetness = Math.max(wetness, split * (0.25 + 0.45 * crack));
              sheen = Math.min(sheen, 1 - 0.6 * split);
            }
            if (DDL && c === DDL.claw) {
              const u = Math.hypot((lx - DDL.x) / (DDL.r * 0.75), (ly - DDL.y) / (DDL.r * 1.05)) + (ncv - 0.5) * 0.25;
              const on = smoothstep(0.3, 0.6, fieldAt(ddF, lx, ly)) * cf;
              const raw = smoothstep(0.92, 0.78, u) * on;
              const rim = smoothstep(0.7, 0.9, u) * smoothstep(1.2, 0.98, u) * on;
              if (raw + rim > 0) {
                let cr = 196 - 30 * ncv, cg = 44 + 16 * ncv, cb = 50 + 12 * ncv;
                const dot = smoothstep(0.72, 0.86, ngr) * 0.7;
                cr += (238 - cr) * dot; cg += (162 - cg) * dot; cb += (150 - cb) * dot;
                const tn = (tint[i0] * w0 + tint[i1] * w1 + tint[i2] * w2 + tint[i3] * w3) * 0.7;
                cr += (62 - cr) * tn; cg += (158 - cg) * tn; cb += (146 - cb) * tn;
                R += (cr - R) * raw; G += (cg - G) * raw; B += (cb - B) * raw;
                R += (232 - R) * rim * 0.8; G += (226 - G) * rim * 0.8; B += (212 - B) * rim * 0.8;
                wetness = Math.max(wetness, raw * 0.9);
              }
            }
          }

          // Foot rot: the bulbs either side of the cleft are swollen and angry, flushed red-pink
          // where they bulge in toward the split. The spray takes the edge off the flush.
          if (rot && heel > 0) {
            let near = 0;
            for (const [dx, wt] of NEAR_TAPS) near += (fieldAt(cleftF, lx - dx, ly) + fieldAt(cleftF, lx + dx, ly)) * wt;
            near = Math.min(1, near);
            const k = heel * (0.18 + 0.4 * near) * (1 - 0.5 * (tint[i0] * w0 + tint[i1] * w1 + tint[i2] * w2 + tint[i3] * w3)) * (0.85 + 0.3 * ncv) * (1 - cf);
            R += (200 - R) * k; G += (104 - G) * k; B += (92 - B) * k;
            sheen = Math.max(sheen, 1 + 0.4 * near * heel);
          }

          // Light spray tint on the horn.
          const tn = (tint[i0] * w0 + tint[i1] * w1 + tint[i2] * w2 + tint[i3] * w3);
          if (tn > 0.01 && dL > Lr * 1.6) {
            const k = tn * 0.16;
            R += (140 - R) * k; G += (206 - G) * k; B += (184 - B) * k;
          }

          // Loose, undermined heel horn: a lifted, curling flake of old stained horn. Its outline
          // is read through a warped lookup so it tears raggedly instead of tracing cells; the
          // free toe-side edge stands proud, catching the lamp and shadowing the sole below.
          if (c === heelC) {
            const dH = Math.sqrt((lx - LH.x) * (lx - LH.x) + (ly - LH.y) * (ly - LH.y));
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
          const bl = (bloodF[i0] * w0 + bloodF[i1] * w1 + bloodF[i2] * w2 + bloodF[i3] * w3);
          if (bl > 0.2) {
            const k = smoothstep(0.2, 0.6, bl);
            R += (166 - R) * k; G += (12 - G) * k; B += (24 - B) * k;
            wetness = Math.max(wetness, k);
          }
        }

        // 5. Manure and straw on top. A film lingers even after the clumps go.
        // How thick the cake is here: thin smears let the horn through, thick clumps stand proud.
        const mk = m > 0 ? mudK[i0] * w0 + mudK[i1] * w1 + mudK[i2] * w2 + mudK[i3] * w3 : 0;
        const film = smoothstep(0.03, 0.5, m) * (0.25 + 0.2 * mk);
        R += (104 - R) * film; G += (80 - G) * film; B += (48 - B) * film;
        const thr = nMudThr[p] / 255 + 0.55 * Math.max(0, 0.32 - mk);
        // A thin smear is translucent and broken: grit and fibre specks stay opaque and dark.
        const thin = m > 0 ? mudThin[i0] * w0 + mudThin[i1] * w1 + mudThin[i2] * w2 + mudThin[i3] * w3 : 0;
        const spk = thin > 0 ? smoothstep(0.5, 0.72, nLump[p] / 255 + (ngr - 0.5) * 0.35) * thin : 0;
        const cov = smoothstep(thr - 0.05, thr + 0.05, m) * (1 - 0.45 * thin * (1 - spk));
        let mudSp = 0;
        if (cov > 0) {
          const rel = cov * (0.35 + 0.65 * smoothstep(thr, thr + 0.3, m)) * (0.35 + 0.95 * mk);
          gx += mudX[p] * rel; gy += mudY[p] * rel;
          // Thin smears are a translucent orange-brown; thick, wet clumps go near black.
          const lu = nLump[p] / 255;
          const deep = smoothstep(thr - 0.05, thr + 0.25, m + (lu - 0.5) * 0.4 + (mk - 0.55) * 0.7) * (1 - spk) + spk * 0.85;
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
        if (sh < 1) {
          const u = (sh - SH_LO) * SH_K, j = u | 0, tu = u - j;
          R *= SH_R[j] + (SH_R[j + 1] - SH_R[j]) * tu; G *= sh; B *= SH_B[j] + (SH_B[j + 1] - SH_B[j]) * tu;
        } else { R *= sh; G *= sh; B *= sh; }
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

  // The weeping hole: fluid runs toward the toe and bubbles froth at the opening. `kind` sets
  // the fluid: the serous weep, thick yellow-grey pus as the cap gives, or blood from raw tissue.
  weep(x, y, amount = 1, kind = 'serum') {
    const col = WEEP[kind] ?? WEEP.serum;
    for (let k = 0; k < Math.round(6 * amount); k++) {
      this.bubbles.push({
        x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 5,
        r: 0.8 + Math.random() * 2.6, life: 1 + Math.random() * 2.5, t: 0, ph: Math.random() * 6,
      });
    }
    for (let k = 0; k < Math.max(1, Math.round(1.5 * amount)); k++) {
      this.drips.push({
        x: x + (Math.random() - 0.5) * 4, y, vx: (Math.random() - 0.5) * 4, vy: 18 + Math.random() * 20,
        life: 2.5 + Math.random() * 2, w: (1.2 + Math.random() * 1.6) * col.w, col: col.rgb, a: col.a,
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

// The static noise fields don't depend on the foot, only on where the pixels are, so they're
// kept for the session and filled in as claw pixels first need them: a foot on the other side
// only pays for the pixels the last one didn't cover. Logical-space frequencies, so they
// scale with S.
let NOISE = null;
// Low spots in the sole that a level grinder skims over: a few patches per claw, placed per cow,
// where the manure stain soaked in deeper (mm). Biased toward the axial half, where the sole
// dishes. Kept off the wall and off any lesion's own horn. Visual only: the thickness the game
// scores doesn't know about them.
function stainIslands(hoof) {
  const n = hoof.n, out = new Float32Array(n);
  const rand = mulberry32(((hoof.caseDef.seed ?? 214) * 7919 + 31) >>> 0);
  for (const c of [CLAW.OUTER, CLAW.INNER]) {
    let axMax = 0, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (hoof.claw[i] !== c || hoof.edge[i] < 10) continue;
      axMax = Math.max(axMax, Math.abs(hoof.cellX(i) - GEOM.midX));
      y0 = Math.min(y0, hoof.cellY(i)); y1 = Math.max(y1, hoof.cellY(i));
    }
    if (!axMax) continue;
    const blobs = [];
    for (let k = 2 + Math.floor(rand() * 3); k > 0; k--) {
      const ax = 14 + (axMax - 14) * Math.pow(rand(), 1.6) * 0.75;
      blobs.push({
        ax, y: Math.max(GEOM.heelY + 6, y0 + 20) + (Math.min(y1 - 30, 520) - Math.max(GEOM.heelY + 6, y0 + 20)) * rand(),
        rx: 6 + 9 * rand(), ry: 12 + 22 * rand(), depth: 3.4 + 1.8 * rand(), tilt: (rand() - 0.5) * 0.6,
        ph: rand() * 6.28,
      });
    }
    for (let i = 0; i < n; i++) {
      if (hoof.claw[i] !== c || hoof.edge[i] < 9 || hoof.looseInit[i] || (hoof.zone[i] & Z.DEAD)) continue;
      const ax = Math.abs(hoof.cellX(i) - GEOM.midX), y = hoof.cellY(i);
      let v = 0;
      for (const b of blobs) {
        const dx = ax - b.ax - (y - b.y) * b.tilt, dy = y - b.y;
        // A lobed outline, so no patch is a plain ellipse.
        const a = Math.atan2(dy / b.ry, dx / b.rx);
        const r2 = (dx * dx) / (b.rx * b.rx) + (dy * dy) / (b.ry * b.ry);
        const lobe = 1 + 0.22 * Math.sin(3 * a + b.ph) + 0.12 * Math.sin(5 * a - b.ph);
        const t = 1 - r2 / (lobe * lobe);
        if (t > 0) v = Math.max(v, b.depth * Math.min(1, t * 1.6));
      }
      out[i] = v;
    }
  }
  return out;
}

// How thickly the manure is caked on, 0..1, at a large scale and per cow: thick clumps toward
// the heel and the gap, thinner smears elsewhere, and a few spots where tan horn shows through.
let MUD_N = null;
function mudBody(hoof) {
  MUD_N ??= valueNoise(mulberry32(5023));
  const n = hoof.n, out = new Float32Array(n), seed = hoof.caseDef.seed ?? 214;
  const ox = (seed * 37.1) % 211, oy = (seed * 19.7) % 197;
  for (let i = 0; i < n; i++) {
    if (!hoof.claw[i]) continue;
    const x = hoof.cellX(i), y = hoof.cellY(i);
    const heelness = smoothstep(330, 200, y), gapness = smoothstep(30, 6, Math.abs(x - GEOM.midX) - 7);
    const v = fbm(MUD_N, x / 34 + ox, y / 46 + oy, 3);
    out[i] = Math.max(0, Math.min(1, 0.5 + (v - 0.5) * 2.4 + 0.35 * Math.max(heelness, gapness) + 0.06));
  }
  return out;
}

function noiseFields(S, w, h, X0, Y0, cls) {
  const n = w * h;
  if (!NOISE || NOISE.S !== S || NOISE.w !== w || NOISE.h !== h) {
    const rand = mulberry32(9137);
    const N1 = valueNoise(rand), N2 = valueNoise(rand), N3 = valueNoise(rand);
    const N4 = valueNoise(rand), N5 = valueNoise(rand), N6 = valueNoise(rand);
    const N7 = valueNoise(rand), N8 = valueNoise(rand);
    NOISE = {
      S, w, h, N: [N1, N2, N3, N4, N5, N6, N7, N8], done: new Uint8Array(n),
      f: {
        nMudThr: new Uint8Array(n), nStain: new Uint8Array(n), nCav: new Uint8Array(n),
        nGrain: new Uint8Array(n), nStreak: new Uint8Array(n), nIsle: new Uint8Array(n),
        lump: new Float32Array(n), wet: new Float32Array(n), glint: new Float32Array(n),
        nTone: new Uint8Array(n), nFleck: new Uint8Array(n),
      },
    };
  }
  const { done, f } = NOISE;
  const [N1, N2, N3, N4, N5, N6, N7, N8] = NOISE.N;
  // The fields come back at once; `steps` fills them in, a band of rows per step (0..1).
  const steps = function* () {
    for (let y0 = 0; y0 < h; y0 += 16) {
      const p1 = Math.min(h, y0 + 16) * w;
      for (let p = y0 * w; p < p1; p++) {
        if (!cls[p] || done[p]) continue;
        done[p] = 1;
        const lx = X0 + ((p % w) + 0.5) / S, ly = Y0 + (Math.floor(p / w) + 0.5) / S;
        // Manure clings thickest toward the heel and in the interdigital gap.
        const heelness = smoothstep(300, 195, ly);
        const gapness = smoothstep(26, 6, Math.abs(lx - GEOM.midX) - 7);
        const thr = Math.max(0.18, 0.12 + 0.8 * fbm(N1, lx / 13, ly / 13, 4) - 0.16 * (heelness + gapness));
        f.nMudThr[p] = clamp255(thr * 255);
        f.nStain[p] = clamp255(fbm(N2, lx / 21, ly / 21, 4) * 255);
        f.nIsle[p] = clamp255(fbm(N6, lx / 15, ly / 26, 3) * 255);
        f.nCav[p] = clamp255(fbm(N3, lx / 4.5, ly / 4.5, 3) * 255);
        f.nGrain[p] = clamp255((N4(lx * 1.3, ly * 1.3) * 0.55 + hash01(p) * 0.45) * 255);
        f.nStreak[p] = clamp255(fbm(N5, lx / 1.4, ly / 10, 3) * 255);
        f.lump[p] = fbm(N5, lx / 2.4 + 91, ly / 2.4, 3);
        f.wet[p] = fbm(N3, lx / 3.2 + 40, ly / 3.2, 2);
        // Fine wet bumps on the manure: each crest throws a small sharp glint.
        f.glint[p] = fbm(N8, lx / 0.9, ly / 0.9, 2);
        // Broad peach/cream mottling in the horn, as in a waxy, translucent material.
        f.nTone[p] = clamp255(fbm(N7, lx / 34, ly / 40, 3) * 255);
        // Sparse dark flecks of grit pressed into the sole.
        f.nFleck[p] = clamp255(N7(lx * 1.9 + 300, ly * 1.9) * 255);
      }
      yield p1 / n;
    }
  };
  return { fields: f, steps: steps() };
}

// Copies of the fields with everything off the claws zeroed.
function maskFields(f, cls) {
  const out = {};
  for (const [k, src] of Object.entries(f)) {
    const a = new src.constructor(src.length);
    for (let p = 0; p < src.length; p++) if (cls[p]) a[p] = src[p];
    out[k] = a;
  }
  return out;
}

// Per-pixel white noise in 0..1, the same for a pixel whichever foot is drawn.
function hash01(p) {
  let x = Math.imul(p ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

// Distance (logical px) from each classed pixel to its own claw's outline. Brute force is
// every pixel against every segment, seconds on a phone, so pixels are taken in tiles: a
// segment further from the tile centre than the nearest one plus the tile's diameter can't be
// nearest to any pixel in it. Same per-segment maths as the brute force, so the same result.
const TILE = 8;
function* outlineDistance(edge, cls, w, h, S, X0, Y0, polys) {
  // Segments as flat arrays: start, direction, 1/|dir|².
  const segs = {};
  for (const c of [1, 2, 3, 4]) {
    const pts = polys[c], m = pts.length;
    const s = { m, ax: new Float64Array(m), ay: new Float64Array(m), ex: new Float64Array(m), ey: new Float64Array(m), d: new Float64Array(m), near: new Int32Array(m) };
    for (let i = 0, j = m - 1; i < m; j = i++) {
      const [ax, ay] = pts[j], [qx, qy] = pts[i];
      s.ax[i] = ax; s.ay[i] = ay; s.ex[i] = qx - ax; s.ey[i] = qy - ay;
    }
    segs[c] = s;
  }
  const segDist2 = (s, i, lx, ly) => {
    const ax = s.ax[i], ay = s.ay[i], ex = s.ex[i], ey = s.ey[i];
    const t = Math.max(0, Math.min(1, ((lx - ax) * ex + (ly - ay) * ey) / (ex * ex + ey * ey)));
    return (lx - ax - t * ex) ** 2 + (ly - ay - t * ey) ** 2;
  };
  const r = (TILE * Math.SQRT1_2) / S; // tile centre to corner pixel centre, logical px (generous)
  for (let ty = 0; ty < h; ty += TILE) {
    for (let tx = 0; tx < w; tx += TILE) {
      const x1 = Math.min(w, tx + TILE), y1 = Math.min(h, ty + TILE);
      const cx = X0 + (tx + x1) / 2 / S, cy = Y0 + (ty + y1) / 2 / S;
      for (const c of [1, 2, 3, 4]) {
        // Only claws with a pixel in this tile.
        let any = false;
        for (let y = ty; y < y1 && !any; y++) for (let x = tx; x < x1; x++) if (cls[y * w + x] === c) { any = true; break; }
        if (!any) continue;
        const s = segs[c];
        let dmin = Infinity;
        for (let i = 0; i < s.m; i++) { s.d[i] = Math.sqrt(segDist2(s, i, cx, cy)); if (s.d[i] < dmin) dmin = s.d[i]; }
        const cut = dmin + 2 * r + 1e-6;
        let k = 0;
        for (let i = 0; i < s.m; i++) if (s.d[i] <= cut) s.near[k++] = i;
        for (let y = ty; y < y1; y++) {
          const ly = Y0 + (y + 0.5) / S;
          for (let x = tx; x < x1; x++) {
            const p = y * w + x;
            if (cls[p] !== c) continue;
            const lx = X0 + (x + 0.5) / S;
            let best = Infinity;
            for (let q = 0; q < k; q++) { const d = segDist2(s, s.near[q], lx, ly); if (d < best) best = d; }
            edge[p] = Math.sqrt(best);
          }
        }
      }
    }
    yield Math.min(h, ty + TILE) / h;
  }
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
