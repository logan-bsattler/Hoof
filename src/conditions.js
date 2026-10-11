// Condition registry. Each entry says what is wrong with the foot, where it sits on the grid,
// what the testers find, which steps the job needs, the right read, and the treatment plan.
// makeCase() in case.js turns a condition + seed (+ mods) into a case.

import { CLAW, CLAW_NAME, GEOM, clawSide, insideClaw, soundClaw } from './hoof.js';

// What the hoof testers find at each kind of mark. `look` and `feel` are neutral words for
// the read card; `probeText` is what the toast says on a tap.
export const FINDING = {
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

// The five-step functional trim every case shares (rasp after step 3).
const TRIM = ['clean', 'diagnose', 'step1', 'step2', 'step3', 'finish'];

// One or two decoys on the weight-bearing sole, clear of `avoid` (the lesion and heel horn).
function placeDecoys(rand, at, side, avoid) {
  const between = (a, b) => a + rand() * (b - a);
  const decoys = [];
  const kinds = rand() < 0.6 ? ['stain', 'bruise'] : [rand() < 0.5 ? 'stain' : 'bruise'];
  for (const kind of kinds) {
    for (let tries = 0; tries < 60; tries++) {
      const claw = rand() < 0.5 ? CLAW.OUTER : CLAW.INNER;
      const d = { kind, claw, x: at(claw, between(30, 120)), y: between(285, 470), r: between(10, 13) };
      const clear = [...avoid, ...decoys].every((o) => Math.hypot(o.x - d.x, o.y - d.y) > 55);
      if (clear && insideClaw(claw, d.x, d.y, side, d.r + 6)) { decoys.push(d); break; }
    }
  }
  return decoys;
}

// Loose heel horn for step 5 on `claw`, near the top of the sole.
function placeHeelHorn(rand, at, claw) {
  const between = (a, b) => a + rand() * (b - a);
  return { claw, x: at(claw, between(78, 102)), y: between(220, 238), r: between(10, 13) };
}

export const CONDITIONS = {
  // Case A "Due for a Trim": nothing wrong. Decoys only, and the right read is "sound".
  // The restraint test: the job is the trim, with nothing opened.
  routine: {
    caseId: 'A',
    title: 'Due for a Trim',
    weight: 0.4, // share of dealt cows until the route (WP7.4) picks conditions per farm
    steps: [...TRIM, 'step5'],
    requires: { open: false, block: false, treat: false },
    diagnosis: 'sound',

    place(rand, side) {
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const looseHorn = placeHeelHorn(rand, at, rand() < 0.5 ? CLAW.OUTER : CLAW.INNER);
      // More marks than an ulcer cow carries, since they are the whole read.
      const decoys = placeDecoys(rand, at, side, [looseHorn]);
      if (rand() < 0.5) decoys.push(...placeDecoys(rand, at, side, [looseHorn, ...decoys]).slice(0, 1));
      return { lesion: null, looseHorn, decoys };
    },

    copy({ cow, leg }) {
      return {
        intro:
          `Routine herd trim. #${cow} is due on the ${leg} hind and the farmer hasn't seen her favour it. ` +
          'Not every foot has a problem: check before you cut.',
        diagnosisPrompt: 'Anything wrong with this foot?',
        diagnosisOptions: [
          {
            id: 'sound', label: 'Nothing: she’s sound',
            feedback: 'Right. Every mark stayed firm under the testers. She just needs a good trim.',
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer springs under the testers. Everything here stayed firm: she’s sound.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'Old marks in the horn that stay firm aren’t sore. They trim out. She’s sound.',
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: 'No dark track along the wall and nothing gave under the testers. She’s sound.',
          },
        ],
        misreadNote: 'Misread a sound foot. Marks that stay firm under the testers are nothing to open.',
        plan: 'Plan: functional trim (steps 1–3), rasp, then flick off the loose heel horn. Nothing to open: leave the marks alone.',
      };
    },
  },

  // Case B "Pressure Point": a sole ulcer at the sole/heel junction.
  ulcer: {
    caseId: 'B',
    title: 'Pressure Point',
    weight: 0.6,
    steps: [...TRIM, 'step4', 'step5', 'treat'],
    // What scoring checks beyond the shared trim.
    requires: { open: true, block: true, treat: true },
    diagnosis: 'ulcer',

    // Ulcer on the axial half near the sole/heel junction, heel horn on the sound claw.
    // The draw order is fixed: changing it changes every seeded cow.
    place(rand, side) {
      const between = (a, b) => a + rand() * (b - a);
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const sore = rand() < 0.8 ? CLAW.OUTER : CLAW.INNER; // outer hind claws ulcerate most
      const sound = sore === CLAW.OUTER ? CLAW.INNER : CLAW.OUTER;
      const lesion = { claw: sore, x: at(sore, between(22, 36)), y: between(275, 305), r: between(10, 14) };
      const looseHorn = placeHeelHorn(rand, at, sound);
      const decoys = placeDecoys(rand, at, side, [lesion, looseHorn]);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, leg, lesion }) {
      const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
      return {
        intro:
          `Farmer says #${cow}'s been shifting her weight off the ${leg} hind and lying down more than usual. ` +
          "She's overdue for a trim. Lift the foot and have a look.",
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
    },
  },
};
