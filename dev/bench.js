// Dev-only bench (WP10.1): how long a new foot's art takes to get ready, at S=2 and S=3.
// ?src=<dir> points at another copy of src/ (e.g. an old commit exported under reference/)
// to compare; older copies have no prepareFor, so their first sync stands in for it.

const Q = new URLSearchParams(location.search);
const SRC = Q.get('src') || '../src';
const RUNS = Number(Q.get('runs')) || 3;
const out = document.getElementById('out');
const log = (s) => { out.textContent += s + '\n'; };
const ms = (t) => `${t.toFixed(0)} ms`;
const median = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];

const { HoofArt } = await import(`${SRC}/hoofart.js`);
const { Hoof } = await import(`${SRC}/hoof.js`);
const caseMod = await import(`${SRC}/case.js`);
// Old copies only have the fixed Case B; new ones deal a cow per side.
const cow = (side, seed) => (caseMod.makeCase ? caseMod.makeCase('ulcer', seed, { side }) : caseMod.CASE_B);

function ready(art, hoof) {
  const t = performance.now();
  if (art.prepareFor) art.prepareFor(hoof);
  else art.sync(hoof);
  return performance.now() - t;
}

out.textContent = `src ${SRC}, ${navigator.userAgent}\n\n`;
for (const S of [2, 3]) {
  const first = [], same = [], other = [], compose = [];
  for (let r = 0; r < RUNS; r++) {
    // The noise cache lives in the module, so only the first run of a page load is truly cold.
    const art = new HoofArt(S);
    first.push(ready(art, new Hoof(cow('LH', 11 + r))));
    same.push(ready(art, new Hoof(cow('LH', 21 + r))));
    other.push(ready(art, new Hoof(cow('RH', 31 + r))));
    const t = performance.now();
    art.compose(0, 0, art.w, art.h);
    compose.push(performance.now() - t);
    await new Promise((res) => setTimeout(res, 0));
  }
  // In play, each stroke recomposes the rectangle it changed: about 64 logical px square for a
  // grinder pass. Time that on the dirty foot and again with the manure brushed off.
  const art = new HoofArt(S), hoof = new Hoof(cow('LH', 41));
  ready(art, hoof);
  const patch = () => {
    const k = 64 * S, t = [];
    for (let i = 0; i < 60; i++) {
      const x = Math.round((0.25 + 0.5 * ((i * 37) % 60) / 60) * art.w), y = Math.round((0.3 + 0.4 * ((i * 23) % 60) / 60) * art.h);
      const t0 = performance.now();
      art.compose(x, y, Math.min(art.w, x + k), Math.min(art.h, y + k));
      t.push(performance.now() - t0);
    }
    t.sort((a, b) => a - b);
    return `median ${t[30].toFixed(1)} ms, p90 ${t[54].toFixed(1)} ms`;
  };
  const dirtyPatch = patch();
  hoof.mud.fill(0);
  ready(art, hoof); art.sync(hoof);
  const cleanPatch = patch();
  log(`S=${S} (${new HoofArt(S).w}×${new HoofArt(S).h} px)`);
  log(`  first foot     ${first.map(ms).join(', ')}  (run 1 has the cold noise cache)`);
  log(`  next, same side ${ms(median(same))}`);
  log(`  next, other side ${ms(median(other))}`);
  log(`  full compose   ${ms(median(compose))}`);
  log(`  stroke patch, dirty  ${dirtyPatch}`);
  log(`  stroke patch, clean  ${cleanPatch}`);
}
log('\ndone');
