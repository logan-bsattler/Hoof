// The case checklist: clean → diagnose → five-step trim → finish.
// Each step is a predicate over hoof metrics + the session log.

import { CFG } from './config.js';
import { CLAW, LOOSE } from './hoof.js';

const { target: T, dishTarget: D, tolerance: TOL } = CFG.sole;

const levelled = (k) => k.deadRemain < 0.12 && Math.abs(k.wbMean - T) <= TOL;

export const STEPS = [
  {
    id: 'clean', label: 'Clean the foot', tool: 'brush',
    tip: 'Start with the wire brush and scrub the muck off. You can’t read a dirty foot.',
    done: (m) => m.mudMean < 0.12,
  },
  {
    id: 'diagnose', label: 'Read it: test anything suspicious', tool: 'probe',
    tip: 'See that dark patch on the outer claw? Tap it with the hoof testers before you commit.',
    done: (m, s) => !!s.diagnosis,
  },
  {
    id: 'step1', label: '1 · Trim the first (inner) claw', tool: 'nippers',
    tip: 'Inner claw first. Nip the overgrown toe back to the dashed line, then grind the sole down until the gauge reads ~7 mm.',
    done: (m) => levelled(m.claws[CLAW.INNER]),
  },
  {
    id: 'step2', label: '2 · Match the outer claw', tool: 'grinder',
    tip: 'Bring the outer claw down to match the inner. Watch the balance beam: level is the goal.',
    done: (m) => levelled(m.claws[CLAW.OUTER]) && Math.abs(m.levelDiff) <= 0.6,
  },
  {
    id: 'step3', label: '3 · Dish out both claws', tool: 'knife',
    tip: 'With the knife, carve the dish along the inner edge of each claw (dashed channel) so weight comes off the ulcer site. Stay out of the toe triangle.',
    done: (m) => m.claws[CLAW.INNER].dishMean <= D + TOL && m.claws[CLAW.OUTER].dishMean <= D + TOL,
  },
  {
    id: 'step4', label: '4 · Open the ulcer, block the sound claw', tool: 'knife',
    tip: 'Pare the loose horn off the ulcer with the knife: open it, don’t carve it. Then glue the block on the SOUND claw.',
    done: (m, s, hoof) => m.looseRemain[LOOSE.ULCER] < 0.1 && hoof.block === CLAW.INNER,
  },
  {
    id: 'step5', label: '5 · Remove loose heel horn', tool: 'knife',
    tip: 'There’s a curl of loose horn at the inner heel. Flick it off with the knife and leave the heel itself alone.',
    done: (m) => m.looseRemain[LOOSE.HEEL] < 0.1,
  },
  {
    id: 'finish', label: 'Finish: rasp it smooth', tool: 'rasp',
    tip: 'True up the grinder marks with the rasp, then release her.',
    done: (m) => m.roughMean < 0.15 && m.claws[CLAW.OUTER].deadRemain < 0.12,
  },
];

export const DONE_TIP = 'That’s a good foot. Release her and watch her walk.';

// Returns per-step status; records first completion time in the session.
export function evaluateSteps(m, session, hoof, now) {
  const status = STEPS.map((st) => ({ id: st.id, done: !!st.done(m, session, hoof) }));
  for (const s of status) {
    if (s.done && session.stepDoneAt[s.id] == null) session.stepDoneAt[s.id] = now;
  }
  // Order check: dishing before both claws were levelled.
  if (session.stepDoneAt.step3 != null && session.stepDoneAt.step2 == null) session.dishBeforeLevel = true;
  const current = status.findIndex((s) => !s.done);
  return { status, current };
}
