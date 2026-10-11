// Cases. makeCase(conditionId, seed, mods) deals a cow with a condition from conditions.js.
// CASE_B "Pressure Point" is the hand-placed original sole ulcer.

import { CLAW } from './hoof.js';
import { mulberry32 } from './noise.js';
import { CONDITIONS, FINDING } from './conditions.js';

// Everything a case needs, written out from where things are on the foot.
function buildCase(condition, { seed, side, excess, lesion, looseHorn, decoys }) {
  const C = CONDITIONS[condition];
  const cow = 100 + (((seed - 100) % 900) + 900) % 900; // ear tag #100–#999; seed 214 is #214
  const leg = side === 'RH' ? 'right' : 'left';
  return {
    id: C.caseId,
    condition,
    seed,
    side,
    title: C.title,
    noun: C.noun ?? 'lesion', // what the copy calls the lesion: 'ulcer', 'abscess'
    subtitle: `Holstein #${cow} · ${leg} hind`,

    // The step ids this job needs, in order (see steps.js).
    steps: C.steps,
    requires: C.requires,

    // Excess sole (mm above target) on each claw. Outer hind claws overgrow most.
    excess,

    // The hidden lesion, its kind named by the condition's diagnosis (null on a sound foot).
    lesion: lesion && { type: C.diagnosis, ...lesion },

    // A curl of loose heel horn for step 5, on the sound claw.
    looseHorn,

    // Marks the testers can read: the lesion and the decoys that only look like trouble.
    findings: [...(lesion ? [{ kind: C.diagnosis, ...lesion }] : []), ...decoys].map((f) => ({ ...f, ...FINDING[f.kind] })),

    diagnosis: C.diagnosis,
    ...C.copy({ cow, leg, lesion }),
  };
}

// A fresh cow with the given condition. Deterministic per seed. `mods` overrides any of
// side, excess, lesion, looseHorn or decoys (the per-farm variations in WP7.3 go here too).
export function makeCase(condition, seed, mods = {}) {
  const C = CONDITIONS[condition];
  if (!C) throw new Error(`Unknown condition: ${condition}`);
  const rand = mulberry32(seed);
  const between = (a, b) => a + rand() * (b - a);
  const dealt = rand() < 0.5 ? 'LH' : 'RH'; // always drawn, so a side mod doesn't reshuffle the rest
  const side = mods.side ?? dealt;
  const placed = C.place(rand, side);
  const excess = { [CLAW.OUTER]: between(3.5, 5.5), [CLAW.INNER]: between(1.8, 3.0) };
  return buildCase(condition, { seed, side, excess, ...placed, ...mods });
}

// Any condition, picked by its weight. Until the route (WP7.4) chooses per farm.
export function dealCase(seed) {
  const ids = Object.keys(CONDITIONS);
  let r = mulberry32(seed ^ 0x5eed)() * ids.reduce((a, id) => a + CONDITIONS[id].weight, 0);
  const id = ids.find((k) => (r -= CONDITIONS[k].weight) < 0) ?? ids[0];
  return makeCase(id, seed);
}

export const CASE_B = makeCase('ulcer', 214, {
  side: 'LH',
  excess: { [CLAW.OUTER]: 4.6, [CLAW.INNER]: 2.4 },
  lesion: { claw: CLAW.OUTER, x: 172, y: 288, r: 12 },
  looseHorn: { claw: CLAW.INNER, x: 292, y: 228, r: 11 },
  decoys: [
    { kind: 'stain', claw: CLAW.INNER, x: 262, y: 300, r: 13 },
    { kind: 'bruise', claw: CLAW.OUTER, x: 122, y: 430, r: 11 },
  ],
});
