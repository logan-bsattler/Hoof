// Grade a finished hoof on Balance / Correctness / Restraint / Finish.
// Speed is deliberately absent. Pure function of metrics + session log.

import { CFG, tolOf } from './config.js';
import { CLAW, CLAW_NAME, LOOSE, Z, distToPath, firstClaw, lesionsOf, secondClaw, soundClaw } from './hoof.js';
import { CALLS } from './conditions.js';

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// 100 at `good` or better, 0 at `bad`, linear between.
const ramp = (v, good, bad) => clamp(100 * (bad - v) / (bad - good));

export function newSession() {
  return {
    diagnosis: null, diagnosisCorrect: false, probes: [],
    firstCutClaw: null, dirtyCuts: 0, grinderLesion: false,
    blockAttempts: [], blockBeforeDx: false,
    dishBeforeLevel: false, stepDoneAt: {}, blood: false, nicks: 0, cleftCuts: 0,
    // How she left the crush: null (released) or a CALLS id. cuts: strokes that took horn off.
    call: null, cuts: 0,
    // Deep sepsis (WP13.3): strokes into the old hole, and strokes on the swollen claw.
    holeCuts: 0, sepsisCuts: 0,
  };
}

// Has the trim proper begun, so a cut sets which claw went first? Paring off a false sole
// comes before the trim and doesn't count.
export const trimUnderway = (session, caseDef) => caseDef.lesion?.type !== 'doublesole' || session.stepDoneAt.pareSole != null;

// One tool event drew blood from `cells` cells: a forgivable nick, or the end of the case.
// Records the outcome in the session and returns 'nick' or 'fail'.
export function judgeBlood(session, cells) {
  if (!session.nicks && cells <= CFG.nick.maxCells) {
    session.nicks++;
    return 'nick';
  }
  session.blood = true;
  return 'fail';
}

// How many decoys were carved below the sole around them (mean > 0.75 mm under target).
function decoysDug(hoof, caseDef) {
  let n = 0;
  for (const f of caseDef.findings ?? []) {
    if (lesionsOf(caseDef).some((L) => L.type === f.kind && L.claw === f.claw)) continue;
    let sum = 0, k = 0;
    hoof.stampExact(f.x, f.y, f.r, (i) => {
      if (hoof.claw[i] !== f.claw) return;
      // A thin sole (WP13.1) starts under target: dug is measured from where she started.
      const from = caseDef.thinSole ? Math.min(hoof.zoneTarget(i), hoof.init[i]) : hoof.zoneTarget(i);
      sum += Math.max(0, from - hoof.thick[i]); k++;
    });
    if (k && sum / k > 0.75) n++;
  }
  return n;
}

// Sole cells beside the white-line track dug well below target: hunting for the pus
// instead of following the line to it.
function soleDugBesideTrack(hoof, L) {
  if (L?.type !== 'whiteline' && L?.type !== 'foreign') return 0;
  let n = 0;
  for (let i = 0; i < hoof.n; i++) {
    if (hoof.claw[i] !== L.claw || hoof.tract[i] || !(hoof.zone[i] & Z.LIVE) || (hoof.zone[i] & (Z.DISH | Z.HEEL))) continue;
    const x = hoof.cellX(i), y = hoof.cellY(i);
    // A puncture's hunting ground is round the pocket; the white line's runs the track's length.
    const near = L.type === 'foreign' ? Math.hypot(x - L.pocket.x, y - L.pocket.y) < L.pocket.r + 10
      : distToPath(x, y, L.path).d < L.w + 14 || Math.hypot(x - L.pocket.x, y - L.pocket.y) < L.pocket.r + 14;
    if (near && hoof.thick[i] < hoof.zoneTarget(i) - 1) n++;
  }
  return n;
}

// Is the lesion opened up the way its condition needs?
export function lesionOpened(m, hoof) {
  if (hoof.lesions().length > 1) return hoof.lesions().every((L) => opened(m, hoof, L));
  const L = hoof.caseDef.lesion;
  // Digital dermatitis is skin: there is nothing to open.
  // Nor is there for deep sepsis: what's open is the vet's.
  if (!L || L.type === 'dd' || L.type === 'dds') return true;
  if (L.type === 'toenecrosis') return m.looseRemain[LOOSE.NECRO] <= 0.1;
  if (L.type === 'doublesole') return m.looseRemain[LOOSE.DOUBLE] <= 0.1;
  return L.type === 'whiteline' || L.type === 'foreign' ? hoof.drained : m.looseRemain[LOOSE.ULCER] <= 0.1;
}

// One of a pair of lesions (J3) opened: an ulcer's loose horn off its claw, or the abscess drained.
function opened(m, hoof, L) {
  return L.type === 'whiteline' ? hoof.drained : m.looseRemainAt[L.claw] <= 0.1;
}

// What's left shut on a pair (J3): the ulcer, or the abscess, on the claw not yet opened.
function pairOpenNote(m, hoof) {
  const shut = hoof.lesions().find((L) => !opened(m, hoof, L));
  return shut.type === 'whiteline' ? `The track on the ${CLAW_NAME[shut.claw]} claw was never pared out to the pus. Open both before she goes.`
    : `Loose horn left over the ulcer on the ${CLAW_NAME[shut.claw]} claw. Open both before she goes.`;
}

// The block she leaves the crush wearing, for her record (J2): { claw, kind } or null.
export const blockOn = (hoof) => (hoof.block ? { claw: hoof.block, kind: hoof.blockKind } : null);

// Flushed, padded and wrapped (sprayed only, where the condition wants no wrap: foot rot).
const treated = (m, hoof) => (hoof.caseDef.requires?.wrap === false || hoof.wrapped) && m.lesionTint >= CFG.treat.tintMin;

export function scoreCase(m, session, hoof, caseDef) {
  const T = CFG.sole.target, D = CFG.sole.dishTarget;
  const inner = m.claws[CLAW.INNER], outer = m.claws[CLAW.OUTER];
  const sound = soundClaw(caseDef);
  const notes = [];

  if (session.blood) {
    return {
      failed: true, total: 0, grade: 'Failed', medal: 'none', gait: 'lame', mobility: CFG.mobility.lame,
      parts: { balance: 0, correctness: 0, restraint: 0, finish: 0 },
      notes: ['You cut into the corium and drew blood. Ease off as the sole thins: the gauge and the pink tint are your warning.'],
    };
  }

  // The right call on a cow to be left (J1): full marks for the call, less any horn she didn't
  // need taken off (10 a stroke, at most 30).
  if (caseDef.call === 'leave' && session.call === 'leave') {
    const parts = { balance: 100, correctness: 100, restraint: 100 - Math.min(30, 10 * session.cuts), finish: 100 };
    const W = CFG.weights;
    const total = Math.round(W.balance * parts.balance + W.correctness * parts.correctness + W.restraint * parts.restraint + W.finish * parts.finish);
    const g = CFG.grades.find((gr) => total >= gr.min);
    notes.push(session.cuts ? 'Right call, but you’d started on her. A cow that close to calving is left alone.'
      : 'Textbook. The right call, and nothing done that she didn’t need.');
    return { failed: false, total, grade: g.name, medal: g.medal, gait: CALLS.leave.gait, mobility: null, parts, notes, call: 'leave', block: blockOn(hoof) };
  }

  // A foot that isn't to be trimmed today (foot rot) is graded on what was done instead.
  const trim = caseDef.requires?.trim !== false;
  // Thin soles (WP13.1): the toes are trimmed, the sole is judged on what was taken from it.
  const thin = !!caseDef.thinSole;
  // Deep sepsis (WP13.3): only the sound claw is trimmed, so only it is judged as a trim.
  const dds = caseDef.lesion?.type === 'dds';
  const soundK = dds ? m.claws[sound] : null;

  // Balance: level claws, right height, toe length, heel preserved.
  const level = ramp(Math.abs(m.levelDiff), 0.3, 3);
  // A wider band early on the route (WP7.6) widens the full-marks height by the same slack.
  const slack = Math.max(0, tolOf(caseDef) - CFG.sole.tolerance);
  const off = (k) => thin ? ramp(k.wbTakenMean, 0.3 + slack, 1.5 + slack) : ramp(Math.abs(k.wbMean - T), 0.4 + slack, 3 + slack);
  const height = dds ? off(soundK) : (off(inner) + off(outer)) / 2;
  const toe = 100 * (1 - (dds ? soundK.deadRemain : (inner.deadRemain + outer.deadRemain) / 2));
  const heel = ramp(m.heelRemovedMean, 0.3, 2);
  const balance = !trim ? 100 : dds ? 0.5 * height + 0.35 * toe + 0.15 * heel : 0.4 * level + 0.3 * height + 0.2 * toe + 0.1 * heel;
  if (dds && height < 70) notes.push(`The sound ${CLAW_NAME[sound]} claw is off target at ${soundK.wbMean.toFixed(1)} mm; aim for ~${T}. It carries her now.`);
  if (trim) {
  if (level < 70 && !dds) notes.push(`Claws aren’t level: ${Math.abs(m.levelDiff).toFixed(1)} mm apart. She’ll rock on the taller one.`);
  if (height < 70 && !thin && !dds) notes.push(`Sole height is off target (inner ${inner.wbMean.toFixed(1)} mm, outer ${outer.wbMean.toFixed(1)} mm; aim for ~${T}).`);
  if (toe < 85) notes.push('Overgrown toe left on. Nip back to the dashed line.');
  if (heel < 80) notes.push('You took horn off the heel. Step 1 rule: don’t touch the heel.');
  }

  // Correctness: right read, right order, right claw.
  let correctness = 100;
  // Committing a read without testing the lesion itself counts as no read at all.
  const L = caseDef.lesion;
  // With a lesion on each claw, both must have been tested.
  const pair = lesionsOf(caseDef).length > 1;
  const tested = (type) => session.probes.filter((k) => k === type).length >= lesionsOf(caseDef).filter((l) => l.type === type).length;
  if (!session.diagnosis || (L ? !lesionsOf(caseDef).every((l) => tested(l.type)) : !session.probes.length)) {
    correctness -= 25; notes.push(!L ? 'You never tested the marks. Read before you cut.'
      : pair && session.probes.includes(L.type) ? 'You only tested one sore claw. Test both before you cut.' : 'You never tested the sore spot itself. Read before you cut.');
  } else if (!session.diagnosisCorrect) { correctness -= 15; notes.push(caseDef.misreadNote); }
  const need = caseDef.requires ?? { open: true, block: true, treat: true };
  // Last visit's block still on (J2): that's the fault, not a needless new one.
  const oldOn = !!hoof.oldBlock?.on;
  if (oldOn) { correctness -= 20; notes.push('An old block left on overloads her: it should have come off by now.'); }
  else if (!L && hoof.block) { correctness -= 20; notes.push(caseDef.toeDrag ? 'No block: there’s nothing in the foot to rest. It only tips a bad leg onto one claw.'
    : thin ? 'No block: both soles are thin, and a block puts all her weight on one of them.' : 'She was sound: no block needed. It only tips her onto one claw.'); }
  // Both claws sore (J3): a block puts her whole weight on the other sore one.
  else if (pair && hoof.block) { correctness -= 30; notes.push('The block put her whole weight on the other sore claw. With both claws bad, no block: wrap both and pen her.'); }
  else if (L && !need.block && hoof.block) {
    correctness -= 20;
    notes.push(L.type === 'doublesole' ? 'No block needed: the new sole is sound, just thin. A block only tips her onto one claw.'
      : 'No block needed: the trouble is in the skin, not under a claw. It only tips her onto one claw.');
  }
  if (L && !pair && session.blockAttempts.includes(L.claw)) { correctness -= 30; notes.push('The block went on the sore claw at some point. It belongs on the sound claw.'); }
  // Deep sepsis: no block is its own fault; a block on the swollen claw was charged just above.
  if (dds && need.block && hoof.block !== sound) {
    if (!hoof.block) { correctness -= 15; notes.push('No block. She needed the weight off that claw on the way to the vet.'); }
  } else if (need.block && hoof.block !== sound) { correctness -= 25; notes.push(`No block on the sound claw, so the ${caseDef.noun ?? 'ulcer'} is still carrying weight.`); }
  // Toe necrosis wants the taller wood block; everything else the rubber one.
  const kind = need.block === 'wood' ? 'wood' : 'rubber';
  if (need.block && hoof.block === sound && hoof.blockKind !== kind) {
    correctness -= 15;
    notes.push(kind === 'wood' ? 'Wrong block. With the toe pared back she needs the taller wood block to keep it off the floor.'
      : 'Wrong block. A rubber block was all she needed: the wood one is for a toe pared back to the bone.');
  }
  if (need.open && !lesionOpened(m, hoof)) {
    correctness -= 20;
    notes.push(L.type === 'whiteline' ? 'The track was never pared out to the pus. The abscess is still under pressure.' :
      L.type === 'toenecrosis' ? 'Black, dead horn left at the toe. Pare it back to healthy horn before she goes.' :
      L.type === 'doublesole' ? 'False sole left on. Pare the old layer off so the new sole underneath can harden.' :
      L.type === 'foreign' ? 'The puncture was never pared down to the pus. It’s still under pressure.' :
      pair ? pairOpenNote(m, hoof) : 'Loose horn left over the ulcer: it needs opening up to heal.');
  }
  if (trim && !thin && !dds && (inner.dishMean > D + 1.5 || outer.dishMean > D + 1.5)) { correctness -= 10; notes.push('Dish not modelled on both claws.'); }
  if (trim && !thin && !dds && session.firstCutClaw === secondClaw(caseDef)) {
    const [a, b] = [CLAW_NAME[firstClaw(caseDef)], CLAW_NAME[secondClaw(caseDef)]];
    correctness -= 10;
    notes.push(`Started on the ${b} claw. On a ${caseDef.foot ?? 'hind'} foot, trim the ${a} claw first and match the ${b} to it.`);
  }
  if (need.treat && !treated(m, hoof)) {
    correctness -= 10;
    notes.push(L.type === 'footrot' ? 'The split skin went out unsprayed. Clean it and soak it before she goes.'
      : L.type === 'dd' ? 'The DD lesion went out untreated. Spray it, then pad and wrap it.'
      : pair ? 'Both claws need treating: flush each, then pad and wrap each.' : 'The ulcer went out untreated. Flush it with the spray, then pad and wrap it.');
  }
  // A blade in the heel cleft: skin, not horn, and on a DD foot the raw patch itself.
  if (session.cleftCuts) {
    correctness -= 15;
    notes.push(L?.type === 'dd' ? 'You put a blade into the heel cleft. DD is treated, not cut: clean, spray, wrap.' : 'You cut into the skin of the heel cleft. Keep the blades on horn.');
  }
  if (need.open && session.grinderLesion) {
    correctness -= 10;
    notes.push(L.type === 'doublesole' ? 'Grinder on the false sole: it tore into the thin new sole under it. Lift the old layer with the knife.'
      : 'Grinder over the lesion. Use the knife near the ulcer.');
  }
  if (session.dirtyCuts > 0) { correctness -= 10; notes.push('You cut into a dirty foot. Clean first, then cut.'); }
  if (session.dishBeforeLevel) { correctness -= 5; notes.push('Dished before levelling. Functional steps go 1 → 2 → 3.'); }
  // The call (WP8.1): a cow that needs the pen or the vet and is released, or sent the wrong way.
  const want = caseDef.call ?? null, made = session.call ?? null;
  const referral = (c) => c === 'pen' || c === 'vet';
  if (referral(want) && made !== want) {
    if (referral(made)) {
      correctness -= 15;
      notes.push(want === 'vet' ? 'The pen was right, but she needs the vet as well.' : 'The vet wasn’t needed: soft bedding in the hospital pen was enough.');
    } else {
      correctness -= want === 'vet' ? 25 : 15;
      notes.push(caseDef.callNote ?? (want === 'vet' ? 'This one needs the vet.' : 'This one needed the hospital pen.'));
    }
  }
  correctness = clamp(correctness);

  // Restraint: the golden rule. Err on the side of caution.
  const overFrac = (m.overWB + m.overDish) / Math.max(1, m.wbN + m.dishN);
  const triFrac = m.triCut / Math.max(1, m.triN);
  // Whole-claw over-trimming: below the target band costs, below thin costs a lot.
  let clawOver = 0;
  for (const [name, k] of [['Inner', inner], ['Outer', outer]].filter(([, k]) => !dds || k === soundK)) {
    if (k.wbMean < CFG.sole.thin) {
      clawOver += 40;
      notes.push(`${name} claw ground to ${k.wbMean.toFixed(1)} mm: dangerously thin sole.`);
    } else if (thin) {
      if (k.wbTakenMean > 0.4) {
        clawOver += 15;
        notes.push(`Her sole was already thin: you took ${k.wbTakenMean.toFixed(1)} mm off the ${name.toLowerCase()} claw that she needed.`);
      }
    } else if (k.wbMean < T - tolOf(caseDef)) {
      clawOver += 15;
      notes.push(`${name} claw over-trimmed to ${k.wbMean.toFixed(1)} mm (target ~${T}). Err on the side of caution.`);
    }
  }
  const nickCost = session.nicks ? CFG.nick.restraint : 0;
  if (session.nicks) notes.push('You nicked the corium and she felt it. Ease off as the gauge drops and the sole turns pink.');
  // Digging a decoy out: the marks that stay firm are nothing to open.
  const dug = decoysDug(hoof, caseDef);
  // Hunting for the abscess through the sole instead of following the track.
  const hunted = soleDugBesideTrack(hoof, L) > 6;
  // Strokes on a foot that wasn't to be trimmed: 15 each, at most 30.
  const needless = trim ? 0 : Math.min(30, 15 * session.cuts);
  if (needless) notes.push(caseDef.trimNote ?? 'This foot wasn’t to be trimmed today.');
  // Deep sepsis: a blade in the old hole, or on the swollen claw at all: 15 a stroke, at most 30.
  const holes = session.holeCuts ?? 0, swollenCuts = session.sepsisCuts ?? 0;
  const deep = dds ? Math.min(30, 15 * (holes + swollenCuts)) : 0;
  if (dds && holes) notes.push('That’s the vet’s job now: the infection’s deep in the joint. No blade in the hole.');
  if (dds && swollenCuts) notes.push(`Leave the swollen ${CLAW_NAME[L.claw]} claw: trim the sound one. Every stroke on it hurt her.`);
  const restraint = clamp(100 - needless - deep - overFrac * 300 - triFrac * 200 - Math.min(30, m.thinCells * 0.5) - clawOver - nickCost - dug * 25 - (hunted ? 25 : 0) - (session.cleftCuts ? 20 : 0));
  if (dug) notes.push('You dug into a mark that stayed firm under the testers. Firm marks trim out; leave them at sole height.');
  if (hunted) notes.push(L.type === 'foreign' ? 'You opened a crater round the puncture. A narrow funnel straight down on the mark is all it needs.' : 'You dug into the sole beside the track. Follow the dark line from the wall: it leads to the pus.');
  if (overFrac > 0.05) notes.push('Over-trimmed patches. Thin sole means lameness risk.');
  if (triFrac > 0.1) notes.push('You cut into the toe triangle and took weight-bearing horn.');

  // Finish: clean, smooth, no loose horn.
  const looseLeft = Math.min(1, (m.looseRemain[LOOSE.ULCER] + m.looseRemain[LOOSE.HEEL] + m.looseRemain[LOOSE.NECRO] + m.looseRemain[LOOSE.DOUBLE]) / 2);
  // A thin sole isn't ground, so there are no grinder marks to rasp out.
  const finish = !trim || dds ? ramp(m.mudMean, 0.02, 0.4) : thin ? 0.4 * ramp(m.mudMean, 0.02, 0.4) + 0.6 * 100 * (1 - looseLeft) : 0.3 * ramp(m.mudMean, 0.02, 0.4) + 0.4 * ramp(m.roughMean, 0.12, 0.6) + 0.3 * 100 * (1 - looseLeft);
  if (trim && !thin && !dds && m.roughMean > 0.2) notes.push('Surface is rough. A few rasp passes trues it up.');
  if (trim && m.looseRemain[LOOSE.HEEL] > 0.1) notes.push('Loose heel horn left on (step 5).');

  const parts = { balance, correctness, restraint, finish };
  const W = CFG.weights;
  let total = Math.round(
    W.balance * balance + W.correctness * correctness + W.restraint * restraint + W.finish * finish,
  );
  // A nick caps the grade: nothing that drew blood scores above the cap grade's band.
  if (session.nicks) {
    const k = CFG.grades.findIndex((gr) => gr.name === CFG.nick.capGrade);
    if (k > 0) total = Math.min(total, CFG.grades[k - 1].min - 1);
  }
  // The over-cautious call: a cow sent off the line who only needed her foot seen to. And a cow
  // due to be left (close to calving) who was trimmed or sent to the pen instead.
  const needsWork = CFG.grades.find((gr) => gr.name === 'Needs work');
  const capped = (note) => { total = Math.min(total, CFG.grades[CFG.grades.indexOf(needsWork) - 1].min - 1); notes.unshift(note); };
  if (!want && made) capped(`She didn’t need ${CALLS[made].noun}. ${caseDef.plan}`);
  else if (want === 'leave' && made !== 'leave') capped(caseDef.leaveNote ?? 'She was due any day: she’d have waited for dry-off.');
  const g = CFG.grades.find((gr) => total >= gr.min);

  // How she walks off: balance plus whether the ulcer is relieved.
  // A block on the sore claw loads the ulcer even harder: she'll limp.
  // A sound foot has nothing to relieve; a needless block rocks her onto one claw.
  // DD needs no block: treating it is the relief, and a block only tips her.
  const relief = !L ? (hoof.block ? 40 : 100)
    : !need.block ? (!hoof.block && (!need.treat || treated(m, hoof)) && (!need.open || lesionOpened(m, hoof)) ? 100 : 40)
    : (hoof.block === sound ? 60 : 0) + (lesionOpened(m, hoof) ? 40 : 0);
  // A worn-out old block rocks her as badly as a needless one.
  const gaitScore = 0.5 * balance + 0.5 * (oldOn ? Math.min(relief, 40) : relief);
  const blockedSore = !!L && (pair ? !!hoof.block : hoof.block === L.claw);
  // A cow who needed the pen or the vet and was released goes on getting worse.
  const walked = blockedSore || (referral(want) && !made) ? 'lame'
    : gaitScore >= 75 ? 'sound' : gaitScore >= 50 ? 'tender' : 'lame';
  // A cow sent off the line doesn't walk off: no gait, no mobility score, and she isn't lame.
  // Blocked with both claws sore (J3), she goes to the pen lame all the same.
  // Blocked on the swollen claw (WP13.3), she goes to the vet lame.
  const lameAnyway = pair ? !!hoof.block : dds && blockedSore;
  const gait = lameAnyway ? 'lame' : made ? CALLS[made].gait : walked;

  // AHDB mobility score: a block on the sore claw is the worst case, severely impaired.
  const mobility = made && !lameAnyway ? null : blockedSore ? CFG.mobility.blockedSore : CFG.mobility[gait];

  if (!notes.length) notes.push(dds && made ? 'Textbook. The swollen claw left for the vet, the sound one trimmed and blocked to carry her.'
    : made ? 'Textbook. The right call, and nothing done that she didn’t need.'
    : L ? 'Textbook. Level, relieved, and nothing taken that didn’t need to go.'
    : thin ? 'Textbook. Toes back to length, and the thin sole left alone.'
    : 'Textbook. Level, balanced, and nothing opened that didn’t need opening.');
  return { failed: false, total, grade: g.name, medal: g.medal, gait, mobility, parts, notes, call: made, block: blockOn(hoof) };
}
