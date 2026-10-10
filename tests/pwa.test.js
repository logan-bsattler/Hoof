import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('service worker precaches every game module and every listed asset exists', () => {
  const sw = read('sw.js');
  const list = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  for (const f of readdirSync(new URL('src/', root)).filter((f) => f.endsWith('.js'))) {
    assert.ok(list.includes(`src/${f}`), `sw.js ASSETS is missing src/${f}`);
  }
  for (const a of list.filter((a) => a !== './')) assert.ok(existsSync(new URL(a, root)), `missing asset ${a}`);
});

test('every recording the game loads exists, is precached, is small, and is credited', () => {
  const sw = read('sw.js');
  const names = JSON.parse(read('src/audio.js').match(/const SAMPLE_FILES = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
  const credits = read('audio/CREDITS.md');
  for (const n of names) {
    const p = `audio/${n}.mp3`;
    assert.ok(existsSync(new URL(p, root)), `missing ${p}`);
    assert.ok(sw.includes(`'${p}'`), `sw.js ASSETS is missing ${p}`);
    assert.ok(statSync(new URL(p, root)).size <= 30 * 1024, `${p} is over 30 KB`);
    assert.ok(credits.includes(`${n}.mp3`), `audio/CREDITS.md does not list ${n}.mp3`);
  }
  assert.match(read('scripts/build-web.mjs'), /'audio'/);
});

test('manifest is installable: standalone, portrait, 192 + 512 icons that exist', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'portrait');
  assert.ok(m.name && m.short_name && m.start_url);
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  for (const i of m.icons) assert.ok(existsSync(new URL(i.src, root)), `missing icon ${i.src}`);
  assert.match(read('index.html'), /rel="manifest" href="manifest.webmanifest"/);
});
