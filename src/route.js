// The trimmer's route (WP7.4): farms along one road, each visit a fixed number of that farm's
// cows, and a reputation that only goes up and opens the next farm.
// Pure data and state, no DOM: main.js draws the map and plays the visits.
//
// Housing sets what a farm's cows tend to bring (Shearer ch. 4 and ch. 8): cows on concrete
// grow sole ulcers and white-line disease; wet slurry breeds digital dermatitis; grazing cows
// wear their feet down and come in cleaner, with the odd stone bruise or white-line track.

import { CASE_B, CASE_B_MODS, makeCase } from './case.js';
import { CONDITIONS } from './conditions.js';
import { mulberry32 } from './noise.js';
import { CFG } from './config.js';

export const HOUSING = {
  pasture: 'Grazing herd',
  straw: 'Straw yard',
  freestall: 'Freestall on concrete',
  sand: 'Sand-bedded freestalls',
  wet: 'Wet yard',
};

// Sand in the stalls gets into the horn and takes the edge off a knife (Nate 50:07).
export const onSand = (farm) => farm?.housing === 'sand';

// Reputation per cow by grade. A lame walk-off earns nothing, whatever the grade.
export const POINTS = { Textbook: 10, Clean: 7, Sound: 4, 'Needs work': 1, Failed: 0 };
// The whole herd walked off sound.
export const HERD_BONUS = 5;

// One road, in order. `rep` is the reputation that opens the farm. Ranges are [lo, hi]:
// growth scales the excess horn, mud 1 = usual muck, temper 0 calm .. 1 lively.
// `mix` sets each visit's share of conditions (dealt as a deck, see herdDeck); `front` is the
// share of front feet. `calving` is the chance a routine cow is close to calving and should be
// left till dry-off (WP9 J1). `kicker` is the chance a visit has one known kicker among its new
// cows (WP12.2). `footbath` none|poor|good scales the DD share (FOOTBATH, WP12.3). Housing
// 'sand' wears the knife (onSand, WP12.4).
export const FARMS = [
  {
    id: 'willowbank', footbath: 'good', name: 'Willow Bank', farmer: 'Ruth Haddon', housing: 'straw', cows: 3, rep: 0,
    intro: 'Ruth keeps a dozen old Holsteins on deep straw. She’ll show you round: a quiet herd to learn on.',
    mix: { routine: 0.67, ulcer: 0.33 }, growth: [0.85, 1.1], mud: [0.7, 1.0], temper: [0.1, 0.35], front: 0,
    // The first cow is the hand-built sole ulcer, with the guided trim on offer.
    first: CASE_B, firstMods: CASE_B_MODS,
  },
  {
    id: 'hollins', footbath: 'good', name: 'Hollins Farm', farmer: 'Dev Hollins', housing: 'pasture', cows: 4, rep: 30,
    intro: 'Dev grazes his herd out until the frosts. Their feet wear well on grass, but the lane to the parlour is all stones.',
    mix: { routine: 0.5, whiteline: 0.3, ulcer: 0.2 }, growth: [0.75, 1.0], mud: [0.8, 1.15], temper: [0.2, 0.5], front: 0,
  },
  {
    id: 'brackenford', footbath: 'good', name: 'Brackenford', farmer: 'the Pryce brothers', housing: 'freestall', cows: 4, rep: 100,
    intro: 'Eighty cows housed all year on concrete. The Pryces want the lame ones sorted before the vet comes Friday.',
    mix: { ulcer: 0.35, whiteline: 0.25, doublesole: 0.2, routine: 0.2 }, growth: [1.0, 1.3], mud: [0.85, 1.2], temper: [0.25, 0.6], front: 0, calving: 0.5, kicker: 0.33,
  },
  {
    id: 'toplane', footbath: 'good', name: 'Top Lane', farmer: 'Mary Ashworth', housing: 'straw', cows: 4, rep: 180,
    intro: 'Mary wants her old girls done front and back. Front feet grow the other way round: mind which claw goes first.',
    mix: { routine: 0.25, ulcer: 0.25, whiteline: 0.25, puncture: 0.25 }, growth: [0.9, 1.25], mud: [0.7, 1.05], temper: [0.15, 0.45], front: 0.5, calving: 0.5, kicker: 0.33,
  },
  {
    id: 'marshend', name: 'Marsh End', farmer: 'Owen Tull', housing: 'wet', footbath: 'none', cows: 5, rep: 270,
    intro: 'The yard at Marsh End never dries out, and the slurry scraper broke in March. Expect muck, and what lives in it.',
    mix: { dd: 0.2, footrot: 0.2, dds: 0.2, whiteline: 0.2, routine: 0.2 }, growth: [0.95, 1.25], mud: [1.2, 1.5], temper: [0.3, 0.65], front: 0.15, calving: 0.5, kicker: 0.33,
  },
  {
    id: 'greystone', name: 'Greystone Dairy', farmer: 'Priya Natt', housing: 'sand', footbath: 'poor', cows: 5, rep: 380,
    intro: 'A big, busy unit on sand-bedded stalls. Priya’s heifers have never been in a crush before, and they let you know it.',
    mix: { ulcer: 0.2, dd: 0.2, puncture: 0.2, nonfoot: 0.2, routine: 0.2 }, growth: [1.0, 1.3], mud: [0.9, 1.3], temper: [0.55, 0.95], front: 0.2, calving: 0.5, kicker: 0.33,
  },
  {
    id: 'coldharbour', name: 'Coldharbour', farmer: 'old Mr Fenwick', housing: 'wet', footbath: 'none', cows: 6, rep: 500,
    intro: 'Nobody’s trimmed at Coldharbour for two years. Long feet, a wet yard and cows that don’t want handling.',
    mix: { ulcer: 0.2, dd: 0.15, whiteline: 0.15, footrot: 0.15, doublesole: 0.15, routine: 0.2 }, growth: [1.2, 1.4], mud: [1.15, 1.5], temper: [0.45, 0.95], front: 0.25, calving: 0.5, kicker: 0.33,
    decoys: [1, 3],
  },
  {
    id: 'ridgeway', footbath: 'poor', name: 'Ridgeway', farmer: 'Sam Okafor', housing: 'freestall', cows: 6, rep: 640,
    intro: 'Sam bought this herd in last month, lame cows and all. Some were trimmed too hard before they came: look at the toes.',
    mix: { toenecrosis: 0.2, ulcer: 0.2, dd: 0.15, twoclaw: 0.1, thinsole: 0.15, routine: 0.2 }, growth: [1.0, 1.3], mud: [0.9, 1.3], temper: [0.4, 0.9], front: 0.2, calving: 0.5, kicker: 0.33,
    decoys: [1, 3],
  },
];

// ------------------------------------------------------------------ difficulty tiers (WP7.6)
// The help turns down with reputation, never with a menu. Each tier opens with a farm, so the
// road map can say "from here". `guides`: 'on' from the start, 'mistake' (they come on after
// your first slip with that cow) or 'off'. `tolerance` is the on-target band in mm (today's 0.75
// at the top). New cows lean calmer, with an extra decoy to read, early on; livelier later.
export const TIERS = [
  { id: 'apprentice', name: 'Apprentice', rep: 0, guides: 'on', tolerance: 1.0, temper: -0.1, decoys: 1 },
  { id: 'journeyman', name: 'Journeyman', rep: 100, guides: 'mistake', tolerance: 0.85, temper: 0, decoys: 0 },
  { id: 'master', name: 'Master trimmer', rep: 270, guides: 'off', tolerance: 0.75, temper: 0.1, decoys: 0 },
];
export const GUIDES_TEXT = { on: 'Guides on', mistake: 'Guides only after a slip', off: 'Guides off' };

export const tierFor = (rep) => [...TIERS].reverse().find((t) => rep >= t.rep);

// A fresh cow's mods, leaned by the tier. Returning cows keep their own temperament.
export function tierMods(tier, mods) {
  if (!tier) return mods;
  const out = { ...mods, temper: Math.min(1, Math.max(0, mods.temper + tier.temper)) };
  if (tier.decoys) out.decoyCount = (mods.decoyCount ?? 2) + tier.decoys;
  return out;
}

// What the footbath does to the DD share (Nate 1:33:41: none in 20 years on one farm, 30 of 50 on
// a farm with no footbath). The card says it in words.
export const FOOTBATH = {
  none: { dd: 1.5, text: 'No footbath' },
  poor: { dd: 1, text: 'Footbath, rarely changed' },
  good: { dd: 0.25, text: 'Good footbath' },
};

// The farm's mix with its footbath applied to DD.
export function farmMix(farm) {
  const k = FOOTBATH[farm.footbath]?.dd ?? 1;
  return farm.mix.dd ? { ...farm.mix, dd: farm.mix.dd * k } : farm.mix;
}

export const farmById = (id) => FARMS.find((f) => f.id === id);
export const isOpen = (farm, rep) => rep >= farm.rep;

// The seed for cow k on a farm's visit number `visit` (1-based). Fixed per farm and visit,
// so a visit always deals the same herd.
export function cowSeed(farm, visit, k) {
  const f = FARMS.indexOf(farm);
  let h = (0x9e3779b1 ^ (f * 7919 + visit * 104729 + k * 1299709)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  return 1 + ((h ^ (h >>> 13)) % 1_000_000_000);
}

// The farm's condition and variations for one cow, from its own RNG stream.
export function farmMods(farm, seed) {
  const rand = mulberry32(seed ^ 0x2f1a);
  const between = ([a, b]) => a + rand() * (b - a);
  const mix = farmMix(farm);
  const ids = Object.keys(mix);
  let r = rand() * ids.reduce((a, id) => a + mix[id], 0);
  const condition = ids.find((id) => (r -= mix[id]) < 0) ?? ids[0];
  const mods = {
    foot: rand() < farm.front ? 'front' : 'hind',
    growth: between(farm.growth),
    mud: between(farm.mud),
    temper: between(farm.temper),
  };
  if (farm.decoys) mods.decoyCount = Math.floor(between([farm.decoys[0], farm.decoys[1] + 1]));
  // Drawn last, so it leaves every earlier draw as it was. makeCase uses it on routine feet only.
  if (farm.calving && rand() < farm.calving) mods.calving = true;
  return { condition, mods };
}

// A visit's conditions as a deck: the mix shared out over the herd by largest remainder (ties
// to the condition listed first), so Willow Bank is always 1 ulcer and 2 routine and Hollins
// always brings its white line. Independent draws gave streaks that broke the early ramp.
export function herdDeck(farm) {
  const mix = farmMix(farm);
  const ids = Object.keys(mix);
  const total = ids.reduce((a, id) => a + mix[id], 0);
  const share = ids.map((id) => (mix[id] / total) * farm.cows);
  const n = share.map(Math.floor);
  const order = ids.map((_, i) => i).sort((a, b) => (share[b] - n[b]) - (share[a] - n[a]) || a - b);
  for (let k = 0, left = farm.cows - n.reduce((a, b) => a + b, 0); k < left; k++) n[order[k]]++;
  return ids.flatMap((id, i) => Array(n[i]).fill(id));
}

// The deck for one visit, shuffled from the visit's own seed. On a first visit with a hand-built
// cow, she takes her own condition's card.
function visitDeck(farm, visit) {
  const deck = herdDeck(farm);
  if (visit === 1 && farm.first) {
    const i = deck.indexOf(farm.first.condition);
    if (i >= 0) deck.splice(i, 1);
  }
  const rand = mulberry32(cowSeed(farm, visit, 777));
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ------------------------------------------------------------------ return visits (WP7.5)
// A few months on, some of the farm's cows come back by ear tag. A cow that went off lame is a
// recheck: the same foot, the lesion where it was but a little worse, and her points to earn
// this time. A cow that walked off well has healed, and is back for her next routine trim.

// The latest record of every cow trimmed at this farm, in the order first seen.
export function farmCows(history, farmId) {
  const last = new Map();
  for (const h of history) if (h.farm === farmId) last.set(h.tag, h);
  return [...last.values()];
}

// Healed cows that come back on a return visit, besides every recheck.
export const healedBack = (farm) => Math.max(1, Math.floor(farm.cows / 3));

// Who comes back on visit `visit`: every cow still lame, then a few healed ones, picked
// from the visit's own seed. Never more than the herd.
export function returningCows(farm, visit, history) {
  if (visit < 2) return [];
  const cows = farmCows(history, farm.id);
  // A recheck: lame last time, or a condition that always comes back (toe necrosis, WP8.4).
  const recheck = (h) => h.lame || h.recheck;
  // A cow left (or trimmed) close to calving always comes back fresh for her trim (J1).
  const calved = (h) => h.calving && !recheck(h);
  const well = cows.filter((h) => !recheck(h) && !calved(h));
  const rand = mulberry32(cowSeed(farm, visit, 999));
  const healed = [];
  while (well.length && healed.length < healedBack(farm)) healed.push(well.splice(Math.floor(rand() * well.length), 1)[0]);
  return [...cows.filter(recheck), ...cows.filter(calved), ...healed].slice(0, farm.cows);
}

// One cow back again, from her last record. She keeps her tag, foot and temperament (shifted by
// how last time went: cows remember the crush, WP12.1); the horn and muck are this visit's.
export function returnCase(farm, h, visit, k) {
  const now = farmMods(farm, cowSeed(farm, visit, 100 + k)).mods;
  const { excess: _e, calving: _c, oldBlock: _o, ...base } = h.seed === farm.first?.seed && h.visit === 1 ? farm.firstMods : farmMods(farm, h.seed).mods;
  const cow = { side: h.side, foot: h.foot, growth: now.growth, mud: now.mud };
  const mood = remembers(h);
  if (base.temper !== undefined) cow.temper = Math.min(1, Math.max(0, base.temper + (CFG.temper.remember[mood] ?? 0)));
  const back = { visit: h.visit, grade: h.grade, was: h.condition, ...(mood ? { mood } : {}) };
  // She went off in a block (J2): a recheck always comes back still wearing it; a healed cow
  // half the time (the farmer never got round to it), drawn from the visit's own seed.
  const stillOn = h.blocked && ((h.lame || h.recheck) || mulberry32(cowSeed(farm, visit, 500 + k))() < 0.5);
  if (stillOn) cow.oldBlock = { claw: h.blockClaw, kind: h.blocked };
  if (h.kicker) cow.kicker = true;
  if (!h.lame && !h.recheck) {
    if (now.decoyCount !== undefined) cow.decoyCount = now.decoyCount;
    return { ...makeCase('routine', h.seed, cow), back: { ...back, outcome: h.calving ? 'calved' : 'healed' } };
  }
  // Recheck: the lesion has spread to the top of its band (a hand-placed one grows 2 px).
  // A toe necrosis cow always comes back: barely any black toe after a Textbook job, else the full patch.
  const worse = h.recheck && !h.lame ? { lesionSize: h.grade === 'Textbook' ? 0.2 : 1 }
    : base.lesion ? { lesion: { ...base.lesion, r: base.lesion.r + 2 } } : { lesionSize: 1 };
  return { ...makeCase(h.condition, h.seed, { ...base, ...cow, ...worse }), back: { ...back, outcome: 'recheck' } };
}

// How she took last time: 'hurt' if she went off lame (a blood fail is lame), 'easy' after a
// Textbook or Clean job, else nothing.
export function remembers(h) {
  if (h.lame) return 'hurt';
  return h.grade === 'Textbook' || h.grade === 'Clean' ? 'easy' : null;
}

const MOOD_LINE = { hurt: ' She remembers last time: she won’t walk in.', easy: ' She walks straight into the crush.' };

// What the intro says about last time, for a cow that's been trimmed here before.
export function backLine(cd) {
  const b = cd.back;
  if (!b) return '';
  const was = CONDITIONS[b.was];
  const last = `Visit ${b.visit}: ${b.grade}`;
  const line = backText(cd, b, was, last) + (MOOD_LINE[b.mood] ?? '');
  return cd.oldBlock ? `${line} She’s still wearing the ${cd.oldBlock.kind === 'wood' ? 'wood ' : ''}block from visit ${b.visit}.` : line;
}

function backText(cd, b, was, last) {
  if (b.outcome === 'calved') return `Fresh now: she’s calved since visit ${b.visit}. Time for that trim.`;
  if (b.outcome === 'recheck') {
    if (b.was === 'thinsole') return `Back for a recheck. ${last}, and she went off sore: her soles were thin to start with. Still toes only, and leave the sole be.`;
    if (b.was === 'dds') return `Back for a recheck. ${last}, and she went off with nobody calling the vet. That claw is worse: it still needs the vet, not the knife.`;
    if (b.was === 'nonfoot') return `Back for a recheck. ${last}, and she went off lame with nobody calling the vet. She’s no better, and it still isn’t in the foot.`;
    if (was.recheck) return `Back for her recheck. ${last}. The ${cd.noun} never fully heals: pare back what’s black again, wood block, and the vet.`;
    return was.diagnosis === 'sound'
      ? `Back for a recheck. ${last}, and she went off sore. Go gently this time and she earns her points.`
      : `Back for a recheck. ${last}, and she went off lame. The ${cd.noun} has got worse since: put it right and she earns her points this time.`;
  }
  if (b.was === 'dds') return `The vet saw to that bad claw after visit ${b.visit}, and she’s sound on what she has. Just due her trim.`;
  if (b.was === 'thinsole') return `You nipped her toes on visit ${b.visit} (${b.grade}) and left her soles be. They’ve grown back: she’s due a proper trim.`;
  return was.diagnosis === 'sound'
    ? `You trimmed her on visit ${b.visit} (${b.grade}). She’s stayed sound: just due her trim.`
    : `${last} on the ${was.noun ?? 'lesion'}. It’s healed: she’s just due her trim.`;
}

// The cows of one visit, in order: anyone coming back first, then fresh cows dealt from the
// visit's deck (fewer fresh cows on a return visit take the top of it). Ear tags are unique
// within the visit, and a fresh cow never wears a tag already trimmed at this farm.
export function visitCases(farm, visit = 1, history = [], tier = null) {
  const back = returningCows(farm, visit, history);
  const cases = back.map((h, k) => returnCase(farm, h, visit, k));
  const tags = new Set(history.filter((h) => h.farm === farm.id).map((h) => h.tag));
  for (const cd of cases) tags.add(cd.subtitle.split(' · ')[0]);
  const deck = visitDeck(farm, visit);
  // At most one known kicker a visit (WP12.2): a new cow, and none if one is already coming back.
  const kr = mulberry32(cowSeed(farm, visit, 888));
  const kickAt = farm.kicker && kr() < farm.kicker && !cases.some((cd) => cd.kicker) ? cases.length + Math.floor(kr() * (farm.cows - cases.length)) : -1;
  let d = 0;
  for (let k = 0; cases.length < farm.cows; k++) {
    let cd;
    if (k === 0 && visit === 1 && farm.first) cd = farm.first;
    else {
      const seed = cowSeed(farm, visit, k);
      const { condition, mods } = farmMods(farm, seed);
      cd = makeCase(deck[d] ?? condition, seed, { ...tierMods(tier, mods), ...(cases.length === kickAt ? { kicker: true } : {}) });
    }
    if (tags.has(cd.subtitle.split(' · ')[0])) continue;
    tags.add(cd.subtitle.split(' · ')[0]);
    if (cd !== farm.first) d++;
    cases.push(cd);
  }
  // The tier's band rides on each cow (a copy, so Case B itself is never changed).
  return tier ? cases.map((cd) => ({ ...cd, tolerance: tier.tolerance })) : cases;
}

// What one cow earns. Lame (or blood) earns nothing and flags her for the return visit.
export function cowPoints(result) {
  const lame = result.failed || result.gait === 'lame';
  return { points: lame ? 0 : POINTS[result.grade] ?? 0, lame };
}

// ------------------------------------------------------------------ route state
// One plain object, so WP7.7 can save it as JSON:
//   rep       reputation earned so far
//   visits    { farmId: visits finished }
//   best      { farmId: best day's earnings }
//   history   every cow trimmed: { farm, visit, tag, seed, condition, foot, side, grade, lame,
//             back, call, blocked?, blockClaw? } where back is 'recheck', 'healed', 'calved' or null for a cow new to the farm,
//             and call is how she left the crush: null (released) or a CALLS id (WP8.1);
//             blocked is the kind of block she went off in ('rubber' | 'wood') and blockClaw its claw
//   visit     the day in progress, or null: { farm, n, k, rows }

export function newRoute() {
  return { rep: 0, visits: {}, best: {}, history: [], visit: null };
}

// Farms you can drive to now, and the next one on the road (null once all are open).
export function openFarms(route) { return FARMS.filter((f) => isOpen(f, route.rep)); }
export function nextLocked(route) { return FARMS.find((f) => !isOpen(f, route.rep)) ?? null; }

export function startVisit(route, farmId) {
  const farm = farmById(farmId);
  if (!farm) throw new Error(`Unknown farm: ${farmId}`);
  if (!isOpen(farm, route.rep)) throw new Error(`${farm.name} needs reputation ${farm.rep}`);
  route.visit = { farm: farmId, n: (route.visits[farmId] ?? 0) + 1, k: 0, rows: [] };
  return visitHerd(route);
}

// The cows of the visit in progress, dealt as they were when it started: from the history before
// that day (its own cows left out) and the tier, which can't change until the day ends. So a
// visit resumed after a reload gets the same herd.
export function visitHerd(route) {
  const { farm, n } = route.visit;
  const before = route.history.filter((h) => !(h.farm === farm && h.visit === n));
  return visitCases(farmById(farm), n, before, tierFor(route.rep));
}

// Record the current cow's result and move to the next. Points land at the end of the day.
export function recordCow(route, caseDef, result) {
  const v = route.visit;
  const { points, lame } = cowPoints(result);
  const tag = caseDef.subtitle.split(' · ')[0];
  const back = caseDef.back?.outcome ?? null;
  const call = result.call ?? null;
  v.rows.push({ tag, title: caseDef.title, grade: result.grade, gait: result.failed ? 'lame' : result.gait, points, lame, back, call });
  route.history.push({
    farm: v.farm, visit: v.n, tag, seed: caseDef.seed, condition: caseDef.condition,
    foot: caseDef.foot, side: caseDef.side, grade: result.grade, lame, back, call,
    ...(CONDITIONS[caseDef.condition]?.recheck ? { recheck: true } : {}),
    ...(caseDef.calving ? { calving: true } : {}),
    ...(caseDef.kicker ? { kicker: true } : {}),
    // The block she went off in (J2), so a return visit can find it still on.
    ...(result.block ? { blocked: result.block.kind, blockClaw: result.block.claw } : {}),
  });
  v.k++;
  return { points, lame, back, last: v.k >= farmById(v.farm).cows };
}

// Close the day: bank the reputation and say what opened up.
export function endVisit(route) {
  const v = route.visit;
  const farm = farmById(v.farm);
  const herdSound = v.rows.length === farm.cows && v.rows.every((r) => !r.lame);
  const earned = v.rows.reduce((a, r) => a + r.points, 0) + (herdSound ? HERD_BONUS : 0);
  const before = route.rep;
  route.rep += earned;
  route.visits[v.farm] = v.n;
  route.best[v.farm] = Math.max(route.best[v.farm] ?? 0, earned);
  route.visit = null;
  const opened = FARMS.filter((f) => f.rep > before && f.rep <= route.rep);
  // Rechecks that walked off sound this time.
  const mended = v.rows.filter((r) => r.back === 'recheck' && !r.lame).map((r) => r.tag);
  return { farm, rows: v.rows, herdSound, mended, bonus: herdSound ? HERD_BONUS : 0, earned, before, rep: route.rep, opened };
}
