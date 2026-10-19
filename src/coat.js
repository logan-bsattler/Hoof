// Her coat and size on the walk-off and the walk-in sketch (D74). One body shape for every cow,
// scaled by her frame (D68), and a coat per breed (D73): a Holstein black and white (now and
// then red and white), a Jersey cross fawn with a dark face, a Brown Swiss solid grey-brown
// with a pale ring round her muzzle.

import { mulberry32 } from './noise.js';

// How big she's drawn against an average Holstein: a Jersey stands about 1.25 m at the
// withers to a Holstein's 1.45; a Brown Swiss or a big old cow a little over.
export const FRAME_SCALE = { small: 0.86, average: 1, large: 1.1 };

// Colours for each coat. `patch` is the colour of a Holstein's patches (null for a solid coat);
// `shade` darkens her hindquarters and shoulders, `stripe` lightens the line of her back.
const COATS = {
  holstein: {
    base: '#f4efe6', patch: [31, 26, 23], leg: '#f3eee4', legFar: '#d4cdc0', legLow: null,
    head: '#1f1a17', blaze: '#f4efe6', muzzle: '#e7a9a0', nostril: '#9a5a55', ring: null,
    ear: '#1f1a17', earIn: '#c98f86', eyeRing: null, tail: '#ece5d8', switch: '#2a211c', rump: [[38, 6, 26, 15]],
  },
  holsteinRed: {
    base: '#f4efe6', patch: [128, 50, 34], leg: '#f3eee4', legFar: '#d4cdc0', legLow: null,
    head: '#7e3222', blaze: '#f4efe6', muzzle: '#e7a9a0', nostril: '#9a5a55', ring: null,
    ear: '#7e3222', earIn: '#d6a090', eyeRing: null, tail: '#ece5d8', switch: '#f0e8da', rump: [[38, 6, 26, 15]],
  },
  jerseyx: {
    base: '#c48a52', patch: null, shade: [70, 42, 22], stripe: null, leg: '#b67c48', legFar: '#94643a', legLow: '#4a3222',
    head: '#6a4428', blaze: null, muzzle: '#2a201c', nostril: '#0e0b0a', ring: '#e6d2b0',
    ear: '#6a4428', earIn: '#d9a878', eyeRing: '#d8b88c', dished: true, tail: '#b07a46', switch: '#1f1814', rump: [],
  },
  brownswiss: {
    base: '#8c7c6a', patch: null, shade: [52, 42, 34], stripe: [196, 184, 166], leg: '#86766a', legFar: '#6c5e52', legLow: '#4a4038',
    head: '#6e6052', blaze: null, muzzle: '#2c2622', nostril: '#0e0c0b', ring: '#e2dccf',
    ear: '#7a6a5a', earIn: '#d8ccbc', eyeRing: null, bigEars: true, tail: '#857464', switch: '#1e1a17', rump: [],
  },
};

// Her coat, the same on the intro and the walk-off: one Holstein in eight is red and white,
// picked from her seed.
export function coatOf(caseDef) {
  const breed = COATS[caseDef?.breed] ? caseDef.breed : 'holstein';
  if (breed !== 'holstein') return { id: breed, ...COATS[breed] };
  const red = mulberry32((caseDef?.seed ?? 0) ^ 0x7ed)() < 0.125;
  return red ? { id: 'holsteinRed', ...COATS.holsteinRed } : { id: 'holstein', ...COATS.holstein };
}

export function frameScale(caseDef) {
  return FRAME_SCALE[caseDef?.frame] ?? 1;
}
