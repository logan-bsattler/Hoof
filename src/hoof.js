// The hoof model: a grid of cells over a two-claw hind foot (sole view).
// Pure data + geometry — no DOM, so it can be unit-tested in Node.

import { CFG } from './config.js';
// Seeded PRNG so hoofs (and tests) are reproducible.
import { mulberry32, smoothstep } from './noise.js';

// Zone bit flags per cell.
export const Z = {
  LIVE: 1,     // part of the living claw (has corium underneath)
  DEAD: 2,     // overgrown dead toe horn — safe to remove entirely
  WALL: 4,     // hoof wall rim
  WL: 8,       // white line (visual only)
  HEEL: 16,    // heel bulb — don't trim
  DISH: 32,    // where the step-3 dish should be modelled
  TRI: 64,     // toe triangle — protected weight-bearing horn
  ULCER: 128,  // lesion core: corium sits just under the surface
};

export const CLAW = { NONE: 0, OUTER: 1, INNER: 2 };
export const CLAW_NAME = { 1: 'outer', 2: 'inner' };

// Loose-horn groups.
export const LOOSE = { NONE: 0, ULCER: 1, HEEL: 2 };

const MID_X = 200;

// How deep (mm) a decoy mark goes into the horn before trimming takes it off.
export const DECOY_DEPTH = { stain: 1, bruise: 2.5 }; // centre line between the claws

// Zone boundaries in view coords. The foot is presented the way a trimmer sees it in the
// chute: sole facing the camera, heel bulbs at the top (toward the leg), toes pointing down.
export const GEOM = {
  midX: MID_X,
  heelY: 258,              // above this line: heel bulb
  dishY0: 275, dishY1: 470, dishW: 46, // dish channel along the axial wall
  triY: 480, triW: 34,     // below this line, near the axial wall: toe triangle
  toeRamp: [450, 580],     // overgrowth thickens toward the toe
  overgrowY: 480,          // overgrown toe horn extends below this line
};

// Inner (medial) claw outline in view coords, drawn on the viewer's right; the other side is its mirror.
// Heel bulb at the top, toe at the bottom, axial wall facing the centre line.
const INNER_PTS = [
  [222, 585], [210, 540], [207, 460], [207, 360], [210, 280],
  [218, 220], [245, 188], [285, 182], [320, 200], [340, 235],
  [350, 300], [352, 370], [342, 450], [320, 515], [290, 560], [255, 582],
];

// Which side of the screen a claw sits on: +1 right, -1 left. On a left hind foot (sole up,
// toes down) the outer claw is on the viewer's left; a right hind foot is the mirror image.
export function clawSide(claw, side = 'LH') {
  return (claw === CLAW.INNER) === (side !== 'RH') ? 1 : -1;
}

// Map an x drawn for the right-hand claw onto `claw`'s actual side.
export function onClaw(claw, side = 'LH') {
  return clawSide(claw, side) > 0 ? (x) => x : (x) => CFG.view.w - x;
}

export function clawPolygon(claw, overgrown = false, side = 'LH') {
  let pts = INNER_PTS.map(([x, y]) => [x, y]);
  if (overgrown) {
    // Stretch the toe forward (down) and curl it slightly toward the axial side.
    pts = pts.map(([x, y]) => {
      if (y <= GEOM.overgrowY) return [x, y];
      const t = (y - GEOM.overgrowY) / 105;
      return [x - 6 * t * t, y + 40 * t];
    });
  }
  const mx = onClaw(claw, side);
  return pts.map(([x, y]) => [mx(x), y]);
}

// The front edge of the living toe: the "trim to here" line.
export function toeLine(claw, side = 'LH') {
  const mx = onClaw(claw, side);
  return INNER_PTS.filter(([, y]) => y > 510).map(([x, y]) => [mx(x), y]).sort((a, b) => a[0] - b[0]);
}

// Bounding box of a claw's living outline.
export function clawBox(claw, side = 'LH') {
  const pts = clawPolygon(claw, false, side);
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
  return { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
}

// Where a horizontal line at y crosses a claw outline: [left x, right x], or null.
export function clawSpan(claw, y, side = 'LH') {
  const pts = clawPolygon(claw, false, side);
  const xs = [];
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
  }
  return xs.length ? [Math.min(...xs), Math.max(...xs)] : null;
}

// The step-3 dish channel along a claw's axial wall, as a rect: the Z.DISH band, inset.
export function dishRect(claw, side = 'LH') {
  const s = clawSide(claw, side);
  const a = MID_X + s * 12, b = MID_X + s * (8 + GEOM.dishW);
  return { x: Math.min(a, b), y: GEOM.dishY0, w: Math.abs(b - a), h: GEOM.dishY1 - GEOM.dishY0 };
}

// The claw without the lesion: it carries the block.
export function soundClaw(caseDef) {
  return caseDef.lesion.claw === CLAW.OUTER ? CLAW.INNER : CLAW.OUTER;
}

// "outer (left)": a claw's name and where it sits on screen, for coaching copy.
export function clawWhere(claw, side = 'LH') {
  return `${CLAW_NAME[claw]} (${clawSide(claw, side) > 0 ? 'right' : 'left'})`;
}

export function axialDist(x) {
  return Math.abs(x - MID_X) - 8;
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToPoly(x, y, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// True when (x, y) sits inside a claw's living outline, at least `margin` px in from its edge.
export function insideClaw(claw, x, y, side = 'LH', margin = 0) {
  const pts = clawPolygon(claw, false, side);
  return pointInPoly(x, y, pts) && distToPoly(x, y, pts) >= margin;
}

function smoothNoise(x, y) {
  return (
    Math.sin(x * 0.13 + 1.7) * Math.sin(y * 0.11 + 0.3) +
    Math.sin(x * 0.37 + y * 0.29) * 0.5 +
    Math.sin(x * 0.05 - y * 0.07 + 2) * 0.7
  ) / 2.2;
}

export class Hoof {
  constructor(caseDef, seed = caseDef.seed ?? 214) {
    this.caseDef = caseDef;
    this.side = caseDef.side ?? 'LH';
    this.g = CFG.grid;
    const n = this.g.cols * this.g.rows;
    this.n = n;
    this.claw = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.thick = new Float32Array(n);
    this.init = new Float32Array(n);
    this.mud = new Float32Array(n);
    this.rough = new Float32Array(n);
    this.loose = new Uint8Array(n);
    this.looseInit = new Uint8Array(n);
    this.blood = new Uint8Array(n);
    this.tint = new Float32Array(n); // antiseptic spray soaked into the tissue, 0..1
    this.edge = new Float32Array(n);
    this.noise = new Float32Array(n);
    this.block = CLAW.NONE;
    this.wrap = 0;              // 0 bare, 1 padded, 2 padded and wrapped
    this.wrapClaw = CLAW.NONE;
    this.rand = mulberry32(seed);
    this.build();
  }

  cellX(i) { return this.g.x0 + ((i % this.g.cols) + 0.5) * this.g.cell; }
  cellY(i) { return this.g.y0 + (Math.floor(i / this.g.cols) + 0.5) * this.g.cell; }

  cellAt(x, y) {
    const cx = Math.floor((x - this.g.x0) / this.g.cell);
    const cy = Math.floor((y - this.g.y0) / this.g.cell);
    if (cx < 0 || cy < 0 || cx >= this.g.cols || cy >= this.g.rows) return -1;
    const i = cy * this.g.cols + cx;
    return this.claw[i] ? i : -1;
  }

  // Visit every hoof cell within radius r of (x, y); fn(i, falloff 0..1).
  stamp(x, y, r, fn) {
    const { x0, y0, cell, cols, rows } = this.g;
    const c0 = Math.max(0, Math.floor((x - r - x0) / cell));
    const c1 = Math.min(cols - 1, Math.floor((x + r - x0) / cell));
    const r0 = Math.max(0, Math.floor((y - r - y0) / cell));
    const r1 = Math.min(rows - 1, Math.floor((y + r - y0) / cell));
    for (let cy = r0; cy <= r1; cy++) {
      for (let cx = c0; cx <= c1; cx++) {
        const i = cy * cols + cx;
        if (!this.claw[i]) continue;
        const d = Math.hypot(x0 + (cx + 0.5) * cell - x, y0 + (cy + 0.5) * cell - y);
        if (d > r) continue;
        fn(i, 1 - (d / r) ** 2);
      }
    }
  }

  build() {
    const { target: T, heel } = CFG.sole;
    const cd = this.caseDef;
    const polys = [CLAW.OUTER, CLAW.INNER].map((c) => ({
      c, live: clawPolygon(c, false, this.side), over: clawPolygon(c, true, this.side),
    }));

    for (let i = 0; i < this.n; i++) {
      const x = this.cellX(i), y = this.cellY(i);
      const nz = smoothNoise(x, y);
      this.noise[i] = nz * 0.6 + (this.rand() - 0.5) * 0.8;

      for (const p of polys) {
        if (pointInPoly(x, y, p.live)) {
          this.claw[i] = p.c;
          this.zone[i] |= Z.LIVE;
          this.edge[i] = distToPoly(x, y, p.live);
          break;
        }
        if (pointInPoly(x, y, p.over)) {
          this.claw[i] = p.c;
          this.zone[i] |= Z.DEAD;
          break;
        }
      }
      const c = this.claw[i];
      if (!c) continue;

      const excess = cd.excess[c];
      this.mud[i] = Math.min(1, 0.78 + 0.22 * nz + this.rand() * 0.12);

      if (this.zone[i] & Z.DEAD) {
        this.thick[i] = T + excess + 2.5 + nz * 0.5;
        this.rough[i] = 0.8;
      } else {
        const ax = axialDist(x);
        if (this.edge[i] < 6) this.zone[i] |= Z.WALL;
        else if (this.edge[i] < 8.5) this.zone[i] |= Z.WL;

        if (y < GEOM.heelY) this.zone[i] |= Z.HEEL;
        else if (y >= GEOM.dishY0 && y <= GEOM.dishY1 && ax < GEOM.dishW && !(this.zone[i] & Z.WALL)) this.zone[i] |= Z.DISH;
        if (y > GEOM.triY && ax < GEOM.triW) this.zone[i] |= Z.TRI;

        if (this.zone[i] & Z.HEEL) {
          this.thick[i] = heel + nz * 0.2;
          this.rough[i] = 0.1;
        } else {
          this.thick[i] = T + excess + 2.2 * smoothstep(GEOM.toeRamp[0], GEOM.toeRamp[1], y) + nz * 0.35;
          this.rough[i] = 0.5;
        }
      }
    }

    // Lesion: a core of exposed corium hidden under a cap of loose horn.
    const L = cd.lesion;
    this.stampExact(L.x, L.y, L.r * 1.75, (i, d) => {
      if (!(this.zone[i] & Z.LIVE) || this.claw[i] !== L.claw) return;
      this.zone[i] &= ~Z.DISH;
      this.loose[i] = this.looseInit[i] = LOOSE.ULCER;
      if (d <= L.r) {
        this.zone[i] |= Z.ULCER;
        this.thick[i] = 2.0;
      }
    });

    // A curl of loose, undermined heel horn for step 5.
    const H = cd.looseHorn;
    this.stampExact(H.x, H.y, H.r, (i) => {
      if (!(this.zone[i] & Z.LIVE) || this.claw[i] !== H.claw) return;
      this.loose[i] = this.looseInit[i] = LOOSE.HEEL;
    });

    this.init.set(this.thick);
  }

  stampExact(x, y, r, fn) {
    this.stamp(x, y, r, (i) => fn(i, Math.hypot(this.cellX(i) - x, this.cellY(i) - y)));
  }

  zoneTarget(i) {
    const z = this.zone[i];
    if (z & Z.ULCER) return Infinity; // any cut into the ulcer core is resisted
    if (z & Z.HEEL) return CFG.sole.heel;
    if (z & Z.DISH) return CFG.sole.dishTarget;
    return CFG.sole.target;
  }

  // The tester-readable mark (ulcer or decoy) covering cell i, if any.
  findingAt(i) {
    const x = this.cellX(i), y = this.cellY(i);
    return (this.caseDef.findings ?? []).find((f) =>
      f.claw === this.claw[i] && Math.hypot(x - f.x, y - f.y) <= f.r * (f.kind === 'ulcer' ? 1.75 : 1.3)) ?? null;
  }

  // What the hoof testers report at cell i. `finding` is the mark it read, if any.
  probe(i, diagnosed) {
    if (i < 0) return { kind: 'none', text: 'Tap the hoof with the testers.' };
    const z = this.zone[i];
    if (this.mud[i] > 0.35) return { kind: 'dirty', text: "Too dirty to read. Clean it first." };
    if (z & Z.DEAD) return { kind: 'dead', text: 'Dead, overgrown toe horn: safe to nip off.' };
    if (this.looseInit[i] === LOOSE.ULCER) {
      const finding = this.caseDef.findings?.find((f) => f.kind === 'ulcer') ?? null;
      return diagnosed
        ? { kind: 'lesion', finding, text: 'The ulcer. Open it up and keep weight off it.' }
        : { kind: 'lesion', finding, text: 'It springs under the testers. Something soft under there.' };
    }
    // Decoys sit in the surface horn: once it's trimmed away there is nothing left to read.
    const f = this.findingAt(i);
    if (f && f.kind !== 'ulcer' && this.init[i] - this.thick[i] < DECOY_DEPTH[f.kind]) {
      return { kind: f.kind, finding: f, text: f.probeText };
    }
    if (this.looseInit[i] === LOOSE.HEEL && this.loose[i]) {
      return { kind: 'loose', text: 'Loose, undermined heel horn. Flick it off with the knife.' };
    }
    if (z & Z.HEEL) return { kind: 'heel', text: 'Heel bulb. Leave it be.' };
    const t = this.thick[i];
    if (t < CFG.sole.thin) {
      return { kind: 'thin', text: `Flexes under pressure: only ${t.toFixed(1)} mm left. Stop cutting here.` };
    }
    return { kind: 'firm', text: `Firm, healthy horn. ${t.toFixed(1)} mm of sole.` };
  }

  // One pass over the grid: everything the steps tracker and scorer need.
  // Where she stands on the trimmed foot: 1 for each cell touching the floor, else 0.
  // With a block on, only the blocked claw bears weight, flat across its sole and dish. Otherwise each claw
  // bears on horn within CFG.contact.band of its highest sole cell. The opened ulcer, the dish and
  // the heel bulb are off the floor.
  contactMap() {
    const n = this.thick.length;
    const out = new Float32Array(n);
    const bears = (i) => (this.zone[i] & Z.LIVE) && !(this.zone[i] & (Z.DEAD | Z.DISH | Z.HEEL | Z.ULCER))
      && this.looseInit[i] !== LOOSE.ULCER && this.thick[i] > 0.05;
    const top = { [CLAW.OUTER]: 0, [CLAW.INNER]: 0 };
    for (let i = 0; i < n; i++) if (bears(i)) top[this.claw[i]] = Math.max(top[this.claw[i]], this.thick[i]);
    for (let i = 0; i < n; i++) {
      const c = this.claw[i];
      if (this.block) {
        out[i] = c === this.block && (this.zone[i] & Z.LIVE) && !(this.zone[i] & (Z.DEAD | Z.HEEL)) ? 1 : 0;
        continue;
      }
      if (!bears(i)) continue;
      else out[i] = this.thick[i] >= top[c] - CFG.contact.band ? 1 : 0;
    }
    return out;
  }

  metrics() {
    const { target: T, dishTarget: D, thin } = CFG.sole;
    const acc = () => ({ wbSum: 0, wbN: 0, dishSum: 0, dishN: 0, deadN: 0, deadLeft: 0 });
    const claws = { [CLAW.OUTER]: acc(), [CLAW.INNER]: acc() };
    const m = {
      claws, mudSum: 0, liveN: 0, roughSum: 0, roughN: 0,
      looseN: { 1: 0, 2: 0 }, looseLeft: { 1: 0, 2: 0 }, tintSum: 0,
      thinCells: 0, overWB: 0, wbN: 0, overDish: 0, dishN: 0,
      triCut: 0, triN: 0, heelRemoved: 0, heelN: 0, blood: 0,
    };

    for (let i = 0; i < this.n; i++) {
      const c = this.claw[i];
      if (!c) continue;
      const z = this.zone[i];
      const k = claws[c];
      const t = this.thick[i];

      if (z & Z.DEAD) {
        k.deadN++;
        if (t > 0.05) k.deadLeft++;
        continue;
      }

      m.liveN++;
      m.mudSum += this.mud[i];
      if (this.blood[i]) m.blood++;

      const lg = this.looseInit[i];
      if (lg) {
        m.looseN[lg]++;
        if (this.loose[i]) m.looseLeft[lg]++;
        if (lg === LOOSE.ULCER) m.tintSum += this.tint[i];
      }

      if (z & Z.ULCER) continue;
      // Horn under the block can't be rasped, and no longer needs to be.
      if (!(z & Z.HEEL) && !(this.block && c === this.block)) {
        m.roughSum += this.rough[i];
        m.roughN++;
      }
      if (t < thin) m.thinCells++;

      if (z & Z.HEEL) {
        if (lg !== LOOSE.HEEL) {
          m.heelRemoved += Math.max(0, this.init[i] - t);
          m.heelN++;
        }
      } else if (z & Z.DISH) {
        k.dishSum += t; k.dishN++;
        m.dishN++;
        if (t < D - 1.25) m.overDish++;
      } else if (!lg) {
        k.wbSum += t; k.wbN++;
        m.wbN++;
        if (t < T - 1.25) m.overWB++;
        if (z & Z.TRI) {
          m.triN++;
          if (t < T - 0.75) m.triCut++;
        }
      }
    }

    for (const c of [CLAW.OUTER, CLAW.INNER]) {
      const k = claws[c];
      k.wbMean = k.wbN ? k.wbSum / k.wbN : 0;
      k.dishMean = k.dishN ? k.dishSum / k.dishN : 0;
      k.deadRemain = k.deadN ? k.deadLeft / k.deadN : 0;
    }
    m.mudMean = m.liveN ? m.mudSum / m.liveN : 0;
    m.roughMean = m.roughN ? m.roughSum / m.roughN : 0;
    m.looseRemain = {
      1: m.looseN[1] ? m.looseLeft[1] / m.looseN[1] : 0,
      2: m.looseN[2] ? m.looseLeft[2] / m.looseN[2] : 0,
    };
    // How well the opened ulcer has been flushed with the spray (0..1).
    m.lesionTint = m.looseN[LOOSE.ULCER] ? m.tintSum / m.looseN[LOOSE.ULCER] : 0;
    m.levelDiff = claws[CLAW.INNER].wbMean - claws[CLAW.OUTER].wbMean;
    m.heelRemovedMean = m.heelN ? m.heelRemoved / m.heelN : 0;
    return m;
  }
}
