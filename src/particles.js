// Lightweight particle system: horn shavings, mud clods, grinder dust,
// loose-horn flakes, the pressure-release puff, and blood droplets.

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
};

export class Particles {
  constructor() {
    this.list = [];
  }

  spawn(kind, x, y, color, count = 1) {
    const k = KINDS[kind];
    for (let n = 0; n < count; n++) {
      if (this.list.length > 600) this.list.shift();
      const life = R(...k.life);
      this.list.push({
        kind, x: x + R(-4, 4), y: y + R(-4, 4),
        vx: R(-k.vx, k.vx), vy: R(...k.vy),
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
        case 'flake':
          // A curled ribbon of horn: the "forbidden parmesan".
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.kind === 'flake' ? 3 : 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 1.5);
          ctx.stroke();
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
