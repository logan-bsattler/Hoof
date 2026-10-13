// Condition registry. Each entry says what is wrong with the foot, where it sits on the grid,
// what the testers find, which steps the job needs, the right read, and the treatment plan.
// makeCase() in case.js turns a condition + seed (+ mods) into a case.
//
// place(rand, side, v) draws where everything sits. `v` carries the per-cow variations (WP7.3):
//   big     the claw that overgrows and carries most load (outer on a hind foot, inner on a front)
//   size    0..1, where the lesion's size falls in its band (undefined: random)
//   at      0..1, where its position falls in its band (undefined: random)
//   decoys  how many decoys (undefined: the condition's usual 1-2); kinds: which kinds to use
// Every random draw happens whatever `v` says, so a variation only changes what it names. The
// one exception is the decoy count: each decoy takes its own draws, so changing the count also
// rerolls the excess horn makeCase draws after placement.

import { CLAW, CLAW_NAME, GEOM, clawSide, clawSpan, insideClaw, soundClaw } from './hoof.js';

// What the hoof testers find at each kind of mark. `look` and `feel` are neutral words for
// the read card; `probeText` is what the toast says on a tap, `diagnosedText` once it's read.
export const FINDING = {
  ulcer: {
    look: 'dark spot at the sole/heel junction', feel: 'springs under pressure',
    probeText: 'It springs under the testers. Something soft under there.',
    diagnosedText: 'The ulcer. Open it up and keep weight off it.',
  },
  whiteline: {
    look: 'dark line along the wall', feel: 'flinches along the line',
    probeText: 'She flinches all along this dark line. Something’s tracking under the wall.',
    diagnosedText: 'The white-line track. Pare along it from the wall until it drains.',
  },
  dd: {
    look: 'raw red patch in the heel cleft', feel: 'very sore to the touch',
    probeText: 'She snatches the foot away. Raw, strawberry-red skin in the cleft, sore to the lightest touch.',
    diagnosedText: 'Digital dermatitis. No blade near it: clean it, spray it, wrap it.',
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

// The other ways a cow leaves the crush besides release (WP8.1, D22): the hospital pen (soft
// bedding near the parlour, no vet), the pen with the vet called, or back to the herd untrimmed
// till dry-off. A condition's `call` says which one it needs (null: release her as usual).
// `noun` finishes "she didn't need …"; `gait` is what the day sheet shows in place of the walk-off; `ticket` heads her result card.
export const CALLS = {
  pen: { label: 'Hospital pen', noun: 'the hospital pen', sub: 'Soft bedding near the parlour. No vet.', gait: 'to the pen', ticket: 'In the hospital pen, on soft bedding' },
  vet: { label: 'Call the vet', noun: 'the vet', sub: 'Into the hospital pen, and the vet sees her today.', gait: 'to the vet', ticket: 'In the hospital pen for the vet' },
  leave: { label: 'Leave her till dry-off', noun: 'her trim put off', sub: 'Back with the herd untrimmed. Trim her when she’s dry.', gait: 'left till dry-off', ticket: 'Back with the herd till dry-off' },
};

// The five-step functional trim every case shares (rasp after step 3).
const TRIM = ['clean', 'diagnose', 'step1', 'step2', 'step3', 'finish'];

export const DECOY_KINDS = ['stain', 'bruise'];

// A value in [lo, hi]: at fraction u of the band when given, else random. Always draws.
const band = (rand, lo, hi, u) => { const r = rand(); return lo + (u ?? r) * (hi - lo); };

const otherClaw = (c) => (c === CLAW.OUTER ? CLAW.INNER : CLAW.OUTER);

// Decoys on the weight-bearing sole, clear of `avoid` (the lesion and heel horn): one or two
// by default, or `v.decoys` of them, of `v.kinds`, taking turns from a random start.
function placeDecoys(rand, at, side, avoid, v = {}) {
  const between = (a, b) => a + rand() * (b - a);
  const decoys = [];
  let kinds = rand() < 0.6 ? ['stain', 'bruise'] : [rand() < 0.5 ? 'stain' : 'bruise'];
  if (v.decoys != null || v.kinds) {
    const pool = v.kinds ?? DECOY_KINDS, off = Math.floor(rand() * pool.length);
    kinds = Array.from({ length: v.decoys ?? kinds.length }, (_, k) => pool[(off + k) % pool.length]);
  }
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

// A white-line abscess on `claw`: a dark track in the abaxial white line, opening at the wall
// toward the toe (path[0]) and running back to a pocket of pus at the heel-sole-wall junction,
// where white-line separation is most common (Shearer, white line disease).
// A bigger abscess has the longer track (it opens further toward the toe) and the bigger pocket.
function placeTract(rand, side, claw, v = {}) {
  const s = clawSide(claw, side);
  // A point `inset` px in from the abaxial wall at height y.
  const wl = (y, inset) => { const [l, r] = clawSpan(claw, y, side); return (s > 0 ? r : l) - s * inset; };
  const y0 = band(rand, 370, 415, v.size), y1 = band(rand, 282, 296, v.at);
  const path = [];
  for (let k = 0, n = 9; k <= n; k++) {
    const t = k / n, y = y0 + (y1 - y0) * t;
    // White line at ~8 px in; it drifts a little toward the sole as it nears the pocket.
    path.push([wl(y, 8 + 5 * t * t + (rand() - 0.5) * 2), y]);
  }
  const [px, py] = path[path.length - 1];
  const pocket = { x: px - s * 6, y: py - 6, r: band(rand, 9, 11, v.size) };
  let len = 0;
  for (let k = 1; k < path.length; k++) len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
  // x, y, r: the entry, where the dark line shows at the wall. w: half-width of the track.
  return { claw, x: path[0][0], y: path[0][1], r: 8, w: 4.5, len, path, pocket };
}

// Digital dermatitis on `claw`'s side of the heel cleft, between the bulbs: a round raw patch
// on the skin just above the bulbs, its centre a little in from the axial edge.
function placeCleft(rand, side, claw, v = {}) {
  const between = (a, b) => a + rand() * (b - a);
  const s = clawSide(claw, side);
  const y = band(rand, GEOM.cleftY0 + 12, GEOM.cleftY1 - 8, v.at);
  const [l, r] = clawSpan(claw, y, side);
  return { claw, x: (s > 0 ? l : r) + s * between(6, 8), y, r: band(rand, 10, 12, v.size) };
}

export const CONDITIONS = {
  // Case A "Due for a Trim": nothing wrong. Decoys only, and the right read is "sound".
  // The restraint test: the job is the trim, with nothing opened.
  routine: {
    caseId: 'A',
    title: 'Due for a Trim',
    weight: 0.25, // share of dealt cows until the route (WP7.4) picks conditions per farm
    steps: [...TRIM, 'step5'],
    requires: { open: false, block: false, treat: false },
    diagnosis: 'sound',

    place(rand, side, v = {}) {
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const looseHorn = placeHeelHorn(rand, at, rand() < 0.5 ? CLAW.OUTER : CLAW.INNER);
      // At least one mark: they are the whole read, and there must be something to test.
      if (v.decoys != null || v.kinds) {
        const n = Math.max(1, v.decoys ?? 2);
        return { lesion: null, looseHorn, decoys: placeDecoys(rand, at, side, [looseHorn], { ...v, decoys: n }) };
      }
      // More marks than an ulcer cow carries, since they are the whole read.
      const decoys = placeDecoys(rand, at, side, [looseHorn]);
      if (rand() < 0.5) decoys.push(...placeDecoys(rand, at, side, [looseHorn, ...decoys]).slice(0, 1));
      return { lesion: null, looseHorn, decoys };
    },

    copy({ cow, limb }) {
      return {
        intro:
          `Routine herd trim. #${cow} is due on the ${limb} and the farmer hasn't seen her favour it. ` +
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
          {
            id: 'dd', label: 'Digital dermatitis',
            feedback: 'The heel cleft is clean skin: no raw red patch between the bulbs. She’s sound.',
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
    noun: 'ulcer',
    weight: 0.3,
    steps: [...TRIM, 'step4', 'step5', 'treat'],
    // What scoring checks beyond the shared trim.
    requires: { open: true, block: true, treat: true },
    diagnosis: 'ulcer',

    // Ulcer on the axial half near the sole/heel junction, heel horn on the sound claw.
    // The draw order is fixed: changing it changes every seeded cow.
    place(rand, side, v = {}) {
      const between = (a, b) => a + rand() * (b - a);
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const big = v.big ?? CLAW.OUTER;
      const sore = rand() < 0.8 ? big : otherClaw(big); // the bigger, loaded claw ulcerates most
      const sound = otherClaw(sore);
      const lesion = { claw: sore, x: at(sore, between(22, 36)), y: band(rand, 275, 305, v.at), r: band(rand, 10, 14, v.size) };
      const looseHorn = placeHeelHorn(rand, at, sound);
      const decoys = placeDecoys(rand, at, side, [lesion, looseHorn], v);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, limb, lesion }) {
      const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
      return {
        intro:
          `Farmer says #${cow}'s been shifting her weight off the ${limb} and lying down more than usual. ` +
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
          {
            id: 'dd', label: 'Digital dermatitis',
            feedback: "DD is a raw patch on the skin of the heel cleft. This springs in the horn of the sole: it's a sole ulcer.",
          },
        ],
        misreadNote: 'Misread the lesion. A spot that springs at the sole/heel junction is a sole ulcer.',
        plan: `Plan: functional trim (steps 1–3), open the ulcer and block the sound ${sound} claw, then flush, pad and wrap it.`,
      };
    },
  },

  // Case C "Under the Wall": a white-line abscess. The trick is to follow the line.
  whiteline: {
    caseId: 'C',
    title: 'Under the Wall',
    noun: 'abscess',
    weight: 0.25,
    steps: [...TRIM, 'drain', 'step5'],
    requires: { open: true, block: true, treat: false },
    diagnosis: 'whiteline',

    place(rand, side, v = {}) {
      const big = v.big ?? CLAW.OUTER;
      const sore = rand() < 0.75 ? big : otherClaw(big); // the bigger claw (lateral hind), mostly
      const sound = otherClaw(sore);
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const lesion = placeTract(rand, side, sore, v);
      const looseHorn = placeHeelHorn(rand, at, sound);
      // Keep decoys off the track: avoid its ends and middle.
      const P = lesion.path, mid = P[P.length >> 1];
      const avoid = [lesion, { x: mid[0], y: mid[1] }, lesion.pocket, looseHorn];
      const decoys = placeDecoys(rand, at, side, avoid, v);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, limb, lesion }) {
      const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
      return {
        intro:
          `#${cow} went hopping lame on the ${limb} overnight and won't put the toe down. ` +
          'Lift the foot: look along the wall as well as the sole.',
        diagnosisPrompt: 'She’s very sore on this foot. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: `Right. A dark track in the white line of the ${sore} claw, with pus building at its end.`,
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer sits in the sole by the heel. This tracks along the wall: a white-line abscess.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'A bruise stays firm. She flinches along that dark line: a white-line abscess.',
          },
          {
            id: 'foreign', label: 'Foreign body',
            feedback: 'Nothing driven in. Grit got in through a split white line: a white-line abscess.',
          },
          {
            id: 'dd', label: 'Digital dermatitis',
            feedback: 'DD sits on the skin between the heel bulbs. This tracks along the wall: a white-line abscess.',
          },
        ],
        // First-appearance hint, in the intro's how-to list.
        howto: '<li><b>Follow</b> the dark line in from the wall with the knife: it leads to the pus.</li>',
        misreadNote: 'Misread the lesion. A dark line along the wall that she flinches at is a white-line abscess.',
        plan: `Plan: functional trim (steps 1–3), rasp, then pare along the dark line from the wall until it drains, and block the sound ${sound} claw.`,
      };
    },
  },

  // Case D "Strawberry Heel": digital dermatitis. A skin infection, not a horn lesion: the trick
  // is to keep every blade out of the cleft and treat it instead.
  dd: {
    caseId: 'D',
    title: 'Strawberry Heel',
    noun: 'lesion',
    weight: 0.2,
    steps: [...TRIM, 'step5', 'dress'],
    requires: { open: false, block: false, treat: true },
    diagnosis: 'dd',

    place(rand, side, v = {}) {
      const sore = rand() < 0.5 ? CLAW.OUTER : CLAW.INNER;
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const lesion = placeCleft(rand, side, sore, v);
      const looseHorn = placeHeelHorn(rand, at, rand() < 0.5 ? CLAW.OUTER : CLAW.INNER);
      const decoys = placeDecoys(rand, at, side, [lesion, looseHorn], v);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, limb }) {
      return {
        intro:
          `#${cow} is walking on her toes on the ${limb} and the farmer says she kicks in the parlour. ` +
          'Lift the foot: look between the heel bulbs as well as at the sole.',
        diagnosisPrompt: 'She won’t let you near the back of this foot. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'dd', label: 'Digital dermatitis',
            feedback: 'Right. A raw, strawberry-red patch on the skin of the heel cleft: digital dermatitis.',
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer sits in the horn of the sole. This is on the skin between the bulbs: digital dermatitis.',
          },
          {
            id: 'footrot', label: 'Foot rot',
            feedback: 'Foot rot swells the whole foot and smells. This is a raw patch on the skin above the bulbs: digital dermatitis.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'A bruise sits in the horn and stays firm. This is raw skin that she can’t bear touched: digital dermatitis.',
          },
        ],
        // First-appearance hint, in the intro's how-to list.
        howto: '<li><b>No knife in the cleft:</b> clean it, spray it, wrap it.</li>',
        misreadNote: 'Misread the lesion. A raw red patch on the skin between the heel bulbs is digital dermatitis.',
        plan: 'Plan: functional trim (steps 1–3), rasp, flick off the loose heel horn, then spray the lesion and pad and wrap it. No blade in the cleft, and no block.',
      };
    },
  },
};
