// Copies the playable game (and nothing else) into www/ for Capacitor to bundle into the app.
// The game itself has no build step; this only exists so the APK doesn't ship docs, tests or node_modules.
import { cp, rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}www`;
const SHIP = ['index.html', 'styles.css', 'manifest.webmanifest', 'sw.js', 'icons', 'src', 'audio', 'assets'];

await rm(out, { recursive: true, force: true });
await mkdir(out);
for (const p of SHIP) await cp(`${root}${p}`, `${out}/${p}`, { recursive: true });
console.log(`Copied ${SHIP.join(', ')} -> www/`);
