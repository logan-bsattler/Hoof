// Cases. makeCase(conditionId, seed, mods) deals a cow with a condition from conditions.js.
// CASE_B "Pressure Point" is the hand-placed original sole ulcer; CASE_A the hand-placed
// routine trim that opens the road before it.

import { CFG } from './config.js';
import { CLAW } from './hoof.js';
import { mulberry32 } from './noise.js';
import { CONDITIONS, DECOY_KINDS, FINDING, FINDING_BURST } from './conditions.js';

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
function traitsLine({ temper, mud, growth, foot, kicker }) {
  const bits = [];
  if (foot === 'front') bits.push('A front foot: the inner claw is the long one here, so the outer claw goes first.');
  if (kicker) bits.push('The farmer warned you: she kicks. Short strokes, and keep clear of her heel.');
  else if (temper >= 0.7) bits.push('She’s a flighty one: expect her to shift about.');
  else if (temper <= 0.3) bits.push('She’s a calm old girl and stands well.');
  if (mud >= 1.25) bits.push('She’s come off a wet yard, caked to the dewclaws.');
  else if (mud <= 0.8) bits.push('Off clean straw: not much muck on her.');
  if (growth >= 1.25) bits.push('Long overdue: there’s a lot of horn on her.');
  return bits.join(' ');
}

// Everything a case needs, written out from where things are on the foot.
function buildCase(condition, { seed, side, foot, excess, lesion, lesions, looseHorn, decoys, temper, mud, growth, kicker, swollen }) {
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
    // Lame higher up the leg (D26): she drags the toe, and its tip is worn square.
    ...(C.toeDrag ? { toeDrag: true } : {}),
    // Trimmed too hard before (WP13.1): her soles start under target, so leave them be.
    ...(C.thinSole ? { thinSole: true } : {}),
    // The claws whose heel bulbs are swollen (WP13.2): art only, drawn by hoofart.js. The
    // condition names them, or its place() does when it depends on the dealt claw.
    ...((swollen ?? C.swollen) ? { swollen: swollen ?? C.swollen } : {}),

    // Excess sole (mm above target) on each claw. Outer hind claws overgrow most.
    excess,

    // The cow herself: temperament 0 calm .. 1 lively, and how much muck she's carrying
    // (1 covered; above 1 caked harder, below 1 patchy).
    temper,
    mud,
    traits: traitsLine({ temper, mud, growth, foot, kicker }),
    // A known kicker (WP12.2): the farmer names her on the visit card.
    ...(kicker ? { kicker: true } : {}),

    // The hidden lesion, its kind named by the condition's diagnosis (null on a sound foot).
    lesion: L,
    ...(lesions ? { lesions: all } : {}),

    // A curl of loose heel horn for step 5, on the sound claw.
    looseHorn,

    // Marks the testers can read: the lesion and the decoys that only look like trouble.
    findings: [...all.map(({ type, ...l }) => ({ kind: type, ...l })), ...decoys].map((f) => ({ ...f, ...FINDING[f.kind], ...(f.stage === 'burst' ? FINDING_BURST : {}) })),

    diagnosis: C.diagnosis,
    ...C.copy({ cow, leg, limb, lesion, lesions }),
  };
}

// The read card's choices in this cow's own order: a seeded shuffle, so the right answer isn't
// always the top button, and a reload shows her the same way.
export function readOptions(cd) {
  const rand = mulberry32((cd.seed ?? 0) ^ 0x3ead);
  const opts = [...cd.diagnosisOptions];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  return opts;
}

// What the card and top bar call her before the read: her tag and foot, not the condition.
export const cowName = (cd) => cd.subtitle.split(' · ')[0];

// Last visit's dug decoys, back as old black pits (WP14.2, D48). A pit takes the place of any
// decoy dealt on the same spot, and is dropped if it would land on the heel horn or a lesion.
function withPits({ decoys, lesion, lesions, looseHorn }, pits) {
  const busy = [...(lesions ?? (lesion ? [lesion] : [])).map((L) => ({ x: L.x, y: L.y, r: L.r * 1.75 + 14 })),
    ...(looseHorn ? [{ ...looseHorn, r: looseHorn.r + 20 }] : [])];
  const ok = pits.filter((p) => busy.every((b) => Math.hypot(p.x - b.x, p.y - b.y) > b.r + 9));
  const kept = decoys.filter((d) => ok.every((p) => Math.hypot(p.x - d.x, p.y - d.y) > 30));
  return [...kept, ...ok.map((p) => ({ kind: 'pit', claw: p.claw, x: p.x, y: p.y, r: 9 }))];
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
//   kicker     true: a known kicker; her temper is floored where kicks start (WP12.2)
//   pits       [{ claw, x, y }]: decoys dug out last visit, back as old black pits (WP14.2)
//   stage      'burst': a white-line abscess that has broken out on its own (WP15.3)
//   partial    'heifer' | 'lately': a routine cow with less to do (WP17.2, see partialWork)
//   apprentice [fault ids]: trimmed already by the farm's apprentice, with these faults (WP17.1)
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
  // A thin-soled cow (WP13.1) is under target on both claws, the big claw up to 0.2 mm taller, whatever
  // her growth: the last trimmer took sole, not toe. The same two draws place her.
  const excess = C.thinSole
    ? { [big]: -0.5 - (hi - 3.5) / 2 + (lo - 1.8) / 6, [small]: -0.5 - (hi - 3.5) / 2 }
    : { [big]: hi * growth, [small]: lo * growth };
  const { side: _s, foot: _f, growth: _g, decoyCount: _n, decoyKinds: _k, lesionSize: _z, lesionAt: _a, calving, oldBlock, pits, stage, partial, apprentice, ...over } = mods;
  // Less to do (WP17.2): a heifer's young feet carry little horn, and a cow trimmed lately has
  // one claw still right from last time. She's livelier too, if a heifer: it's her first crush.
  const short = !calving && condition === 'routine' && PARTIAL[partial] ? partial : null;
  if (short === 'heifer') {
    excess[big] = 0.8 + (hi - 3.5) * 0.25;
    excess[small] = 0.35 + (lo - 1.8) * 0.2;
    over.temper = Math.min(1, (over.temper ?? 0.5) + 0.2);
  } else if (short === 'lately') excess[big] = 0.15;
  // The apprentice's cow (WP17.1): both claws trimmed this morning, each fault on a claw drawn
  // from her seed. A claw left high stands a mm and more above the line.
  const work = !short && !(calving && condition === 'routine') && APPRENTICE_OK.includes(condition) && Array.isArray(apprentice) ? apprenticeWork(seed, apprentice) : null;
  if (work) {
    excess[big] = excess[small] = 0.15;
    if (work.unlevel) excess[work.unlevel] = 1.2;
  }
  // A white-line abscess that has burst on its own (WP15.3); every other condition ignores it.
  if (stage === 'burst' && condition === 'whiteline') placed.lesion = { ...placed.lesion, stage };
  if (pits?.length) placed.decoys = withPits(placed, pits);
  if (over.kicker) over.temper = Math.max(over.temper ?? 0.5, CFG.temper.kickFrom);
  const cd = buildCase(condition, { seed, side, foot, excess, ...placed, temper: 0.5, mud: 1, growth, ...over });
  if (oldBlock) return { ...cd, oldBlock, steps: ['unblock', ...cd.steps] };
  if (short) return partialWork(cd, short, big);
  if (work) {
    const [tag] = cd.subtitle.replace('Holstein ', '').split(' · ');
    return { ...cd, apprentice: work, trimmed: [CLAW.OUTER, CLAW.INNER],
      intro: `The farm’s apprentice trimmed ${tag} this morning and wants you to look her over. Check the work: put right what isn’t, and leave what is.` };
  }
  return calving && condition === 'routine' ? closeToCalving(cd) : cd;
}

// WP17.2: the short routine cows, dealt now and then from Hollins on (farm.partial). The steps
// are the usual ones; they read done where the foot is already right, so there's less to do,
// and taking more off a claw that's already right is over-trimming it.
export const PARTIAL = {
  heifer: { line: (tag, limb) => `A first-calf heifer, ${tag}, in for her first trim on the ${limb}. Young feet, not much horn: check her over and tidy what needs it. She’s never been in a crush before.` },
  lately: { line: (tag, limb, claw) => `${tag} had her ${limb} trimmed a few weeks back, but only the ${claw} claw: the farmer ran out of time. Finish the job, and leave what’s already right.` },
};
function partialWork(cd, kind, big) {
  const [tag, limb] = cd.subtitle.replace('Holstein ', '').split(' · ');
  return {
    ...cd, partial: kind, ...(kind === 'lately' ? { trimmed: [big] } : {}),
    intro: PARTIAL[kind].line(tag, limb, big === CLAW.OUTER ? 'outer' : 'inner'),
  };
}

// WP17.1: the conditions an apprentice can have trimmed (anything else wants a call or no trim),
// and the faults they leave. Each claw fault names the claw; on a lesion cow the lesion itself is
// always missed: the trim done, nothing opened.
export const APPRENTICE_OK = ['routine', 'ulcer', 'whiteline'];
export const APPRENTICE_FAULTS = ['unlevel', 'nodish', 'longtoe', 'rough', 'heel'];
function apprenticeWork(seed, faults) {
  const rand = mulberry32(seed ^ 0xa99e);
  const work = {};
  for (const f of faults) {
    if (!APPRENTICE_FAULTS.includes(f)) continue;
    work[f] = f === 'rough' || f === 'heel' ? true : rand() < 0.5 ? CLAW.OUTER : CLAW.INNER;
  }
  return work;
}
// What the apprentice left, for her ticket. `noun` is the lesion's name on a lesion cow.
export function apprenticeLeft(cd) {
  const w = cd.apprentice;
  if (!w) return null;
  const claw = (c) => (c === CLAW.OUTER ? 'outer' : 'inner');
  const left = [
    cd.lesion ? `the ${cd.noun} under a tidy trim` : null,
    w.unlevel ? `the ${claw(w.unlevel)} claw left high` : null,
    w.nodish ? `no dish on the ${claw(w.nodish)} claw` : null,
    w.longtoe ? `the ${claw(w.longtoe)} toe left long` : null,
    w.rough ? 'grinder swirls not rasped out' : null,
    w.heel ? 'the loose heel horn' : null,
  ].filter(Boolean);
  return left.length ? left : null;
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

// Case A, the first cow on the road (#2): a hand-placed routine trim on the same left hind foot,
// calm and fairly clean, so the guided run teaches the five steps and a read that comes back
// "firm, leave it" before the first ulcer (Case B, cow 2). Two plain marks, the bruise being
// the one the guided run has her test.
export const CASE_A_MODS = {
  side: 'LH',
  excess: { [CLAW.OUTER]: 4.2, [CLAW.INNER]: 2.2 },
  looseHorn: { claw: CLAW.OUTER, x: 108, y: 228, r: 11 },
  decoys: [
    { kind: 'bruise', claw: CLAW.INNER, x: 262, y: 330, r: 12 },
    { kind: 'stain', claw: CLAW.OUTER, x: 140, y: 405, r: 11 },
  ],
  temper: 0.2,
  mud: 0.85,
};
export const CASE_A = makeCase('routine', 132, CASE_A_MODS);
