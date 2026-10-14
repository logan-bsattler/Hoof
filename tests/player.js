// A DOM-free "careful hand": drives the real tools over a hoof the way a steady player would.
// Used by the playthrough test (can the tools reach Textbook without blood?) and by the art lab.

import { Z, LOOSE, GEOM, clawBox, clawSide } from '../src/hoof.js';
import { CFG } from '../src/config.js';
import { applyStroke, applyGrind, applyBite, applySpray } from '../src/tools.js';

const DT = 1 / 60;

// opts.onStamp(tool, x, y, dx, dy): after every tool stamp (the art lab marks its overlay here).
// opts.onEvent(ev, tool, x, y): every events object the tools return.
// opts.onAction(): after each drag or nip pass (the art lab syncs its buffers here).
// opts.knife: the blade in hand, { sand, wear } (WP12.4). The bot takes a fresh one past 0.6 wear
// and counts the swaps in knife.swaps.
export function makePlayer(hoof, opts = {}) {
  const { onStamp, onEvent, onAction, knife = null } = opts;
  const L = hoof.caseDef.lesion;
  const emit = (ev, tool, x, y) => { if (onEvent) onEvent(ev, tool, x, y); return ev; };

  // A careful hand keeps the grinder disc off the ulcer: that's knife work.
  const discTouchesUlcer = (x, y) => hoof.lesions().some((U) => U.type === 'ulcer' &&
    Math.hypot(x - U.x, y - U.y) < U.r * 1.75 + CFG.tools.grinder.radius);

  const p = {
    hoof,
    // Drag a tool along a polyline at a steady speed (px/s), like a player would. When the
    // ulcer cap gives, the knife comes off the foot (main.js popCap) and the drag ends there.
    drag(tool, pts, speed = 160) {
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(len / (speed * DT)));
        let px = ax, py = ay;
        for (let j = 1; j <= steps; j++) {
          const x = ax + ((bx - ax) * j) / steps, y = ay + ((by - ay) * j) / steps;
          const dx = x - px, dy = y - py;
          // The grinder and knife lift off once the horn under them is at target. Loose horn
          // still wants the knife; the grinder just levels over the white-line track.
          const i = hoof.cellAt(x, y);
          const settled = i >= 0 && (!hoof.loose[i] || (tool === 'grinder' && (hoof.looseInit[i] === LOOSE.TRACT || hoof.looseInit[i] === LOOSE.NECRO || hoof.looseInit[i] === LOOSE.DOUBLE)));
          const done = settled && (tool === 'grinder' || tool === 'knife') &&
            hoof.thick[i] <= hoof.zoneTarget(i) + 0.4;
          if (done || (tool === 'grinder' && discTouchesUlcer(x, y))) { px = x; py = y; continue; }
          let ev;
          if (tool === 'grinder') ev = applyGrind(hoof, x, y, DT);
          else if (tool === 'spray') ev = applySpray(hoof, x, y, DT);
          else {
            if (tool === 'knife' && knife?.wear > 0.6) { knife.wear = 0; knife.swaps = (knife.swaps ?? 0) + 1; }
            ev = applyStroke(hoof, tool, x, y, Math.hypot(dx, dy), knife);
          }
          emit(ev, tool, x, y);
          if (onStamp) onStamp(tool, x, y, dx, dy);
          px = x; py = y;
          if (ev.capPop) { if (onAction) onAction(); return p; }
        }
      }
      if (onAction) onAction();
      return p;
    },
    brushAll() {
      for (let y = 180; y < 640; y += 14) p.drag('brush', [[30, y], [370, y + 6], [30, y + 12]], 900);
      return p;
    },
    // Nip each column from the tip back, stopping before the jaws' core would reach live horn.
    // With a claw given, only that claw's columns (deep sepsis: the sound claw only).
    nip(claw = null) {
      const core = CFG.tools.nippers.radius * CFG.tools.nippers.liveCore;
      const touchesLive = (x, y) => {
        let live = false;
        hoof.stamp(x, y, core, (i) => { if (!(hoof.zone[i] & Z.DEAD)) live = true; });
        return live;
      };
      const xs = [158, 242, 128, 272, 100, 300, 190, 210, 80, 320, 70, 330, 112, 288, 143, 257, 174, 226];
      for (const x of claw ? xs.filter((x) => Math.sign(x - GEOM.midX) === clawSide(claw, hoof.side)) : xs) {
        for (let y = 640; y >= 520 && !touchesLive(x, y); y -= 6) {
          emit(applyBite(hoof, x, y), 'nippers', x, y);
          if (onStamp) onStamp('nippers', x, y, 0, 0);
        }
      }
      if (onAction) onAction();
      return p;
    },
    // Sweeping grinder passes over one claw, rows top to bottom, like 0:35-1:15.
    grind(claw, y0 = 270, y1 = 580, passes = 3) {
      // Across the claw, axial wall to abaxial wall, inset from both.
      const b = clawBox(claw, hoof.side);
      const [xa, xb] = [b.x + 15, b.x + b.w - 15];
      for (let q = 0; q < passes; q++) {
        const off = q * 5;
        for (let y = y0 + off; y < y1; y += 14) {
          p.drag('grinder', [[xa, y], [xb, y - 10], [xa, y + 7]], 190);
        }
      }
      return p;
    },
    // White-line abscess: pare along the dark line from where it meets the wall, in short pulls,
    // then work round the pocket at its end until it drains.
    followTrack(T = L) {
      const P = T.path, K = T.pocket;
      p.drag('knife', P, 60);
      p.drag('knife', [P[P.length - 1], [K.x, K.y]], 60);
      for (let a = 0; a < 12; a++) {
        const t = (a / 12) * 2 * Math.PI, r = K.r * 0.6;
        p.drag('knife', [[K.x, K.y], [K.x + r * Math.cos(t), K.y + r * Math.sin(t)]], 60);
      }
      return p;
    },
    // Toe necrosis: tiny knife pulls on each still-black cell, so the healthy toe round it is spared.
    necro() {
      for (let i = 0; i < hoof.n; i++) {
        if (hoof.looseInit[i] !== LOOSE.NECRO || !hoof.loose[i]) continue;
        const x = hoof.cellX(i), y = hoof.cellY(i);
        p.drag('knife', [[x - 1, y], [x + 1, y]], 40);
      }
      return p;
    },
    // Double sole: knife pulls across the false sole, row by row, until it's lifted all over.
    pareSole() {
      const step = CFG.tools.knife.radius * 0.8;
      for (let dy = -L.r; dy <= L.r; dy += step) {
        const h = Math.sqrt(Math.max(0, L.r * L.r - dy * dy)) + 2;
        p.drag('knife', [[L.x - h, L.y + dy], [L.x + h, L.y + dy]], 90);
      }
      return p;
    },
    // Puncture: pare straight down on the mark, then widen in short pulls from its centre,
    // a ring at a time, until it drains. Never wider than the pocket.
    funnel() {
      const K = L.pocket;
      if (L.shape === 'line') p.drag('knife', [L.a, L.b, L.a], 50);
      else p.drag('knife', [[L.x - 2, L.y], [L.x + 2, L.y], [L.x - 2, L.y]], 40);
      for (const r of [K.r * 0.45, K.r * 0.8]) {
        for (let a = 0; a < 12 && !hoof.drained; a++) {
          const t = (a / 12) * 2 * Math.PI;
          p.drag('knife', [[K.x, K.y], [K.x + r * Math.cos(t), K.y + r * Math.sin(t)]], 50);
        }
      }
      return p;
    },
  };
  return p;
}
