// Case definitions. The MVP ships one case, B "Pressure Point": a sole ulcer at the sole/heel
// junction. CASE_B is the hand-built original; makeCaseB(seed) deals a fresh cow of the same case.

import { CLAW, CLAW_NAME, GEOM, clawSide, insideClaw, soundClaw } from './hoof.js';
import { mulberry32 } from './noise.js';

// What the hoof testers find at each kind of mark. `look` and `feel` are neutral words for
// the read card; `probeText` is what the toast says on a tap.
const FINDING = {
  ulcer: {
    look: 'dark spot at the sole/heel junction', feel: 'springs under pressure',
    probeText: 'It springs under the testers. Something soft under there.',
  },
  stain: {
    look: 'dark patch', feel: 'firm',
    probeText: 'Dark is just staining. Firm underneath.',
  },
  bruise: {
    look: 'reddish patch', feel: 'firm',
    probeText: 'Reddish horn, but it stays firm under the testers.',
  },
};

// Everything a case needs, written out from where things are on the foot.
function buildCase({ seed, side, excess, lesion, looseHorn, decoys }) {
  const cow = 100 + (((seed - 100) % 900) + 900) % 900; // ear tag #100–#999; seed 214 is #214
  const leg = side === 'RH' ? 'right' : 'left';
  const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
  return {
    id: 'B',
    seed,
    side,
    title: 'Pressure Point',
    subtitle: `Holstein #${cow} · ${leg} hind`,
    intro:
      `Farmer says #${cow}'s been shifting her weight off the ${leg} hind and lying down more than usual. ` +
      "She's overdue for a trim. Lift the foot and have a look.",

    // Excess sole (mm above target) on each claw. Outer hind claws overgrow most.
    excess,

    // Hidden lesion: sole ulcer at the typical site (sole/heel junction, axial side).
    lesion: { type: 'ulcer', ...lesion },

    // A curl of loose heel horn for step 5, on the sound claw.
    looseHorn,

    // Marks the testers can read: the ulcer and the decoys that only look like trouble.
    findings: [{ kind: 'ulcer', ...lesion }, ...decoys].map((f) => ({ ...f, ...FINDING[f.kind] })),

    diagnosis: 'ulcer',
    diagnosisPrompt: 'She’s been sore on this foot. What are you looking at?',
    diagnosisOptions: [
      {
        id: 'ulcer', label: 'Sole ulcer',
        feedback: `Right. A sole ulcer at the typical site, where the sole meets the heel on the ${sore} claw.`,
      },
      {
        id: 'bruise', label: 'Sole bruise',
        feedback: "A bruise stays firm under the testers. This one springs: it's a sole ulcer.",
      },
      {
        id: 'whiteline', label: 'White-line abscess',
        feedback: "White-line trouble tracks along the wall. This sits in the sole by the heel: it's a sole ulcer.",
      },
      {
        id: 'foreign', label: 'Foreign body',
        feedback: "No puncture, no screw, no stone. It's a sole ulcer.",
      },
    ],
    misreadNote: 'Misread the lesion. A spot that springs at the sole/heel junction is a sole ulcer.',
    plan: `Plan: functional trim (steps 1–3), open the ulcer and block the sound ${sound} claw, then flush, pad and wrap it.`,
  };
}

export const CASE_B = buildCase({
  seed: 214,
  side: 'LH',
  excess: { [CLAW.OUTER]: 4.6, [CLAW.INNER]: 2.4 },
  lesion: { claw: CLAW.OUTER, x: 172, y: 288, r: 12 },
  looseHorn: { claw: CLAW.INNER, x: 292, y: 228, r: 11 },
  decoys: [
    { kind: 'stain', claw: CLAW.INNER, x: 262, y: 300, r: 13 },
    { kind: 'bruise', claw: CLAW.OUTER, x: 122, y: 430, r: 11 },
  ],
});

// A fresh cow with Case B: same lesion, new foot. Deterministic per seed.
export function makeCaseB(seed) {
  const rand = mulberry32(seed);
  const between = (a, b) => a + rand() * (b - a);
  const side = rand() < 0.5 ? 'LH' : 'RH';
  const sore = rand() < 0.8 ? CLAW.OUTER : CLAW.INNER; // outer hind claws ulcerate most
  const sound = sore === CLAW.OUTER ? CLAW.INNER : CLAW.OUTER;
  const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;

  // Ulcer on the axial half, near the sole/heel junction.
  const lesion = { claw: sore, x: at(sore, between(22, 36)), y: between(275, 305), r: between(10, 14) };
  const looseHorn = { claw: sound, x: at(sound, between(78, 102)), y: between(220, 238), r: between(10, 13) };

  // One or two decoys on the weight-bearing sole, clear of the ulcer and the heel horn.
  const decoys = [];
  const kinds = rand() < 0.6 ? ['stain', 'bruise'] : [rand() < 0.5 ? 'stain' : 'bruise'];
  for (const kind of kinds) {
    for (let tries = 0; tries < 60; tries++) {
      const claw = rand() < 0.5 ? CLAW.OUTER : CLAW.INNER;
      const d = { kind, claw, x: at(claw, between(30, 120)), y: between(285, 470), r: between(10, 13) };
      const clear = [lesion, looseHorn, ...decoys].every((o) => Math.hypot(o.x - d.x, o.y - d.y) > 55);
      if (clear && insideClaw(claw, d.x, d.y, side, d.r + 6)) { decoys.push(d); break; }
    }
  }

  return buildCase({
    seed, side,
    excess: { [CLAW.OUTER]: between(3.5, 5.5), [CLAW.INNER]: between(1.8, 3.0) },
    lesion, looseHorn, decoys,
  });
}
