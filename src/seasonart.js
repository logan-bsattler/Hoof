// The season in pictures (WP15.1): the daylight through the barn door and windows, and the
// countryside behind the road map. All procedural, from fixed seeds, so a season always looks
// the same.

import { mulberry32 } from './noise.js';

// Daylight in the barn: [r, g, b] of the light, and how strong it falls (alpha at its brightest).
// Summer is a hard warm glare; winter a weak blue-white; autumn low and amber; spring soft green-gold.
export const LIGHT = {
  spring: { rgb: [226, 222, 182], a: 0.33 },
  summer: { rgb: [246, 220, 160], a: 0.46 },
  autumn: { rgb: [236, 184, 122], a: 0.3 },
  winter: { rgb: [196, 212, 232], a: 0.26 },
};
export const light = (id, a = 1) => {
  const l = LIGHT[id] ?? LIGHT.spring;
  return `rgba(${l.rgb.join(',')},${(l.a * a).toFixed(3)})`;
};

const PALETTE = {
  spring: {
    sky: ['#9fc0d6', '#dfe8dc'], far: '#8fae8a', mid: '#79a35f', near: '#5f8f48',
    fields: ['#86b35e', '#9cc46c', '#7a6046', '#8fba62'], hedge: '#3f6a34', tree: ['#5f9a46', '#78ad55'],
    dots: ['#f4eef0', '#f1c9d6'], dotOn: 'trees',
  },
  summer: {
    sky: ['#86b2d8', '#f1e3bc'], far: '#a5ab7a', mid: '#9aa05a', near: '#7f8a3e',
    fields: ['#d9b85e', '#c9a64c', '#8fa04e', '#e2c473'], hedge: '#3d5a2c', tree: ['#3f6a33', '#4d7a3a'],
    bales: true,
  },
  autumn: {
    sky: ['#97a2a8', '#e6c99c'], far: '#9c8f6a', mid: '#8a7444', near: '#6e5530',
    fields: ['#6e4f33', '#b8955a', '#7d5b3a', '#a88a52'], hedge: '#5a4a28', tree: ['#b8642a', '#d08a3a', '#8f4a22'],
    furrows: true, dots: ['#c97a34', '#a8521f'], dotOn: 'air',
  },
  winter: {
    sky: ['#9aa7b5', '#e2e6ea'], far: '#c9d3dc', mid: '#dde5ec', near: '#eef2f5',
    fields: ['#eef2f5', '#e4eaf0', '#f3f6f8', '#dbe3ea'], hedge: '#3b403c', tree: null,
    bare: true, dots: ['#ffffff'], dotOn: 'air',
  },
};

// A rolling skyline across the width at height y (fraction of h), amplitude amp.
function ridge(c, rand, w, h, y, amp, color) {
  const p1 = rand() * 6, p2 = rand() * 6;
  c.fillStyle = color;
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) {
    const t = x / w;
    c.lineTo(x, h * y - amp * (Math.sin(t * 5.3 + p1) * 0.6 + Math.sin(t * 11.7 + p2) * 0.4));
  }
  c.lineTo(w, h);
  c.closePath();
  c.fill();
}

function tree(c, rand, x, y, s, pal) {
  if (pal.bare) {
    // Bare winter tree: a trunk and forking branches.
    c.strokeStyle = pal.hedge;
    c.lineCap = 'round';
    const branch = (x0, y0, len, ang, wd, depth) => {
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
      c.lineWidth = wd;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      if (depth > 0) for (const d of [-0.5, 0.45]) branch(x1, y1, len * 0.68, ang + d + (rand() - 0.5) * 0.3, wd * 0.62, depth - 1);
    };
    branch(x, y, s * 0.9, -Math.PI / 2 + (rand() - 0.5) * 0.2, Math.max(1, s * 0.16), 3);
    return;
  }
  c.fillStyle = pal.hedge;
  c.fillRect(x - s * 0.06, y - s * 0.7, s * 0.12, s * 0.7);
  for (let k = 0; k < 5; k++) {
    c.fillStyle = pal.tree[Math.floor(rand() * pal.tree.length)];
    c.beginPath();
    c.arc(x + (rand() - 0.5) * s * 0.7, y - s * (0.9 + rand() * 0.5), s * (0.32 + rand() * 0.18), 0, Math.PI * 2);
    c.fill();
  }
  if (pal.dotOn === 'trees') {
    for (let k = 0; k < 10; k++) {
      c.fillStyle = pal.dots[k % pal.dots.length];
      c.fillRect(x + (rand() - 0.5) * s, y - s * (0.7 + rand() * 0.9), 1.6, 1.6);
    }
  }
}

// Paint the season's countryside to cover a w × h canvas (CSS px) at device scale dpr.
export function paintLandscape(canvas, id, w, h, dpr = 1) {
  const pal = PALETTE[id] ?? PALETTE.spring;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const rand = mulberry32(1501 + Object.keys(PALETTE).indexOf(id));
  // The horizon: high on a tall phone, so the fields show between the stops; lower on a wide screen.
  const hz = Math.min(0.4, Math.max(0.2, 0.6 * (w / h)));

  const sky = c.createLinearGradient(0, 0, 0, h * (hz + 0.02));
  sky.addColorStop(0, pal.sky[0]);
  sky.addColorStop(1, pal.sky[1]);
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);
  if (id === 'summer') {
    const sun = c.createRadialGradient(w * 0.78, h * hz * 0.3, 4, w * 0.78, h * hz * 0.3, h * 0.3);
    sun.addColorStop(0, 'rgba(255,246,214,0.9)');
    sun.addColorStop(1, 'rgba(255,246,214,0)');
    c.fillStyle = sun;
    c.fillRect(0, 0, w, h);
  }

  ridge(c, rand, w, h, hz - 0.06, h * 0.03, pal.far);
  ridge(c, rand, w, h, hz, h * 0.025, pal.mid);

  // Patchwork fields from the hills to the foot of the screen, hedges between them.
  const rows = [0, 0.08, 0.2, 0.38, 0.62, 1].map((t) => hz + t * (1.02 - hz));
  for (let r = 0; r < rows.length - 1; r++) {
    const y0 = h * rows[r], y1 = h * rows[r + 1];
    let x = -rand() * 60;
    while (x < w) {
      const fw = (70 + rand() * 120) * (1 + r * 0.6);
      const col = pal.fields[Math.floor(rand() * pal.fields.length)];
      c.fillStyle = col;
      c.fillRect(x, y0, fw + 1, y1 - y0 + 1);
      if (pal.furrows && col === pal.fields[0]) {
        c.strokeStyle = 'rgba(40,26,14,0.35)';
        c.lineWidth = 1;
        for (let fy = y0 + 3; fy < y1; fy += 2 + r * 1.5) { c.beginPath(); c.moveTo(x, fy); c.lineTo(x + fw, fy); c.stroke(); }
      }
      if (pal.bales && col === pal.fields[0] && r > 0) {
        const bs = 2 + r * 2.4;
        for (let k = 0; k < 3; k++) {
          const bx = x + fw * (0.2 + rand() * 0.6), by = y0 + (y1 - y0) * (0.3 + rand() * 0.5);
          c.fillStyle = 'rgba(60,40,10,0.25)';
          c.beginPath(); c.ellipse(bx + bs * 0.4, by + bs * 0.7, bs, bs * 0.35, 0, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#c9a24a';
          c.beginPath(); c.arc(bx, by, bs, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#a5822f'; c.lineWidth = 1;
          c.beginPath(); c.arc(bx, by, bs * 0.55, 0, Math.PI * 2); c.stroke();
        }
      }
      if (id === 'winter') {
        // Blue shadow along the hedge foot.
        c.fillStyle = 'rgba(150,170,196,0.35)';
        c.fillRect(x, y0, fw, 2 + r);
      }
      x += fw;
    }
    // The hedge along the top of the row, with trees standing out of it.
    c.fillStyle = pal.hedge;
    const hh = 1.5 + r * 1.6;
    c.beginPath();
    c.moveTo(0, y0 + hh);
    for (let hx = 0; hx <= w + 6; hx += 6) c.lineTo(hx, y0 - hh * (0.6 + rand() * 0.6));
    c.lineTo(w, y0 + hh);
    c.closePath();
    c.fill();
    if (id === 'winter') { c.fillStyle = 'rgba(240,244,248,0.85)'; c.fillRect(0, y0 - hh * 0.9, w, Math.max(1, hh * 0.35)); }
    for (let k = 0; k < 2 + r; k++) tree(c, rand, rand() * w, y0, 8 + r * 9, pal);
  }

  // Weather in the air: falling snow in winter, blown leaves in autumn.
  if (pal.dotOn === 'air') {
    const n = Math.round((w * h) / (id === 'winter' ? 900 : 4000));
    for (let k = 0; k < n; k++) {
      c.fillStyle = pal.dots[k % pal.dots.length];
      const s = id === 'winter' ? 0.8 + rand() * 1.8 : 1.5 + rand() * 1.5;
      c.globalAlpha = 0.5 + rand() * 0.5;
      c.beginPath();
      if (id === 'winter') c.arc(rand() * w, rand() * h, s, 0, Math.PI * 2);
      else c.ellipse(rand() * w, rand() * h, s * 1.4, s * 0.7, rand() * Math.PI, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
  }
}
