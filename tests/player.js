// A DOM-free "careful hand": drives the real tools over a hoof the way a steady player would.
// Used by the playthrough test (can the tools reach Textbook without blood?) and by the art lab.

import { Z, clawBox } from '../src/hoof.js';
import { CFG } from '../src/config.js';
import { applyStroke, applyGrind, applyBite, applySpray } from '../src/tools.js';

const DT = 1 / 60;

// opts.onStamp(tool, x, y, dx, dy): after every tool stamp (the art lab marks its overlay here).
// opts.onEvent(ev, tool, x, y): every events object the tools return.
// opts.onAction(): after each drag or nip pass (the art lab syncs its buffers here).
export function makePlayer(hoof, opts = {}) {
  const { onStamp, onEvent, onAction } = opts;
  const L = hoof.caseDef.lesion;
  const emit = (ev, tool, x, y) => { if (onEvent) onEvent(ev, tool, x, y); return ev; };

  // A careful hand keeps the grinder disc off the ulcer: that's knife work.
  const discTouchesUlcer = (x, y) =>
    Math.hypot(x - L.x, y - L.y) < L.r * 1.75 + CFG.tools.grinder.radius;

  const p = {
    hoof,
    // Drag a tool along a polyline at a steady speed (px/s), like a player would.
    drag(tool, pts, speed = 160) {
      for (let k = 1; k < pts.length; k++) {
        const [ax, ay] = pts[k - 1], [bx, by] = pts[k];
        const len = Math.hypot(bx - ax, by - ay);
        const steps = Math.max(1, Math.ceil(len / (speed * DT)));
        let px = ax, py = ay;
        for (let j = 1; j <= steps; j++) {
          const x = ax + ((bx - ax) * j) / steps, y = ay + ((by - ay) * j) / steps;
          const dx = x - px, dy = y - py;
          // The grinder and knife lift off once the horn under them is at target.
          const i = hoof.cellAt(x, y);
          const done = i >= 0 && (tool === 'grinder' || tool === 'knife') && !hoof.loose[i] &&
            hoof.thick[i] <= hoof.zoneTarget(i) + 0.4;
          if (done || (tool === 'grinder' && discTouchesUlcer(x, y))) { px = x; py = y; continue; }
          let ev;
          if (tool === 'grinder') ev = applyGrind(hoof, x, y, DT);
          else if (tool === 'spray') ev = applySpray(hoof, x, y, DT);
          else ev = applyStroke(hoof, tool, x, y, Math.hypot(dx, dy));
          emit(ev, tool, x, y);
          if (onStamp) onStamp(tool, x, y, dx, dy);
          px = x; py = y;
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
    nip() {
      const core = CFG.tools.nippers.radius * CFG.tools.nippers.liveCore;
      const touchesLive = (x, y) => {
        let live = false;
        hoof.stamp(x, y, core, (i) => { if (!(hoof.zone[i] & Z.DEAD)) live = true; });
        return live;
      };
      for (const x of [158, 242, 128, 272, 100, 300, 190, 210, 80, 320, 70, 330, 112, 288, 143, 257, 174, 226]) {
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
  };
  return p;
}
