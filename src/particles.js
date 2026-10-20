// Lightweight particle system: translucent horn curls, manure clods and straw,
// grinder dust, loose-horn flakes, spray mist, the release puff, and blood.

const R = (a, b) => a + Math.random() * (b - a);

const KINDS = {
  shaving: { life: [0.9, 1.4], vx: 70, vy: [-110, -30], g: 420, size: [4, 9], drag: 0.6 },
  dust:    { life: [0.4, 0.8], vx: 90, vy: [-60, -10], g: 60, size: [1, 2.2], drag: 2 },
  mud:     { life: [0.7, 1.1], vx: 80, vy: [-90, -20], g: 520, size: [2, 4.5], drag: 0.4 },
  chunk:   { life: [0.9, 1.3], vx: 60, vy: [-80, -20], g: 650, size: [5, 9], drag: 0.3 },
  flake:   { life: [1.0, 1.6], vx: 50, vy: [-90, -40], g: 300, size: [6, 11], drag: 0.8 },
  puff:    { life: [0.7, 1.1], vx: 30, vy: [-40, -10], g: -10, size: [6, 12], drag: 1.5 },
  blood:   { life: [0.8, 1.2], vx: 60, vy: [-120, -40], g: 500, size: [2, 4], drag: 0.3 },
  spark:   { life: [0.6, 1.0], vx: 40, vy: [-90, -40], g: -20, size: [2, 4], drag: 1 },
  straw:   { life: [0.8, 1.3], vx: 90, vy: [-120, -40], g: 380, size: [5, 12], drag: 0.8 },
  mist:    { life: [0.25, 0.5], vx: 25, vy: [-25, 25], g: 30, size: [0.6, 1.6], drag: 3 },
};

export class Particles {
  constructor() {
    this.list = [];
    // Spawn points come off the template foot; map(x, y) puts them where it's drawn (WP18).
    this.map = null;
  }

  // `dir` optionally throws the particles along a velocity (e.g. grinder dust, spray).
  spawn(kind, x, y, color, count = 1, dir = null) {
    const k = KINDS[kind];
    if (this.map) ({ x, y } = this.map(x, y));
    for (let n = 0; n < count; n++) {
      if (this.list.length > 900) this.list.shift();
      const life = R(...k.life);
      const spread = dir ? 0.35 : 1;
      this.list.push({
        kind, x: x + R(-4, 4), y: y + R(-4, 4),
        vx: R(-k.vx, k.vx) * spread + (dir ? dir[0] * R(0.6, 1.3) : 0),
        vy: (dir ? R(-k.vx, k.vx) * spread + dir[1] * R(0.6, 1.3) : R(...k.vy)),
        g: k.g, drag: k.drag, life, max: life,
        size: R(...k.size), rot: R(0, Math.PI * 2), vr: R(-8, 8), color,
      });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.vy += p.g * dt;
      p.vx *= 1 - Math.min(1, p.drag * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.list) {
      const a = Math.min(1, p.life / p.max * 2);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      switch (p.kind) {
        case 'shaving':
        case 'flake': {
          // A thin, translucent curl of horn: the "forbidden parmesan".
          const wd = p.kind === 'flake' ? 3.4 : 2.2;
          ctx.lineCap = 'round';
          ctx.globalAlpha = a * 0.75;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = wd;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 1.5);
          ctx.stroke();
          ctx.globalAlpha = a * 0.9;
          ctx.strokeStyle = 'rgba(255,255,250,0.8)';
          ctx.lineWidth = wd * 0.3;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2 - wd * 0.2, 0.2, Math.PI * 1.1);
          ctx.stroke();
          break;
        }
        case 'straw':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-p.size / 2, 0); ctx.quadraticCurveTo(0, 1.2, p.size / 2, 0);
          ctx.stroke();
          break;
        case 'mud':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,240,210,0.35)';
          ctx.beginPath();
          ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.28, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'chunk':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(-p.size / 2, -p.size / 3);
          ctx.lineTo(p.size / 2, -p.size / 2);
          ctx.lineTo(p.size / 3, p.size / 2);
          ctx.lineTo(-p.size / 2, p.size / 3);
          ctx.closePath();
          ctx.fill();
          break;
        case 'puff': {
          const grow = 1 + (1 - p.life / p.max) * 2.5;
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * grow, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          break;
        default:
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
      }
      ctx.restore();
    }
  }
}
