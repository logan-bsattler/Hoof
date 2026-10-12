// Saving the round (WP7.7): the route state under one versioned localStorage key.
// Saved at the end of each day, so a reload mid-visit goes back to the road map with that day
// not yet played. Opened farms and the tier follow from the reputation, so they aren't stored.
// Every read and write is wrapped: blocked or cleared storage, or a corrupt save, just means a
// fresh round at farm 1. `storage` is passed in so the tests can use a stand-in.

import { FARMS, newRoute } from './route.js';
import { CONDITIONS } from './conditions.js';

export const SAVE_KEY = 'truehoof.round.v1';

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const farmIds = new Set(FARMS.map((f) => f.id));
const count = (v) => Number.isFinite(v) && v >= 0;
// A past cow is dealt again on a return visit, so every field that deal reads must be one it knows.
const cowOk = (h) => isObj(h) && farmIds.has(h.farm) && typeof h.tag === 'string' && Number.isInteger(h.seed) &&
  Object.hasOwn(CONDITIONS, h.condition) && (h.side === 'LH' || h.side === 'RH') &&
  ['hind', 'front'].includes(h.foot ?? 'hind') && Number.isInteger(h.visit) && h.visit >= 1;

// A saved round, checked field by field. Anything malformed gives null.
export function parseRound(text) {
  let d;
  try { d = JSON.parse(text); } catch { return null; }
  if (!isObj(d) || d.v !== 1 || !count(d.rep) || !isObj(d.visits) || !isObj(d.best) || !Array.isArray(d.history)) return null;
  for (const [id, n] of [...Object.entries(d.visits), ...Object.entries(d.best)]) if (!farmIds.has(id) || !count(n)) return null;
  if (!d.history.every(cowOk)) return null;
  return { ...newRoute(), rep: d.rep, visits: d.visits, best: d.best, history: d.history };
}

export function loadRound(storage = globalThis.localStorage) {
  try {
    const text = storage?.getItem(SAVE_KEY);
    return (text && parseRound(text)) || newRoute();
  } catch { return newRoute(); }
}

// The day in progress is never saved: only finished days count.
export function saveRound(route, storage = globalThis.localStorage) {
  const { rep, visits, best, visit } = route;
  const history = visit ? route.history.filter((h) => !(h.farm === visit.farm && h.visit === visit.n)) : route.history;
  try { storage?.setItem(SAVE_KEY, JSON.stringify({ v: 1, rep, visits, best, history })); return true; } catch { return false; }
}

export function clearRound(storage = globalThis.localStorage) {
  try { storage?.removeItem(SAVE_KEY); } catch { /* storage blocked */ }
}

// A round worth going back to: at least one day finished.
export const hasProgress = (route) => Object.keys(route.visits).length > 0;
