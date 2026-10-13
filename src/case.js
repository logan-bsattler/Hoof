// Cases. makeCase(conditionId, seed, mods) deals a cow with a condition from conditions.js.
// CASE_B "Pressure Point" is the hand-placed original sole ulcer.

import { CFG } from './config.js';
import { CLAW } from './hoof.js';
import { mulberry32 } from './noise.js';
import { CONDITIONS, DECOY_KINDS, FINDING } from './conditions.js';

const lerp = ([a, b], t) => a + (b - a) * t;

// What a cow's temperament (0 calm .. 1 lively) means in play: the sole thickness she flinches
// at, how hard a flinch jolts, and how often she shifts while you work (0: she stands still).
export function temperament(t = 0.5) {
  const T = CFG.temper;
  const fidget = t >= T.fidgetFrom ? (t - T.fidgetFrom) / (1 - T.fidgetFrom) : -1;
  return {
    flinchAt: lerp(T.flinchAt, t),
    shake: lerp(T.shake, t),
    fidgetEvery: fidget < 0 ? 0 : lerp(T.fidgetEvery, fidget),
    kicks: t >= T.kickFrom,
  };
}

// One line for the intro about anything out of the ordinary with this cow.
function traitsLine({ temper, mud, growth, foot }) {
  const bits = [];
  if (foot === 'front') bits.push('A front foot: the inner claw is the long one here, so the outer claw goes first.');
  if (temper >= 0.7) bits.push('She’s a flighty one: expect her to shift about.');
  else if (temper <= 0.3) bits.push('She’s a calm old girl and stands well.');
  if (mud >= 1.25) bits.push('She’s come off a wet yard, caked to the dewclaws.');
  else if (mud <= 0.8) bits.push('Off clean straw: not much muck on her.');
  if (growth >= 1.25) bits.push('Long overdue: there’s a lot of horn on her.');
  return bits.join(' ');
}

// Everything a case needs, written out from where things are on the foot.
function buildCase(condition, { seed, side, foot, excess, lesion, lesions, looseHorn, decoys, temper, mud, growth }) {
  const C = CONDITIONS[condition];
  const cow = 100 + (((seed - 100) % 900) + 900) % 900; // ear tag #100–#999; seed 214 is #214
  const leg = side === 'RH' ? 'right' : 'left';
  const limb = `${leg} ${foot}`;
  // A lesion on each claw (J3): each carries its own type; `lesion` is the first of them.
  const all = lesions ? lesions.map((l) => ({ ...l })) : lesion ? [{ type: C.diagnosis, ...lesion }] : [];
  const L = all[0] ?? null;
  return {
    id: C.caseId,
    condition,
    seed,
    side,
    foot,
    title: C.title,
    noun: C.noun ?? 'lesion', // what the copy calls the lesion: 'ulcer', 'abscess'
    subtitle: `Holstein #${cow} · ${limb}`,

    // The step ids this job needs, in order (see steps.js).
    steps: C.steps,
    requires: C.requires,
    // How she should leave the crush: null (release), or a CALLS id (WP8.1).
    call: C.call ?? null,

    // Excess sole (mm above target) on each claw. Outer hind claws overgrow most.
    excess,

    // The cow herself: temperament 0 calm .. 1 lively, and how much muck she's carrying
    // (1 covered; above 1 caked harder, below 1 patchy).
    temper,
    mud,
    traits: traitsLine({ temper, mud, growth, foot }),

    // The hidden lesion, its kind named by the condition's diagnosis (null on a sound foot).
    lesion: L,
    ...(lesions ? { lesions: all } : {}),

    // A curl of loose heel horn for step 5, on the sound claw.
    looseHorn,

    // Marks the testers can read: the lesion and the decoys that only look like trouble.
    findings: [...all.map(({ type, ...l }) => ({ kind: type, ...l })), ...decoys].map((f) => ({ ...f, ...FINDING[f.kind] })),

    diagnosis: C.diagnosis,
    ...C.copy({ cow, leg, limb, lesion, lesions }),
  };
}

// A fresh cow with the given condition. Deterministic per seed. `mods` (WP7.3) varies her:
//   side 'LH'|'RH', foot 'hind'|'front'
//   growth     scales the excess horn on both claws (1 = usual)
//   mud        1 = usual; below 1 patchier, above 1 caked harder and slower to brush
//   decoyCount, decoyKinds   how many decoys and of which kinds
//   lesionSize, lesionAt     0..1 within the condition's size and position bands
//   temper     0 calm .. 1 lively (0.5 = usual)
//   calving    true: a routine cow close to calving, to be left till dry-off (WP9 J1)
//   oldBlock   { claw, kind }: last visit's block, still glued on (WP9 J2)
// and can override any of excess, lesion, looseHorn or decoys outright (CASE_B does).
// With no mods she comes out exactly as before the variations existed.
export function makeCase(condition, seed, mods = {}) {
  const C = CONDITIONS[condition];
  if (!C) throw new Error(`Unknown condition: ${condition}`);
  const rand = mulberry32(seed);
  const between = (a, b) => a + rand() * (b - a);
  const dealt = rand() < 0.5 ? 'LH' : 'RH'; // always drawn, so a side mod doesn't reshuffle the rest
  const side = mods.side ?? dealt;
  const foot = mods.foot ?? 'hind';
  // The claw that overgrows: outer on a hind foot, inner on a front one.
  const big = foot === 'front' ? CLAW.INNER : CLAW.OUTER;
  const small = big === CLAW.OUTER ? CLAW.INNER : CLAW.OUTER;
  const placed = C.place(rand, side, {
    big, size: mods.lesionSize, at: mods.lesionAt, decoys: mods.decoyCount, kinds: mods.decoyKinds,
  });
  const growth = mods.growth ?? 1;
  const hi = between(3.5, 5.5), lo = between(1.8, 3.0);
  const excess = { [big]: hi * growth, [small]: lo * growth };
  const { side: _s, foot: _f, growth: _g, decoyCount: _n, decoyKinds: _k, lesionSize: _z, lesionAt: _a, calving, oldBlock, ...over } = mods;
  const cd = buildCase(condition, { seed, side, foot, excess, ...placed, temper: 0.5, mud: 1, growth, ...over });
  if (oldBlock) return { ...cd, oldBlock, steps: ['unblock', ...cd.steps] };
  return calving && condition === 'routine' ? closeToCalving(cd) : cd;
}

// WP9 J1: a routine foot on a cow due to calve within days. The foot is ordinary and so is her
// step list (it would give the call away); the cue is the farmer's word, on the visit card and
// in her intro. The right call is to leave her till dry-off.
function closeToCalving(cd) {
  const days = 4 + (((cd.seed % 9) + 9) % 9);
  const [tag, limb] = cd.subtitle.replace('Holstein ', '').split(' · ');
  return {
    ...cd, calving: days, call: 'leave',
    intro: `Routine herd trim. ${tag} is due on the ${limb} and walks sound. The farmer mentions she’s due to calve in ${days} days.`,
  };
}

// Per-cow variations for a dealt cow, drawn from the seed on a stream of their own (so the
// cow's layout still comes from makeCase's draws). Until the route (WP7.4) sets ranges per farm.
export function dealMods(seed) {
  const rand = mulberry32(seed ^ 0x7a3c);
  const between = (a, b) => a + rand() * (b - a);
  const mods = {
    foot: rand() < 0.15 ? 'front' : 'hind', // front feet rarely need a trim
    growth: between(0.75, 1.35),
    mud: between(0.65, 1.5),
    temper: between(0.1, 0.95),
  };
  // Now and then a different count or kind of decoys than the condition usually brings.
  const d = rand();
  if (d < 0.3) mods.decoyCount = Math.floor(between(0, 4));
  else if (d < 0.4) mods.decoyKinds = [DECOY_KINDS[Math.floor(rand() * DECOY_KINDS.length)]];
  return mods;
}

// Any condition, picked by its weight, with the cow varied by dealMods. Until the route
// (WP7.4) chooses both per farm.
export function dealCase(seed) {
  const ids = Object.keys(CONDITIONS);
  let r = mulberry32(seed ^ 0x5eed)() * ids.reduce((a, id) => a + CONDITIONS[id].weight, 0);
  const id = ids.find((k) => (r -= CONDITIONS[k].weight) < 0) ?? ids[0];
  return makeCase(id, seed, dealMods(seed));
}

// Case B's hand placing, kept so a return visit can deal her again (route.js).
export const CASE_B_MODS = {
  side: 'LH',
  excess: { [CLAW.OUTER]: 4.6, [CLAW.INNER]: 2.4 },
  lesion: { claw: CLAW.OUTER, x: 172, y: 288, r: 12 },
  looseHorn: { claw: CLAW.INNER, x: 292, y: 228, r: 11 },
  decoys: [
    { kind: 'stain', claw: CLAW.INNER, x: 262, y: 300, r: 13 },
    { kind: 'bruise', claw: CLAW.OUTER, x: 122, y: 430, r: 11 },
  ],
};
export const CASE_B = makeCase('ulcer', 214, CASE_B_MODS);
