// The case checklist: (old block off →) clean → diagnose → five-step trim (rasp after step 3) → treat.
// Each step is a predicate over hoof metrics + the session log. A tip is a string, or a
// function of the case for copy that names a claw (read it through stepTip); so is a label
// (stepLabel). Steps 1 and 2 follow the foot: inner claw first on a hind foot, outer on a front.

import { CFG, tolOf } from './config.js';
import { CLAW, CLAW_NAME, LOOSE, firstClaw, secondClaw, soundClaw } from './hoof.js';
import { CALLS } from './conditions.js';
import { lesionOpened } from './scoring.js';

const { target: T, dishTarget: D } = CFG.sole;

// One-sided on purpose: horn can't be put back, so an over-trimmed claw must
// still let the case progress. Over-trimming is charged in scoring instead.
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const levelled = (k, cd) => k.deadRemain < 0.12 && k.wbMean <= T + tolOf(cd);

export const STEPS = [
  // A cow back with last visit's block still on (WP9 J2): it comes off before anything else.
  {
    id: 'unblock', label: 'Take the old block off', tool: 'knife',
    tip: 'She’s still wearing the block from last time. Tap it with the knife, two or three times, to pry it off. Nothing under it can be trimmed until it’s gone.',
    done: (m, s, hoof) => !hoof.oldBlock?.on,
  },
  {
    id: 'clean', label: 'Clean the foot', tool: 'brush',
    tip: 'Start with the wire brush and scrub the muck off. You can’t read a dirty foot.',
    done: (m) => m.mudMean < 0.12,
  },
  {
    id: 'diagnose', label: 'Read it: test anything suspicious', tool: 'probe',
    tip: 'Clean it, then test anything that looks wrong with the hoof testers. Commit your read when you’re sure.',
    done: (m, s) => !!s.diagnosis,
  },
  // Double sole: the false sole comes off first, so the trim works on the real sole under it.
  {
    id: 'pareSole', label: 'Pare off the false sole', tool: 'knife',
    tip: 'Get the knife under the lifted edge of the old sole and pare it away until it’s new sole all over. Not the grinder: it tears into the thin sole underneath.',
    done: (m) => m.looseRemain[LOOSE.DOUBLE] < 0.1,
  },
  {
    id: 'step1', label: (cd) => `1 · Trim the first (${CLAW_NAME[firstClaw(cd)]}) claw`, tool: 'nippers',
    tip: (cd) => `${cap(CLAW_NAME[firstClaw(cd)])} claw first${cd?.foot === 'front' ? ' on a front foot' : ''}. Nip the overgrown toe back to the dashed line, then grind the sole down until the gauge reads ~7 mm.`,
    done: (m, s, hoof) => levelled(m.claws[firstClaw(hoof?.caseDef)], hoof?.caseDef),
  },
  {
    id: 'step2', label: (cd) => `2 · Match the ${CLAW_NAME[secondClaw(cd)]} claw`, tool: 'grinder',
    tip: (cd) => `Bring the ${CLAW_NAME[secondClaw(cd)]} claw down to match the ${CLAW_NAME[firstClaw(cd)]}. Watch the balance beam: level is the goal.`,
    // Match the second claw to the first claw's actual height, not the fixed target.
    done: (m, s, hoof) => levelled(m.claws[secondClaw(hoof?.caseDef)], hoof?.caseDef) && Math.abs(m.levelDiff) <= 0.6,
  },
  {
    id: 'step3', label: '3 · Dish out both claws', tool: 'knife',
    tip: (cd) => `With the knife, carve the dish along the inner edge of each claw (dashed channel) so weight comes off ${cd.lesion?.type === 'ulcer' ? 'the ulcer site' : 'the sole/heel junction, where ulcers start'}. Stay out of the toe triangle.`,
    done: (m, s, hoof) => Math.max(m.claws[CLAW.INNER].dishMean, m.claws[CLAW.OUTER].dishMean) <= D + tolOf(hoof?.caseDef),
  },
  // The rasp trues up the sole before the block goes on and covers one claw.
  {
    id: 'finish', label: 'Rasp it smooth', tool: 'rasp',
    tip: 'True up the grinder marks on both soles with the rasp before the block covers one of them.',
    done: (m, s, hoof) => m.roughMean < 0.15 && m.claws[secondClaw(hoof?.caseDef)].deadRemain < 0.12,
  },
  {
    id: 'step4', label: '4 · Open the ulcer, block the sound claw', tool: 'knife',
    tip: 'Work the knife across the ulcer’s cap until it gives, then pare back the loose edges. Don’t carve into the open ulcer. Then glue the block on the SOUND claw.',
    done: (m, s, hoof) => m.looseRemain[LOOSE.ULCER] < 0.1 && hoof.block === soundClaw(hoof.caseDef),
  },
  // White-line abscess: step 4 is following the track to the pus, then the block.
  {
    id: 'drain', label: '4 · Pare out the track, block the sound claw', tool: 'knife',
    tip: 'Start where the dark line meets the wall and pare along it with the knife until it drains. Follow the line: don’t dig into the sole. Then glue the block on the SOUND claw.',
    done: (m, s, hoof) => hoof.drained && hoof.block === soundClaw(hoof.caseDef),
  },
  // Puncture: a narrow funnel straight down on the mark until it drains, then the block.
  {
    id: 'funnel', label: '4 · Pare a funnel to the pus, block the sound claw', tool: 'knife',
    tip: 'Pare straight down on the mark with the knife, widening only as far as you must, until it drains. No crater. Then glue the block on the SOUND claw.',
    done: (m, s, hoof) => hoof.drained && hoof.block === soundClaw(hoof.caseDef),
  },
  // Toe necrosis: pare the black toe back to healthy horn, then the wood block on the sound claw.
  {
    id: 'necro', label: '4 · Pare out the black toe, wood block on the sound claw', tool: 'knife',
    tip: 'Pare the black, crumbling horn off the toe tip with the knife until it’s healthy horn all round. Then the block: tap the block tool again for the taller wood one, and glue it on the SOUND claw.',
    done: (m, s, hoof) => m.looseRemain[LOOSE.NECRO] < 0.1 && hoof.block === soundClaw(hoof.caseDef) && hoof.blockKind === 'wood',
  },
  // Both claws sore (J3): open each lesion, and no block on either claw.
  {
    id: 'openBoth', label: '4 · Open both lesions, no block', tool: 'knife',
    tip: 'Open the lesion on each claw with the knife: work each ulcer’s cap until it gives, or follow the dark line to the pus. No block: with both claws sore it would load the other one.',
    done: (m, s, hoof) => lesionOpened(m, hoof) && !hoof.block,
  },
  {
    id: 'step5', label: '5 · Remove loose heel horn', tool: 'knife',
    tip: (cd) => `There’s a curl of loose horn at the ${CLAW_NAME[cd.looseHorn.claw]} heel. Flick it off with the knife and leave the heel itself alone.`,
    done: (m) => m.looseRemain[LOOSE.HEEL] < 0.1,
  },
  {
    id: 'treat', label: 'Treat: flush, pad and wrap the ulcer', tool: 'spray',
    tip: 'Flush the opened ulcer with the spray bottle, then tap it with the pad + wrap: white pad first, then the pink wrap.',
    done: (m, s, hoof) => hoof.wrap >= 2 && m.lesionTint >= CFG.treat.tintMin,
  },
  // Both claws sore (J3): each claw flushed, padded and wrapped on its own.
  {
    id: 'treatBoth', label: 'Treat: flush, pad and wrap both claws', tool: 'spray',
    tip: 'Flush each opened lesion with the spray, then pad and wrap each claw: tap one claw twice, then the other.',
    done: (m, s, hoof) => hoof.wrapped && m.lesionTint >= CFG.treat.tintMin,
  },
  // Digital dermatitis: no blade, just treatment of the skin in the cleft.
  {
    id: 'dress', label: 'Treat: spray and wrap the cleft', tool: 'spray',
    tip: 'Keep the knife out of the cleft. Spray the raw patch until it’s soaked, then tap it with the pad + wrap: white pad first, then the pink wrap.',
    done: (m, s, hoof) => hoof.wrap >= 2 && m.lesionTint >= CFG.treat.tintMin,
  },
  // Foot rot: spray only. No blade near it and no wrap: the vet takes it from here.
  {
    id: 'soak', label: 'Treat: soak the split skin', tool: 'spray',
    tip: 'Spray the split, grey skin between the claws until it’s soaked. No blade near it, and no wrap.',
    done: (m) => m.lesionTint >= CFG.treat.tintMin,
  },
  // A cow who leaves the crush by a call (WP8.1): done when that call is made.
  {
    id: 'refer', label: (cd) => `Send her: ${CALLS[cd.call].label.toLowerCase()}`, tool: null,
    tip: (cd) => cd.call === 'pen' ? 'She needs soft bedding while both claws heal. Tap Vet / leave… beside Release and send her to the hospital pen.'
      : 'This one isn’t yours to fix. Tap Vet / leave… beside Release and make the call.',
    done: (m, s, hoof) => s.call === hoof.caseDef.call,
  },
];

// The treatment steps: the wrap goes on last, after everything else.
const TREAT = new Set(['treat', 'dress', 'treatBoth']);

// The steps this case needs, in the condition's order. Cases without a list run them all.
export function stepsFor(caseDef) {
  return caseDef?.steps ? caseDef.steps.map((id) => STEPS.find((s) => s.id === id)) : STEPS;
}

export function stepTip(step, caseDef) {
  return typeof step.tip === 'function' ? step.tip(caseDef) : step.tip;
}

export function stepLabel(step, caseDef) {
  return typeof step.label === 'function' ? step.label(caseDef) : step.label;
}

// The wrap goes on last: every step but the treatment must be done.
export function trimFinished(status) {
  return status.every((s) => TREAT.has(s.id) || s.done);
}

export const DONE_TIP = 'That’s a good foot. Release her and watch her walk.';

// Returns per-step status; records first completion time in the session.
export function evaluateSteps(m, session, hoof, now) {
  const status = stepsFor(hoof.caseDef).map((st) => ({ id: st.id, done: !!st.done(m, session, hoof) }));
  for (const s of status) {
    if (s.done && session.stepDoneAt[s.id] == null) session.stepDoneAt[s.id] = now;
  }
  // Order check: dishing before both claws were levelled.
  if (session.stepDoneAt.step3 != null && session.stepDoneAt.step2 == null) session.dishBeforeLevel = true;
  const current = status.findIndex((s) => !s.done);
  return { status, current };
}

// The tool to flag for the current step. Steps 1 and 2 each take two tools: the nippers while
// that claw's toe is still long, then the grinder.
export function suggestedTool(current, m, caseDef) {
  if (current < 0) return null;
  const s = stepsFor(caseDef)[current];
  if (s.id !== 'step1' && s.id !== 'step2') return s.tool;
  const k = m.claws[s.id === 'step1' ? firstClaw(caseDef) : secondClaw(caseDef)];
  return k.deadRemain >= 0.12 ? 'nippers' : 'grinder';
}
