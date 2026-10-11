// The trimmer's route (WP7.4): farms along one road, each visit a fixed number of that farm's
// cows, and a reputation that only goes up and opens the next farm.
// Pure data and state, no DOM: main.js draws the map and plays the visits.
//
// Housing sets what a farm's cows tend to bring (Shearer ch. 4 and ch. 8): cows on concrete
// grow sole ulcers and white-line disease; wet slurry breeds digital dermatitis; grazing cows
// wear their feet down and come in cleaner, with the odd stone bruise or white-line track.

import { CASE_B, makeCase } from './case.js';
import { mulberry32 } from './noise.js';

export const HOUSING = {
  pasture: 'Grazing herd',
  straw: 'Straw yard',
  freestall: 'Freestall on concrete',
  wet: 'Wet yard',
};

// Reputation per cow by grade. A lame walk-off earns nothing, whatever the grade.
export const POINTS = { Textbook: 10, Clean: 7, Sound: 4, 'Needs work': 1, Failed: 0 };
// The whole herd walked off sound.
export const HERD_BONUS = 5;

// One road, in order. `rep` is the reputation that opens the farm. Ranges are [lo, hi]:
// growth scales the excess horn, mud 1 = usual muck, temper 0 calm .. 1 lively.
// `mix` weights the conditions; `front` is the share of front feet.
export const FARMS = [
  {
    id: 'willowbank', name: 'Willow Bank', farmer: 'Ruth Haddon', housing: 'straw', cows: 3, rep: 0,
    intro: 'Ruth keeps a dozen old Holsteins on deep straw. She’ll show you round: a quiet herd to learn on.',
    mix: { ulcer: 0.5, routine: 0.5 }, growth: [0.85, 1.1], mud: [0.7, 1.0], temper: [0.1, 0.35], front: 0,
    // The first cow is the hand-built sole ulcer, with the guided trim on offer.
    first: CASE_B,
  },
  {
    id: 'hollins', name: 'Hollins Farm', farmer: 'Dev Hollins', housing: 'pasture', cows: 4, rep: 30,
    intro: 'Dev grazes his herd out until the frosts. Their feet wear well on grass, but the lane to the parlour is all stones.',
    mix: { routine: 0.5, whiteline: 0.3, ulcer: 0.2 }, growth: [0.75, 1.0], mud: [0.8, 1.15], temper: [0.2, 0.5], front: 0,
  },
  {
    id: 'brackenford', name: 'Brackenford', farmer: 'the Pryce brothers', housing: 'freestall', cows: 4, rep: 100,
    intro: 'Eighty cows housed all year on concrete. The Pryces want the lame ones sorted before the vet comes Friday.',
    mix: { ulcer: 0.45, whiteline: 0.35, routine: 0.2 }, growth: [1.0, 1.3], mud: [0.85, 1.2], temper: [0.25, 0.6], front: 0,
  },
  {
    id: 'toplane', name: 'Top Lane', farmer: 'Mary Ashworth', housing: 'straw', cows: 4, rep: 180,
    intro: 'Mary wants her old girls done front and back. Front feet grow the other way round: mind which claw goes first.',
    mix: { routine: 0.35, ulcer: 0.35, whiteline: 0.3 }, growth: [0.9, 1.25], mud: [0.7, 1.05], temper: [0.15, 0.45], front: 0.5,
  },
  {
    id: 'marshend', name: 'Marsh End', farmer: 'Owen Tull', housing: 'wet', cows: 5, rep: 270,
    intro: 'The yard at Marsh End never dries out, and the slurry scraper broke in March. Expect muck, and what lives in it.',
    mix: { dd: 0.4, ulcer: 0.2, whiteline: 0.2, routine: 0.2 }, growth: [0.95, 1.25], mud: [1.2, 1.5], temper: [0.3, 0.65], front: 0.15,
  },
  {
    id: 'greystone', name: 'Greystone Dairy', farmer: 'Priya Natt', housing: 'freestall', cows: 5, rep: 380,
    intro: 'A big, busy unit. Priya’s heifers have never been in a crush before, and they let you know it.',
    mix: { ulcer: 0.3, whiteline: 0.25, dd: 0.25, routine: 0.2 }, growth: [1.0, 1.3], mud: [0.9, 1.3], temper: [0.55, 0.95], front: 0.2,
  },
  {
    id: 'coldharbour', name: 'Coldharbour', farmer: 'old Mr Fenwick', housing: 'wet', cows: 6, rep: 500,
    intro: 'Nobody’s trimmed at Coldharbour for two years. Long feet, a wet yard and cows that don’t want handling.',
    mix: { ulcer: 0.3, dd: 0.25, whiteline: 0.25, routine: 0.2 }, growth: [1.2, 1.4], mud: [1.15, 1.5], temper: [0.45, 0.95], front: 0.25,
    decoys: [1, 3],
  },
];

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
  const ids = Object.keys(farm.mix);
  let r = rand() * ids.reduce((a, id) => a + farm.mix[id], 0);
  const condition = ids.find((id) => (r -= farm.mix[id]) < 0) ?? ids[0];
  const mods = {
    foot: rand() < farm.front ? 'front' : 'hind',
    growth: between(farm.growth),
    mud: between(farm.mud),
    temper: between(farm.temper),
  };
  if (farm.decoys) mods.decoyCount = Math.floor(between([farm.decoys[0], farm.decoys[1] + 1]));
  return { condition, mods };
}

// The cows of one visit, in order. Ear tags are unique within the visit.
export function visitCases(farm, visit = 1) {
  const cases = [];
  const tags = new Set();
  for (let k = 0; cases.length < farm.cows; k++) {
    let cd;
    if (k === 0 && visit === 1 && farm.first) cd = farm.first;
    else {
      const seed = cowSeed(farm, visit, k);
      const { condition, mods } = farmMods(farm, seed);
      cd = makeCase(condition, seed, mods);
    }
    if (tags.has(cd.subtitle.split(' · ')[0])) continue;
    tags.add(cd.subtitle.split(' · ')[0]);
    cases.push(cd);
  }
  return cases;
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
//   history   every cow trimmed: { farm, visit, tag, seed, condition, foot, side, grade, lame }
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
  return visitCases(farm, route.visit.n);
}

// Record the current cow's result and move to the next. Points land at the end of the day.
export function recordCow(route, caseDef, result) {
  const v = route.visit;
  const { points, lame } = cowPoints(result);
  const tag = caseDef.subtitle.split(' · ')[0];
  v.rows.push({ tag, title: caseDef.title, grade: result.grade, gait: result.failed ? 'lame' : result.gait, points, lame });
  route.history.push({
    farm: v.farm, visit: v.n, tag, seed: caseDef.seed, condition: caseDef.condition,
    foot: caseDef.foot, side: caseDef.side, grade: result.grade, lame,
  });
  v.k++;
  return { points, lame, last: v.k >= farmById(v.farm).cows };
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
  return { farm, rows: v.rows, herdSound, bonus: herdSound ? HERD_BONUS : 0, earned, before, rep: route.rep, opened };
}
