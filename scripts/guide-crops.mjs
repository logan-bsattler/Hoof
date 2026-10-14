// Render the field guide's condition crops (WP11.2) to assets/guide/<condition>.png.
// With the dev server up (npm start): node scripts/guide-crops.mjs [condition…]
// Each is dev/guide-crop.html?cond=<id> (which holds the seeds and crop boxes), screenshotted
// by headless Edge or Chrome at 240×240. Set BROWSER to the browser's path if it isn't found.
// Re-run after art changes.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const IDS = ['routine', 'ulcer', 'whiteline', 'puncture', 'toenecrosis', 'doublesole', 'twoclaw', 'dd', 'footrot', 'nonfoot', 'thinsole'];
const OUT = fileURLToPath(new URL('../assets/guide/', import.meta.url));
const BASE = process.env.BASE ?? 'http://localhost:5173';
const browser = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => p && existsSync(p));
if (!browser) throw new Error('No Edge or Chrome found: set BROWSER to its path.');

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
for (const id of IDS) {
  if (only.length && !only.includes(id)) continue;
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=240,240', '--virtual-time-budget=20000',
    `--screenshot=${OUT}${id}.png`, `${BASE}/dev/guide-crop.html?cond=${id}`,
  ], { stdio: 'ignore' });
  console.log('wrote', id);
}
