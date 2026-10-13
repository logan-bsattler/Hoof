// Saving the round (WP7.7): the route state under one versioned localStorage key.
// Saved when a day starts, after each cow and at the end of the day, so a reload mid-visit
// resumes that day at the next cow (the cow in the crush starts again). Opened farms and the
// tier follow from the reputation, so they aren't stored.
// Every read and write is wrapped: blocked or cleared storage, or a corrupt save, just means a
// fresh round at farm 1. `storage` is passed in so the tests can use a stand-in.

import { FARMS, newRoute, farmById, isOpen } from './route.js';
import { CONDITIONS, CALLS } from './conditions.js';
import { CLAW } from './hoof.js';

export const SAVE_KEY = 'truehoof.round.v1';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const farmIds = new Set(FARMS.map((f) => f.id));
const count = (v) => Number.isFinite(v) && v >= 0;
// How she left the crush (WP8.1); missing on rows saved before it.
const callOk = (c) => c == null || Object.hasOwn(CALLS, c);
// The block she went off in (WP9 J2); missing on rows saved before it, or with no block.
const blockOk = (h) => h.blocked == null || (['rubber', 'wood'].includes(h.blocked) && [CLAW.OUTER, CLAW.INNER].includes(h.blockClaw));
// A past cow is dealt again on a return visit, so every field that deal reads must be one it knows.
const cowOk = (h) => isObj(h) && farmIds.has(h.farm) && typeof h.tag === 'string' && Number.isInteger(h.seed) &&
  Object.hasOwn(CONDITIONS, h.condition) && (h.side === 'LH' || h.side === 'RH') &&
  ['hind', 'front'].includes(h.foot ?? 'hind') && Number.isInteger(h.visit) && h.visit >= 1 && callOk(h.call) && blockOk(h);
// A day summary row, as recordCow writes it.
const rowOk = (r) => isObj(r) && typeof r.tag === 'string' && typeof r.title === 'string' && typeof r.grade === 'string' &&
  typeof r.gait === 'string' && count(r.points) && typeof r.lame === 'boolean' && [null, 'recheck', 'healed', 'calved'].includes(r.back) && callOk(r.call);
// The day in progress: the next visit to an open farm, with one row per cow done so far.
const visitOk = (v, d) => isObj(v) && farmIds.has(v.farm) && isOpen(farmById(v.farm), d.rep) &&
  v.n === (d.visits[v.farm] ?? 0) + 1 && Number.isInteger(v.k) && v.k >= 0 && v.k <= farmById(v.farm).cows &&
  Array.isArray(v.rows) && v.rows.length === v.k && v.rows.every(rowOk);

// A saved round, checked field by field. Anything malformed gives null, except a broken day in
// progress, which is dropped (with its cows) so the round goes back to the last finished day.
export function parseRound(text) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!isObj(d) || d.v !== 1 || !count(d.rep) || !isObj(d.visits) || !isObj(d.best) || !Array.isArray(d.history)) return null;
  for (const [id, n] of [...Object.entries(d.visits), ...Object.entries(d.best)]) if (!farmIds.has(id) || !count(n)) return null;
  if (!d.history.every(cowOk)) return null;
  let visit = visitOk(d.visit, d) ? d.visit : null;
  const today = (h) => visit && h.farm === visit.farm && h.visit === visit.n;
  // Only finished days and today's cows; the history must hold exactly today's done cows.
  let history = d.history.filter((h) => h.visit <= (d.visits[h.farm] ?? 0) || today(h));
  if (visit && history.filter(today).length !== visit.k) {
    visit = null;
    history = history.filter((h) => h.visit <= (d.visits[h.farm] ?? 0));
  }
  return { ...newRoute(), rep: d.rep, visits: d.visits, best: d.best, history, visit };
}

export function loadRound(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(SAVE_KEY);
    return (text && parseRound(text)) || newRoute();
  } catch { return newRoute(); }
}

export function saveRound(route, storage = globalThis.localStorage) {
  const { rep, visits, best, history, visit } = route;
  try { storage?.setItem(SAVE_KEY, JSON.stringify({ v: 1, rep, visits, best, history, visit })); return true; } catch { return false; }
}

export function clearRound(storage = globalThis.localStorage) {
  try { storage?.removeItem(SAVE_KEY); } catch { /* storage blocked */ }
}

// A round worth going back to: at least one day finished.
export const hasProgress = (route) => Object.keys(route.visits).length > 0;
