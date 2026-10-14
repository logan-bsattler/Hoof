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
  foreign: {
    look: 'a small, too-neat dark mark mid-sole', feel: 'a sharp flinch on the mark only',
    probeText: 'She flinches hard, but only right on the mark. It’s too neat for a stain: something went in here.',
    diagnosedText: 'A puncture. Pare a narrow funnel straight down until it drains: no crater.',
  },
  dd: {
    look: 'raw red patch in the heel cleft', feel: 'very sore to the touch',
    probeText: 'She snatches the foot away. Raw, strawberry-red skin in the cleft, sore to the lightest touch.',
    diagnosedText: 'Digital dermatitis. No blade near it: clean it, spray it, wrap it.',
  },
  footrot: {
    look: 'split grey skin in the cleft', feel: 'hot and swollen across both claws',
    probeText: 'She pulls the foot away. The skin between the claws is split, grey and stinking, and the whole foot is hot and puffy.',
    diagnosedText: 'Foot rot. No blade near it: clean the split, spray it, and get the vet.',
  },
  toenecrosis: {
    look: 'black, crumbling horn at the toe tip', feel: 'very sore at the tip only',
    probeText: 'She jerks the foot away. The toe tip is black and crumbling, and it stinks.',
    diagnosedText: 'Toe necrosis. Pare the black horn back, block the sound claw with wood, and get the vet.',
  },
  doublesole: {
    look: 'a sole patch with a lifted edge', feel: 'hollow, not sore',
    probeText: 'It sounds hollow under the testers, and she doesn’t mind. A layer of old sole has lifted off the one underneath.',
    diagnosedText: 'A double sole. Get the knife under the lifted edge and pare the false sole off.',
  },
  dds: {
    look: 'one claw swollen over an old weeping hole', feel: 'extremely sore on that claw',
    probeText: 'She nearly comes out of the crush. That claw is hot and tight right up the bulb, and the old hole at the heel weeps grey pus.',
    diagnosedText: 'It’s gone deep. Leave this claw for the vet: trim and block the sound one.',
  },
  twoclaw: {
    look: 'sore spots on both claws', feel: 'sore on both claws',
    probeText: 'Sore on both claws.',
    diagnosedText: 'Both claws are bad. Open both, wrap both, no block, and the hospital pen.',
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

// A puncture mid-sole: a perfect small dot, or a short ruled line, too regular for a stain.
// x, y: the mark's centre. r: the dot's radius, or for a line its half-length, with ends a, b
// and half-width w. pocket: the pus under it, a little wider than the mark.
function placePuncture(rand, side, claw, v = {}) {
  const y = band(rand, 345, 430, v.at);
  const [l, r] = clawSpan(claw, y, side);
  const x = l + (r - l) * band(rand, 0.42, 0.58);
  const line = rand() < 0.5;
  const ang = rand() * Math.PI, hl = 6 + 2 * (v.size ?? rand());
  const L = { claw, x, y, shape: line ? 'line' : 'dot', r: line ? hl : 4.5, w: 2.2 };
  L.a = [x - Math.cos(ang) * hl, y - Math.sin(ang) * hl];
  L.b = [x + Math.cos(ang) * hl, y + Math.sin(ang) * hl];
  L.pocket = { x, y, r: band(rand, 8.5, 10, v.size) + (line ? 2 : 0) };
  return L;
}

// Toe necrosis at the axial tip of `claw`'s toe, in the toe triangle: a round patch of black horn.
function placeNecro(rand, side, claw, v = {}) {
  const s = clawSide(claw, side);
  return { claw, x: GEOM.midX + s * band(rand, 26, 34), y: band(rand, 558, 568, v.at), r: band(rand, 14, 18, v.size) };
}

// A double sole on `claw`: a round patch of false sole mid-sole, well in from both walls,
// between the dish channel and the abaxial white line.
function placeDouble(rand, side, claw, v = {}) {
  const s = clawSide(claw, side);
  return { claw, x: GEOM.midX + s * band(rand, 70, 80), y: band(rand, 320, 420, v.at), r: band(rand, 26, 32, v.size) };
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

// A sole ulcer on `claw` at the sole/heel junction, as the ulcer case places it.
function placeUlcer(rand, at, claw, v = {}) {
  const between = (a, b) => a + rand() * (b - a);
  return { type: 'ulcer', claw, x: at(claw, between(22, 36)), y: band(rand, 275, 305, v.at), r: band(rand, 10, 16, v.size) };
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
      const lesion = { claw: sore, x: at(sore, between(22, 36)), y: band(rand, 275, 305, v.at), r: band(rand, 10, 16, v.size) };
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
            feedback: 'A puncture is a neat round hole or a ruled line mid-sole. This is a soft, springy spot at the sole/heel junction: a sole ulcer.',
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
            feedback: 'A puncture is a neat hole or line mid-sole, and only the mark hurts. This dark line runs in from the wall and she flinches all along it: a white-line abscess.',
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

  // Case F "Something Sharp" (WP8.3): a puncture. The tell is the shape: too regular for a
  // stain. The job is a narrow funnel straight down to the pus, not a crater.
  puncture: {
    caseId: 'F',
    title: 'Something Sharp',
    noun: 'puncture',
    weight: 0.12,
    steps: [...TRIM, 'funnel', 'step5', 'treat'],
    requires: { open: true, block: true, treat: true },
    diagnosis: 'foreign',

    place(rand, side, v = {}) {
      const sore = rand() < 0.5 ? CLAW.OUTER : CLAW.INNER;
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const lesion = placePuncture(rand, side, sore, v);
      const looseHorn = placeHeelHorn(rand, at, otherClaw(sore));
      const decoys = placeDecoys(rand, at, side, [{ ...lesion, r: lesion.pocket.r + 6 }, looseHorn], v);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, limb, lesion }) {
      const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
      return {
        intro:
          `#${cow} came in off the track lame on the ${limb}, and she’s been pointing the toe. ` +
          'Clean it and look hard at every mark: some are just stains.',
        diagnosisPrompt: 'She’s sore on this foot. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'foreign', label: 'Foreign body',
            feedback: `Right. A neat ${lesion.shape === 'line' ? 'line' : 'hole'} in the ${sore} sole: something went in, and the pus is under it.`,
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer sits at the sole/heel junction and springs. This is a neat mark mid-sole: a puncture.',
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: 'A white-line abscess tracks in from the wall. This mark is mid-sole and too neat: a puncture.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'A bruise is a blurry patch and stays firm. This is too regular, and she flinches on it: a puncture.',
          },
        ],
        howto: '<li><b>Too neat to be a stain?</b> A perfect dot or straight line is something driven in. Pare a narrow funnel down to it.</li>',
        misreadNote: 'Misread the lesion. A perfectly round dot or ruled line mid-sole that she flinches on is a puncture.',
        plan: `Plan: functional trim (steps 1–3), rasp, then pare a narrow funnel straight down on the mark until it drains, block the sound ${sound} claw, flush and wrap the ${sore} claw.`,
      };
    },
  },

  // Case G "Black Toe" (WP8.4): toe necrosis. Dead horn at the toe tip, sometimes down to the
  // bone. The trimmer pares it back and puts the tall wood block on the sound claw; the bone is the vet's.
  toenecrosis: {
    caseId: 'G',
    title: 'Black Toe',
    noun: 'toe',
    weight: 0.1,
    steps: [...TRIM, 'necro', 'step5', 'refer'],
    requires: { open: true, block: 'wood', treat: false },
    call: 'vet',
    recheck: true,
    diagnosis: 'toenecrosis',

    place(rand, side, v = {}) {
      const big = v.big ?? CLAW.OUTER;
      const sore = rand() < 0.7 ? big : otherClaw(big);
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const lesion = placeNecro(rand, side, sore, v);
      const looseHorn = placeHeelHorn(rand, at, otherClaw(sore));
      const decoys = placeDecoys(rand, at, side, [lesion, looseHorn], v);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, limb, lesion }) {
      const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
      return {
        intro:
          `#${cow} has been lame on the ${limb} for weeks and nothing's shifted it. The farmer says she was trimmed hard last time. ` +
          'Lift the foot and look right at the toe tips.',
        diagnosisPrompt: 'She’s been lame a long time. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'toenecrosis', label: 'Toe necrosis',
            feedback: `Right. Black, crumbling horn at the tip of the ${sore} toe: toe necrosis, and it can go down to the bone.`,
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer springs at the sole/heel junction. This is black, dead horn at the toe tip: toe necrosis.',
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: 'A white-line abscess tracks in from the wall to a pocket of pus. This is dead horn at the very tip of the toe: toe necrosis.',
          },
          {
            id: 'foreign', label: 'Foreign body',
            feedback: 'A puncture is a neat hole or line mid-sole. This is a whole black, crumbling toe tip: toe necrosis.',
          },
        ],
        howto: '<li><b>Wood block:</b> tap the block tool a second time to swap rubber for the taller wood block.</li>',
        misreadNote: 'Misread the lesion. Black, crumbling horn at the toe tip that she can’t bear touched is toe necrosis.',
        callNote: 'Toe necrosis can reach the bone: she needs the vet. Released, she’ll only get worse.',
        plan: `Plan: functional trim (steps 1–3), rasp, pare the black toe back to healthy horn, wood block on the sound ${sound} claw, then send her to the vet.`,
      };
    },
  },

  // Case H "Two Soles" (WP8.5): a double sole. An old layer of sole that has lifted off a new
  // one after a bout of laminitis or a bruise. She isn't lame: it turns up at a routine trim.
  // The job is to pare the false sole off with the knife before the trim. No block, no wrap.
  doublesole: {
    caseId: 'H',
    title: 'Two Soles',
    noun: 'false sole',
    weight: 0.1,
    steps: ['clean', 'diagnose', 'pareSole', 'step1', 'step2', 'step3', 'finish', 'step5'],
    requires: { open: true, block: false, treat: false },
    diagnosis: 'doublesole',

    place(rand, side, v = {}) {
      const big = v.big ?? CLAW.OUTER;
      const claw = rand() < 0.7 ? big : otherClaw(big);
      const at = (c, axial) => GEOM.midX + clawSide(c, side) * axial;
      const lesion = placeDouble(rand, side, claw, v);
      const looseHorn = placeHeelHorn(rand, at, otherClaw(claw));
      const decoys = placeDecoys(rand, at, side, [lesion, looseHorn], v);
      return { lesion, looseHorn, decoys };
    },

    copy({ cow, limb, lesion }) {
      const claw = CLAW_NAME[lesion.claw];
      return {
        intro:
          `Routine herd trim. #${cow} is due on the ${limb} and walks sound, but she had a bad spell after calving. ` +
          'Check every mark before you cut.',
        diagnosisPrompt: 'She’s sound on it. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'doublesole', label: 'Double sole',
            feedback: `Right. A layer of old sole lifting off the ${claw} claw, hollow under it: a double sole. The new sole is underneath.`,
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer springs and she feels it. This is hollow and she doesn’t mind: a false sole lifting off the new one.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'A bruise stays firm and flat. This patch is hollow, with an edge you could get a blade under: a double sole.',
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: 'An abscess tracks in from the wall and she flinches. This patch is mid-sole, hollow and painless: a double sole.',
          },
        ],
        howto: '<li><b>Hollow, not sore?</b> A false sole. Pare it off with the knife before you trim: the grinder tears into the thin new sole under it.</li>',
        misreadNote: 'Misread the mark. A patch with a lifted edge that sounds hollow and doesn’t hurt is a double sole.',
        plan: `Plan: pare the false sole off the ${claw} claw with the knife, then the functional trim (steps 1–3), rasp and the loose heel horn. No block, no wrap.`,
      };
    },
  },

  // Case I "Two Sore Claws" (WP9 J3): a lesion on each claw, an ulcer on the big one and an
  // ulcer or a white-line abscess on the other (D23). No block: it would put her whole weight on
  // the other sore claw. Open both, wrap both, and send her to the hospital pen.
  twoclaw: {
    caseId: 'I',
    title: 'Two Sore Claws',
    noun: 'lesions',
    weight: 0.1,
    steps: [...TRIM, 'openBoth', 'step5', 'treatBoth', 'refer'],
    requires: { open: true, block: false, treat: true },
    call: 'pen',
    diagnosis: 'twoclaw',

    // `lesion` is the big claw's ulcer; `lesions` holds both, one per claw, each with its own type.
    place(rand, side, v = {}) {
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const big = v.big ?? CLAW.OUTER, other = otherClaw(big);
      const first = placeUlcer(rand, at, big, v);
      const second = rand() < 0.5 ? placeUlcer(rand, at, other, v) : { type: 'whiteline', ...placeTract(rand, side, other, v) };
      const looseHorn = placeHeelHorn(rand, at, rand() < 0.5 ? CLAW.OUTER : CLAW.INNER);
      const avoid = [first, second, looseHorn];
      if (second.path) avoid.push(second.pocket, { x: second.path[second.path.length >> 1][0], y: second.path[second.path.length >> 1][1] });
      const decoys = placeDecoys(rand, at, side, avoid, v);
      return { lesion: first, lesions: [first, second], looseHorn, decoys };
    },

    copy({ cow, limb, lesions }) {
      const [a, b] = lesions;
      const what = b.type === 'ulcer' ? 'an ulcer on each claw' : `an ulcer on the ${CLAW_NAME[a.claw]} claw and a white-line abscess on the ${CLAW_NAME[b.claw]}`;
      return {
        intro:
          `#${cow} is hobbling on the ${limb}, rocking from one claw to the other and never settling. ` +
          'Lift the foot and test both claws.',
        diagnosisPrompt: 'She won’t stand on either claw. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'twoclaw', label: 'Lesions on both claws',
            feedback: `Right. There’s ${what}: both claws are sore, so neither can carry a block.`,
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: `There is an ulcer, but the other claw is sore too: ${what}.`,
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: `Not only that: both claws tested sore. There’s ${what}.`,
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: `A bruise stays firm. Both claws gave under the testers: ${what}.`,
          },
        ],
        howto: '<li><b>Both claws sore?</b> No block: it would load the other sore claw. Wrap each one, and send her to the hospital pen.</li>',
        misreadNote: 'Misread the foot. Both claws tested sore: a lesion on each, and no sound claw to block.',
        callNote: 'With both claws sore she needed soft bedding in the hospital pen, not the yard.',
        plan: 'Plan: functional trim (steps 1–3), rasp, open both lesions, then flush, pad and wrap each claw. No block: it would load the other sore claw. Then send her to the hospital pen.',
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

  // Case E "Hot Foot" (WP8.2): foot rot. An infection of the skin between the claws that swells
  // the whole foot. The trimmer cleans and sprays it; the antibiotics are the vet's. The lesson is
  // in what isn't done: no trim, no block, no wrap, and the call.
  footrot: {
    caseId: 'E',
    title: 'Hot Foot',
    noun: 'foot rot',
    weight: 0.12,
    steps: ['clean', 'diagnose', 'soak', 'refer'],
    requires: { open: false, block: false, treat: true, wrap: false, trim: false },
    call: 'vet',
    diagnosis: 'footrot',
    // The whole foot is up: both heel bulbs swell (WP13.2).
    swollen: [CLAW.OUTER, CLAW.INNER],

    // The split runs the whole cleft (hoof.js marks it on both claws); `lesion` is where the
    // testers' read card points, on one claw's side of it.
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
          `#${cow} went lame on the ${limb} overnight, and the farmer says the foot stinks. ` +
          'Lift it and look between the claws as well as at the soles.',
        diagnosisPrompt: 'She’s very lame and the foot is hot. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'footrot', label: 'Foot rot',
            feedback: 'Right. Split, grey, stinking skin between the claws, and swelling right across the foot: foot rot.',
          },
          {
            id: 'dd', label: 'Digital dermatitis',
            feedback: 'DD is a neat raw patch with no swelling. This whole foot is swollen and split: foot rot.',
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer springs in the horn of the sole. These soles are firm: the trouble is the split skin between the claws. Foot rot.',
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: 'An abscess swells one claw. This swelling runs across both, with the skin split between them: foot rot.',
          },
          {
            id: 'dds', label: 'Deep sepsis',
            feedback: 'Deep sepsis swells one claw, over an old hole in its sole. Here both claws are up and the skin between them is split: foot rot.',
          },
        ],
        howto: '<li><b>Not every foot gets trimmed.</b> Some go to the vet: <b>Vet / leave…</b> sits beside Release.</li>',
        misreadNote: 'Misread the foot. Swelling across both claws, split grey skin between them and the smell: that’s foot rot.',
        callNote: 'Foot rot needs the vet’s antibiotics. Released, she’ll only get worse.',
        trimNote: 'No trim today. Foot rot needs the vet, not the knife: every stroke was one she didn’t need.',
        plan: 'Plan: clean it, soak the split skin with the spray, then send her to the hospital pen and call the vet. No trim, no block, no wrap.',
      };
    },
  },

  // Case J "Higher Up" (D26): lame, but nothing in the foot (Shearer: non-foot lameness). The
  // foot is clean and firm everywhere; the trouble is a hock, knee or stifle, and it's the vet's.
  // The tells: the farmer's word, a swollen joint or a dragged toe in the intro, toe tips worn
  // square from dragging (art and testers), and every mark firm. Her last step asks whether to
  // trim or send her, so the panel doesn't give the call away.
  nonfoot: {
    caseId: 'J',
    title: 'Higher Up',
    noun: 'leg',
    weight: 0.1,
    steps: ['clean', 'diagnose', 'decide'],
    requires: { open: false, block: false, treat: false, trim: false },
    call: 'vet',
    diagnosis: 'nonfoot',
    toeDrag: true,

    place(rand, side, v = {}) { return CONDITIONS.routine.place(rand, side, v); },

    copy({ cow, limb }) {
      const front = limb.endsWith('front');
      const joint = front ? 'knee' : 'hock';
      const cue = cow % 2 ? `Her ${joint} is up like a grapefruit, hot and puffy.`
        : 'She’s swinging the leg stiff and dragging the toe through the muck.';
      const hint = (cow >> 1) % 2 ? 'The farmer saw her go down on the scraped concrete by the parlour on Tuesday.'
        : 'The farmer says she was ridden hard by a bulling heifer at the weekend.';
      return {
        intro:
          `#${cow} is lame on the ${limb}. ${cue} ${hint} ` +
          'Lift the foot and see if it’s in there.',
        diagnosisPrompt: 'She’s lame on this leg. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'nonfoot', label: 'Nothing in the foot: it’s higher up',
            feedback: `Right. The foot is clean and firm everywhere, and the toe’s worn square from dragging. The trouble is up the leg: the ${joint} or above. That’s the vet’s.`,
          },
          {
            id: 'sound', label: 'Nothing: she’s sound',
            feedback: `The foot is sound, but she isn’t: she’s lame on it. Nothing in the foot means it’s higher up, at the ${joint} or above. That’s the vet’s.`,
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer springs under the testers. Everything here stayed firm: the lameness is higher up the leg.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'Old marks that stay firm aren’t what’s laming her. The foot is clean: the trouble is higher up the leg.',
          },
        ],
        howto: '<li><b>Lame, but the foot’s clean?</b> Look up the leg. Trimming a sound foot won’t fix a bad hock: call the vet.</li>',
        misreadNote: `Misread the cow. Lame, with a clean, firm foot and a toe worn from dragging: the trouble is higher up, at the ${joint} or above.`,
        callNote: 'Nothing in the foot was laming her: the leg needed the vet. Released, she’s still lame.',
        trimNote: 'No trim today. The trouble was up the leg: every stroke on a sound foot was one she didn’t need.',
        plan: 'Plan: no trim today. The foot is sound: the lameness is up the leg. Send her to the hospital pen and call the vet.',
      };
    },
  },

  // Case K "Thin Soles" (WP13.1): trimmed too hard before, so her soles are already under
  // target while her toes are still long. The job is the toes only: nip them back and leave
  // the sole alone. The trap is the habit of grinding every sole to the gauge. makeCase deals
  // her excess under target on both claws, level with each other; the testers read the sole
  // as giving (hoof.js), and the scorer counts horn taken from where she started.
  thinsole: {
    caseId: 'K',
    title: 'Thin Soles',
    noun: 'sole',
    weight: 0.08,
    steps: ['clean', 'diagnose', 'toeOnly', 'step5'],
    requires: { open: false, block: false, treat: false },
    diagnosis: 'thinsole',
    thinSole: true,

    place(rand, side, v = {}) { return CONDITIONS.routine.place(rand, side, v); },

    copy({ cow, limb }) {
      return {
        intro:
          `#${cow} is due on the ${limb}. She’s tender on the yard concrete and walks short, ` +
          'and her toes look long. Test the sole before you take anything off it.',
        diagnosisPrompt: 'She walks short on hard ground. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'thinsole', label: 'Thin soles: leave them',
            feedback: 'Right. The sole gives under the testers and shows pink: somebody took too much last time. Nip the long toes back and leave the sole alone.',
          },
          {
            id: 'sound', label: 'Nothing: she’s sound',
            feedback: 'She’d be routine if there were horn to take. Under the testers it gives: it’s thin, so nip the toes and stop.',
          },
          {
            id: 'bruise', label: 'Sole bruise',
            feedback: 'A bruise is one firm, reddish patch. Here the whole sole gives under the testers: it’s thin all over.',
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'An ulcer springs in one spot. This sole gives everywhere you test: it’s just thin.',
          },
        ],
        howto: '<li><b>Thin sole?</b> If it gives under the testers, nip the toes and leave the sole: there’s nothing spare to take.</li>',
        misreadNote: 'Misread the foot. A sole that gives under the testers and shows pink is thin: it needed the toes nipped, nothing more.',
        plan: 'Plan: nip both toes back to the line and flick off any loose heel horn. No grinder and no dish: the sole is already under 7 mm.',
      };
    },
  },

  // Case L "Gone Deep" (WP13.3): deep digital sepsis. An ulcer left too long, so the infection
  // has gone into the joint of one claw. Only that claw swells, which is the tell against foot
  // rot. Opening it further is the vet's work: the trimmer trims and blocks the sound claw and
  // calls the vet. hoof.js marks the hole (Z.SEPSIS) and keeps every blade out of it.
  dds: {
    caseId: 'L',
    title: 'Gone Deep',
    noun: 'swollen claw',
    weight: 0.08,
    steps: ['clean', 'diagnose', 'trimSound', 'blockSound', 'refer'],
    requires: { open: false, block: true, treat: false },
    call: 'vet',
    diagnosis: 'dds',

    // The hole sits at the ulcer site, mostly on the big claw. No loose heel horn (r 0): the
    // sound claw's trim is all the knife work she gets.
    place(rand, side, v = {}) {
      const at = (claw, axial) => GEOM.midX + clawSide(claw, side) * axial;
      const big = v.big ?? CLAW.OUTER;
      const sore = rand() < 0.8 ? big : otherClaw(big);
      const { type: _t, ...lesion } = placeUlcer(rand, at, sore, v);
      const sound = otherClaw(sore);
      const looseHorn = { claw: sound, x: at(sound, 90), y: 228, r: 0 };
      const decoys = placeDecoys(rand, at, side, [lesion], v);
      return { lesion, looseHorn, decoys, swollen: [sore] };
    },

    copy({ cow, limb, lesion }) {
      const sore = CLAW_NAME[lesion.claw], sound = CLAW_NAME[soundClaw({ lesion })];
      return {
        intro:
          `#${cow} has been lame on the ${limb} for a fortnight, and now she’s off her feed. ` +
          'The farmer thought it was foot rot. Lift the foot and look at both claws.',
        diagnosisPrompt: 'She’s very lame and won’t eat. What are you looking at?',
        diagnosisOptions: [
          {
            id: 'dds', label: 'Deep sepsis',
            feedback: `Right. The ${sore} claw is swollen on its own over an old, weeping ulcer: the infection has gone deep, into the joint. That’s the vet’s.`,
          },
          {
            id: 'footrot', label: 'Foot rot',
            feedback: 'Foot rot swells both claws and splits the skin between them. Here one claw is up and the cleft is whole: it’s gone deep in that claw.',
          },
          {
            id: 'ulcer', label: 'Sole ulcer',
            feedback: 'There was an ulcer, but the swelling above it says it’s gone deep. That’s past opening: it’s the vet’s.',
          },
          {
            id: 'whiteline', label: 'White-line abscess',
            feedback: 'An abscess tracks in from the wall to a pocket of pus. This is an old hole at the heel with the whole claw swollen above it: it’s gone deep.',
          },
        ],
        howto: '<li><b>One claw swollen?</b> If it’s gone deep, no blade on that claw. Trim and block the sound one, then call the vet.</li>',
        misreadNote: 'Misread the foot. One claw swollen on its own over an old, weeping hole: the infection has gone deep.',
        callNote: 'Deep sepsis needs the vet: the joint may have to come out. Released, she’ll only get worse.',
        plan: `Plan: leave the ${sore} claw alone. Trim the sound ${sound} claw (nip the toe, grind it level), glue a rubber block on it, then send her to the hospital pen and call the vet.`,
      };
    },
  },
};
