// Seeded procedural noise for the art: value noise, fBm, and a PRNG.
// Pure functions, so textures are identical on every run.

export function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise on a wrapping 256² lattice. Returns sample(x, y) in 0..1.
export function valueNoise(rand) {
  const N = 256, M = N - 1;
  const v = new Float32Array(N * N);
  for (let i = 0; i < v.length; i++) v[i] = rand();
  return (x, y) => {
    const xf = Math.floor(x), yf = Math.floor(y);
    let tx = x - xf, ty = y - yf;
    tx = tx * tx * (3 - 2 * tx);
    ty = ty * ty * (3 - 2 * ty);
    const x0 = xf & M, y0 = (yf & M) * N, x1 = (xf + 1) & M, y1 = ((yf + 1) & M) * N;
    const a = v[y0 + x0], b = v[y0 + x1], c = v[y1 + x0], d = v[y1 + x1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}

// Fractal sum of octaves, normalised to 0..1.
export function fbm(noise, x, y, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f + o * 31.7, y * f - o * 17.3) * amp;
    norm += amp;
    amp *= gain;
    f *= 2.03;
  }
  return sum / norm;
}

export const smoothstep = (e0, e1, v) => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
