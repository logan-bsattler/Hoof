// The hoof model: a grid of cells over a two-claw hind foot (sole view).
// Pure data + geometry — no DOM, so it can be unit-tested in Node.

import { CFG } from './config.js';

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

const MID_X = 200; // centre line between the claws

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

// Inner (medial) claw outline in view coords; the outer claw is its mirror.
// Heel bulb at the top, toe at the bottom, axial wall facing the centre line.
const INNER_PTS = [
  [222, 585], [210, 540], [207, 460], [207, 360], [210, 280],
  [218, 220], [245, 188], [285, 182], [320, 200], [340, 235],
  [350, 300], [352, 370], [342, 450], [320, 515], [290, 560], [255, 582],
];

export function clawPolygon(claw, overgrown = false) {
  let pts = INNER_PTS.map(([x, y]) => [x, y]);
  if (overgrown) {
    // Stretch the toe forward (down) and curl it slightly toward the axial side.
    pts = pts.map(([x, y]) => {
      if (y <= GEOM.overgrowY) return [x, y];
      const t = (y - GEOM.overgrowY) / 105;
      return [x - 6 * t * t, y + 40 * t];
    });
  }
  if (claw === CLAW.OUTER) pts = pts.map(([x, y]) => [CFG.view.w - x, y]);
  return pts;
}

// The front edge of the living toe: the "trim to here" line.
export function toeLine(claw) {
  const pts = INNER_PTS.filter(([, y]) => y > 510);
  pts.sort((a, b) => a[0] - b[0]);
  return claw === CLAW.OUTER ? pts.map(([x, y]) => [CFG.view.w - x, y]) : pts;
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

// Deterministic PRNG so hoofs (and tests) are reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothNoise(x, y) {
  return (
    Math.sin(x * 0.13 + 1.7) * Math.sin(y * 0.11 + 0.3) +
    Math.sin(x * 0.37 + y * 0.29) * 0.5 +
    Math.sin(x * 0.05 - y * 0.07 + 2) * 0.7
  ) / 2.2;
}

const smoothstep = (e0, e1, v) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export class Hoof {
  constructor(caseDef, seed = 214) {
    this.caseDef = caseDef;
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
      c, live: clawPolygon(c), over: clawPolygon(c, true),
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

  // What the hoof testers report at cell i.
  probe(i, diagnosed) {
    if (i < 0) return { kind: 'none', text: 'Tap the hoof with the testers.' };
    const z = this.zone[i];
    if (this.mud[i] > 0.35) return { kind: 'dirty', text: "Too dirty to read. Clean it first." };
    if (z & Z.DEAD) return { kind: 'dead', text: 'Dead, overgrown toe horn: safe to nip off.' };
    if (this.looseInit[i] === LOOSE.ULCER) {
      return diagnosed
        ? { kind: 'lesion', text: 'The ulcer. Open it up and keep weight off it.' }
        : { kind: 'lesion', text: 'It springs under the testers. Something soft under there.' };
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
      if (!(z & Z.HEEL)) {
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
