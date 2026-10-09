// Hand-built case definitions. The MVP ships one: Case B, "Pressure Point".

import { CLAW } from './hoof.js';

export const CASE_B = {
  id: 'B',
  title: 'Pressure Point',
  subtitle: 'Holstein #214 · left hind',
  intro:
    "Farmer says #214's been shifting her weight off the left hind and lying down more than usual. " +
    "She's overdue for a trim. Lift the foot and have a look.",

  // Excess sole (mm above target) on each claw. Outer hind claws overgrow most.
  excess: { [CLAW.OUTER]: 4.6, [CLAW.INNER]: 2.4 },

  // Hidden lesion: sole ulcer at the typical site (sole/heel junction, axial side).
  lesion: { type: 'ulcer', claw: CLAW.OUTER, x: 172, y: 492, r: 12 },

  // A curl of loose heel horn for step 5.
  looseHorn: { claw: CLAW.INNER, x: 292, y: 552, r: 11 },

  diagnosis: 'ulcer',
  diagnosisOptions: [
    {
      id: 'ulcer', label: 'Sole ulcer',
      feedback: 'Right. A sole ulcer at the typical site, where the sole meets the heel on the outer hind claw.',
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
  plan: 'Plan: functional trim (steps 1–3), then open the ulcer and block the sound inner claw.',
};
