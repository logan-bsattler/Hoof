// Camera: which part of the 400×720 logical scene the canvas shows, and at what scale.
// Pure (no DOM), so it's unit-tested. Screen CSS px = (logical − cam.x|y) × cam.scale.
//
// 'full'  The whole scene, letterboxed into the wrap (desktop, and the walk-off everywhere).
// 'hoof'  Phones: the canvas fills the wrap, a fixed HUD strip sits across the top in screen
//         space, and the hoof's content box is fitted into the space below it.

import { CFG } from './config.js';

const { w: W, h: H } = CFG.view;

export function fitCamera(wrapW, wrapH, mode = 'full') {
  if (mode !== 'hoof') {
    const s = Math.min(wrapW / W, wrapH / H);
    return { mode: 'full', cssW: Math.floor(W * s), cssH: Math.floor(H * s), x: 0, y: 0, scale: s, hudH: 0 };
  }
  const { content: cb, hudH, bleed } = CFG.view.phone;
  const s = Math.min(wrapW / cb.w, (wrapH - hudH) / cb.h);
  // Never show past the painted scenery: sideways it bleeds `bleed` px each side; vertically
  // the content box is centred, so the shorter of its two margins to the scene edge limits it.
  const cy = cb.y + cb.h / 2;
  const cssW = Math.floor(Math.min(wrapW, (W + 2 * bleed) * s));
  const cssH = Math.floor(Math.min(wrapH, hudH + 2 * Math.min(cy, H - cy) * s));
  return {
    mode: 'hoof',
    cssW,
    cssH,
    x: cb.x + cb.w / 2 - cssW / (2 * s),
    y: cy - (cssH + hudH) / (2 * s),
    scale: s,
    hudH,
  };
}

// Screen (CSS px from the canvas's top-left) → logical, and back.
export const toScene = (cam, sx, sy) => ({ x: cam.x + sx / cam.scale, y: cam.y + sy / cam.scale });
export const toScreen = (cam, x, y) => ({ x: (x - cam.x) * cam.scale, y: (y - cam.y) * cam.scale });
