// Zero-dependency static server for local play. Usage: npm start [-- --port 8080] [-- --host 127.0.0.1]
// Listens on every interface by default so a phone on the same Wi-Fi can open the printed LAN URL.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (name) => { const i = process.argv.indexOf(name); return i > -1 ? process.argv[i + 1] : undefined; };
const port = Number(arg('--port') ?? process.env.PORT) || 5173;
const host = arg('--host') ?? process.env.HOST ?? '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

// Virtual adapters (Hyper-V, WSL, VMware, VirtualBox, Docker) aren't reachable from a phone.
const VIRTUAL = /vEthernet|VMware|VirtualBox|Hyper-V|WSL|docker|vbox|utun|Loopback/i;
function lanUrls() {
  const out = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      out.push({ name, url: `http://${a.address}:${port}`, likely: !VIRTUAL.test(name) && !a.address.startsWith('192.168.56.') });
    }
  }
  return out.sort((a, b) => b.likely - a.likely);
}

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(root, url));
    if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'EACCES' ? 403 : 404, { 'Content-Type': 'text/plain' });
    res.end(e.code === 'EACCES' ? 'Forbidden' : 'Not found');
  }
}).listen(port, host, () => {
  console.log(`TRUE HOOF running at http://localhost:${port}`);
  if (host !== '0.0.0.0') return;
  const urls = lanUrls();
  if (!urls.length) return;
  console.log('\nOn your phone (same Wi-Fi), open:');
  for (const u of urls) console.log(`  ${u.url}   ${u.likely ? '' : '(virtual adapter, probably not this one) '}[${u.name}]`);
  console.log('\nIf the phone can\'t connect, allow Node.js through Windows Firewall on Private networks.');
});
