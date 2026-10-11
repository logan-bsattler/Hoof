// Grade a finished hoof on Balance / Correctness / Restraint / Finish.
// Speed is deliberately absent. Pure function of metrics + session log.

import { CFG } from './config.js';
import { CLAW, CLAW_NAME, LOOSE, Z, distToPath, firstClaw, secondClaw, soundClaw } from './hoof.js';

const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
// 100 at `good` or better, 0 at `bad`, linear between.
const ramp = (v, good, bad) => clamp(100 * (bad - v) / (bad - good));

export function newSession() {
  return {
    diagnosis: null, diagnosisCorrect: false, probes: [],
    firstCutClaw: null, dirtyCuts: 0, grinderLesion: false,
    blockAttempts: [], blockBeforeDx: false,
    dishBeforeLevel: false, stepDoneAt: {}, blood: false, nicks: 0, cleftCuts: 0,
  };
}

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
    if (f.kind === caseDef.lesion?.type) continue;
    let sum = 0, k = 0;
    hoof.stampExact(f.x, f.y, f.r, (i) => {
      if (hoof.claw[i] !== f.claw) return;
      sum += Math.max(0, hoof.zoneTarget(i) - hoof.thick[i]); k++;
    });
    if (k && sum / k > 0.75) n++;
  }
  return n;
}

// Sole cells beside the white-line track dug well below target: hunting for the pus
// instead of following the line to it.
function soleDugBesideTrack(hoof, L) {
  if (L?.type !== 'whiteline') return 0;
  let n = 0;
  for (let i = 0; i < hoof.n; i++) {
    if (hoof.claw[i] !== L.claw || hoof.tract[i] || !(hoof.zone[i] & Z.LIVE) || (hoof.zone[i] & (Z.DISH | Z.HEEL))) continue;
    const x = hoof.cellX(i), y = hoof.cellY(i);
    const near = distToPath(x, y, L.path).d < L.w + 14 || Math.hypot(x - L.pocket.x, y - L.pocket.y) < L.pocket.r + 14;
    if (near && hoof.thick[i] < hoof.zoneTarget(i) - 1) n++;
  }
  return n;
}

// Is the lesion opened up the way its condition needs?
export function lesionOpened(m, hoof) {
  const L = hoof.caseDef.lesion;
  // Digital dermatitis is skin: there is nothing to open.
  if (!L || L.type === 'dd') return true;
  return L.type === 'whiteline' ? hoof.drained : m.looseRemain[LOOSE.ULCER] <= 0.1;
}

// Flushed, padded and wrapped.
const treated = (m, hoof) => hoof.wrap >= 2 && m.lesionTint >= CFG.treat.tintMin;

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

  // Balance: level claws, right height, toe length, heel preserved.
  const level = ramp(Math.abs(m.levelDiff), 0.3, 3);
  const height = (ramp(Math.abs(inner.wbMean - T), 0.4, 3) + ramp(Math.abs(outer.wbMean - T), 0.4, 3)) / 2;
  const toe = 100 * (1 - (inner.deadRemain + outer.deadRemain) / 2);
  const heel = ramp(m.heelRemovedMean, 0.3, 2);
  const balance = 0.4 * level + 0.3 * height + 0.2 * toe + 0.1 * heel;
  if (level < 70) notes.push(`Claws aren’t level: ${Math.abs(m.levelDiff).toFixed(1)} mm apart. She’ll rock on the taller one.`);
  if (height < 70) notes.push(`Sole height is off target (inner ${inner.wbMean.toFixed(1)} mm, outer ${outer.wbMean.toFixed(1)} mm; aim for ~${T}).`);
  if (toe < 85) notes.push('Overgrown toe left on. Nip back to the dashed line.');
  if (heel < 80) notes.push('You took horn off the heel. Step 1 rule: don’t touch the heel.');

  // Correctness: right read, right order, right claw.
  let correctness = 100;
  // Committing a read without testing the lesion itself counts as no read at all.
  const L = caseDef.lesion;
  if (!session.diagnosis || (L ? !session.probes.includes(L.type) : !session.probes.length)) {
    correctness -= 25; notes.push(L ? 'You never tested the sore spot itself. Read before you cut.' : 'You never tested the marks. Read before you cut.');
  } else if (!session.diagnosisCorrect) { correctness -= 15; notes.push(caseDef.misreadNote); }
  const need = caseDef.requires ?? { open: true, block: true, treat: true };
  if (!L && hoof.block) { correctness -= 20; notes.push('She was sound: no block needed. It only tips her onto one claw.'); }
  else if (L && !need.block && hoof.block) { correctness -= 20; notes.push('No block needed: the trouble is in the skin, not under a claw. It only tips her onto one claw.'); }
  if (L && session.blockAttempts.includes(L.claw)) { correctness -= 30; notes.push('The block went on the sore claw at some point. It belongs on the sound claw.'); }
  if (need.block && hoof.block !== sound) { correctness -= 25; notes.push(`No block on the sound claw, so the ${L.type === 'whiteline' ? 'abscess' : 'ulcer'} is still carrying weight.`); }
  if (need.open && !lesionOpened(m, hoof)) {
    correctness -= 20;
    notes.push(L.type === 'whiteline' ? 'The track was never pared out to the pus. The abscess is still under pressure.' : 'Loose horn left over the ulcer: it needs opening up to heal.');
  }
  if (inner.dishMean > D + 1.5 || outer.dishMean > D + 1.5) { correctness -= 10; notes.push('Dish not modelled on both claws.'); }
  if (session.firstCutClaw === secondClaw(caseDef)) {
    const [a, b] = [CLAW_NAME[firstClaw(caseDef)], CLAW_NAME[secondClaw(caseDef)]];
    correctness -= 10;
    notes.push(`Started on the ${b} claw. On a ${caseDef.foot ?? 'hind'} foot, trim the ${a} claw first and match the ${b} to it.`);
  }
  if (need.treat && !treated(m, hoof)) {
    correctness -= 10;
    notes.push(L.type === 'dd' ? 'The DD lesion went out untreated. Spray it, then pad and wrap it.' : 'The ulcer went out untreated. Flush it with the spray, then pad and wrap it.');
  }
  // A blade in the heel cleft: skin, not horn, and on a DD foot the raw patch itself.
  if (session.cleftCuts) {
    correctness -= 15;
    notes.push(L?.type === 'dd' ? 'You put a blade into the heel cleft. DD is treated, not cut: clean, spray, wrap.' : 'You cut into the skin of the heel cleft. Keep the blades on horn.');
  }
  if (need.open && session.grinderLesion) { correctness -= 10; notes.push('Grinder over the lesion. Use the knife near the ulcer.'); }
  if (session.dirtyCuts > 0) { correctness -= 10; notes.push('You cut into a dirty foot. Clean first, then cut.'); }
  if (session.dishBeforeLevel) { correctness -= 5; notes.push('Dished before levelling. Functional steps go 1 → 2 → 3.'); }
  correctness = clamp(correctness);

  // Restraint: the golden rule. Err on the side of caution.
  const overFrac = (m.overWB + m.overDish) / Math.max(1, m.wbN + m.dishN);
  const triFrac = m.triCut / Math.max(1, m.triN);
  // Whole-claw over-trimming: below the target band costs, below thin costs a lot.
  let clawOver = 0;
  for (const [name, k] of [['Inner', inner], ['Outer', outer]]) {
    if (k.wbMean < CFG.sole.thin) {
      clawOver += 40;
      notes.push(`${name} claw ground to ${k.wbMean.toFixed(1)} mm: dangerously thin sole.`);
    } else if (k.wbMean < T - CFG.sole.tolerance) {
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
  const restraint = clamp(100 - overFrac * 300 - triFrac * 200 - Math.min(30, m.thinCells * 0.5) - clawOver - nickCost - dug * 25 - (hunted ? 25 : 0) - (session.cleftCuts ? 20 : 0));
  if (dug) notes.push('You dug into a mark that stayed firm under the testers. Firm marks trim out; leave them at sole height.');
  if (hunted) notes.push('You dug into the sole beside the track. Follow the dark line from the wall: it leads to the pus.');
  if (overFrac > 0.05) notes.push('Over-trimmed patches. Thin sole means lameness risk.');
  if (triFrac > 0.1) notes.push('You cut into the toe triangle and took weight-bearing horn.');

  // Finish: clean, smooth, no loose horn.
  const looseLeft = (m.looseRemain[LOOSE.ULCER] + m.looseRemain[LOOSE.HEEL]) / 2;
  const finish = 0.3 * ramp(m.mudMean, 0.02, 0.4) + 0.4 * ramp(m.roughMean, 0.12, 0.6) + 0.3 * 100 * (1 - looseLeft);
  if (m.roughMean > 0.2) notes.push('Surface is rough. A few rasp passes trues it up.');
  if (m.looseRemain[LOOSE.HEEL] > 0.1) notes.push('Loose heel horn left on (step 5).');

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
  const g = CFG.grades.find((gr) => total >= gr.min);

  // How she walks off: balance plus whether the ulcer is relieved.
  // A block on the sore claw loads the ulcer even harder: she'll limp.
  // A sound foot has nothing to relieve; a needless block rocks her onto one claw.
  // DD needs no block: treating it is the relief, and a block only tips her.
  const relief = !L ? (hoof.block ? 40 : 100)
    : !need.block ? (!hoof.block && treated(m, hoof) ? 100 : 40)
    : (hoof.block === sound ? 60 : 0) + (lesionOpened(m, hoof) ? 40 : 0);
  const gaitScore = 0.5 * balance + 0.5 * relief;
  const blockedSore = !!L && hoof.block === L.claw;
  const gait = blockedSore ? 'lame'
    : gaitScore >= 75 ? 'sound' : gaitScore >= 50 ? 'tender' : 'lame';

  // AHDB mobility score: a block on the sore claw is the worst case, severely impaired.
  const mobility = blockedSore ? CFG.mobility.blockedSore : CFG.mobility[gait];

  if (!notes.length) notes.push(L ? 'Textbook. Level, relieved, and nothing taken that didn’t need to go.'
    : 'Textbook. Level, balanced, and nothing opened that didn’t need opening.');
  return { failed: false, total, grade: g.name, medal: g.medal, gait, mobility, parts, notes };
}
