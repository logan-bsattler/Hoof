// The playtest log (review 2026-10-15): one line per cow finished, kept on this device so a
// beta tester can export it and send it. Pure entry building plus capped localStorage; main.js
// fills it at the ticket and the road map's link exports it.

export const LOG_KEY = 'truehoof.playlog.v1';
// Cap: the latest cows only, and never more than about this many characters of JSON.
export const LOG_MAX = 400;
export const LOG_CHARS = 250_000;

const r1 = (v) => Math.round(v * 10) / 10;

// One cow, from what the game knows when her ticket comes up.
//   cd       her case          result   scoreCase's result (or a failed one)
//   session  the cow's session (probes, diagnosis, nicks, stepDoneAt in game seconds)
//   ctx      { farm, visit, k, tier, guided, time, start, use: { tool: { n, s } }, loadMs, version }
//            start: the game time she was lifted (the intro card's time doesn't count)
export function logEntry(cd, result, session, ctx) {
  // Time per step: from the previous step's finish (or the start) to this one's, in order.
  const done = Object.entries(session.stepDoneAt ?? {}).filter(([, t]) => t != null).sort((a, b) => a[1] - b[1]);
  const steps = {};
  const start = ctx.start ?? 0;
  let prev = start;
  for (const [id, t] of done) { steps[id] = r1(Math.max(0, t - prev)); prev = Math.max(prev, t); }
  const tools = {};
  for (const [id, u] of Object.entries(ctx.use ?? {})) tools[id] = { n: u.n, s: r1(u.s) };
  return {
    at: new Date().toISOString(),
    version: ctx.version ?? null,
    farm: ctx.farm ?? 'free play', visit: ctx.visit ?? null, cow: ctx.k != null ? ctx.k + 1 : null, tier: ctx.tier ?? null,
    tag: cd.subtitle?.split(' · ')[0] ?? null, seed: cd.seed, condition: cd.condition, foot: cd.foot, side: cd.side,
    ...(cd.partial ? { partial: cd.partial } : {}), ...(cd.apprentice ? { apprentice: Object.keys(cd.apprentice) } : {}),
    ...(cd.back ? { back: cd.back.outcome } : {}),
    guided: !!ctx.guided,
    seconds: r1(Math.max(0, (ctx.time ?? 0) - start)),
    steps,
    tools,
    probes: session.probes?.length ?? 0,
    read: session.diagnosis ?? null,
    misread: session.diagnosis != null && !session.diagnosisCorrect,
    nicks: session.nicks ?? 0,
    failed: !!result.failed,
    grade: result.grade, total: result.total ?? 0, gait: result.gait ?? null, call: result.call ?? null,
    ...(ctx.loadMs != null ? { loadMs: Math.round(ctx.loadMs) } : {}),
  };
}

// The stored log, oldest first. Anything unreadable is an empty log.
export function readLog(store = globalThis.localStorage) {
  try {
    const list = JSON.parse(store.getItem(LOG_KEY));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

// Append one entry, dropping the oldest past LOG_MAX entries or LOG_CHARS of JSON.
export function appendLog(entry, store = globalThis.localStorage) {
  const list = [...readLog(store), entry].slice(-LOG_MAX);
  let json = JSON.stringify(list);
  while (json.length > LOG_CHARS && list.length > 1) {
    list.splice(0, Math.max(1, Math.ceil(list.length / 10)));
    json = JSON.stringify(list);
  }
  try { store.setItem(LOG_KEY, json); } catch { /* storage full or blocked: the log is best effort */ }
  return list.length;
}

// The file a tester sends: the log plus enough about the device to read it by.
export function exportLog(store = globalThis.localStorage, about = {}) {
  return JSON.stringify({ app: 'True Hoof', exported: new Date().toISOString(), ...about, cows: readLog(store) }, null, 1);
}

export function clearLog(store = globalThis.localStorage) {
  try { store.removeItem(LOG_KEY); } catch { /* blocked */ }
}
