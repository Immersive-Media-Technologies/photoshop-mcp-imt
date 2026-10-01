#!/usr/bin/env node
// ChatGPT (and any client that accepts only remote MCP servers) needs a public HTTPS URL.
// This starts two things on the machine that runs Photoshop and prints the URL to paste:
//   1. supergateway — exposes this stdio server as Streamable HTTP on 127.0.0.1:<port>/mcp
//   2. a tunnel — cloudflared (no account needed) or ngrok (needs `ngrok config add-authtoken`)
// Usage:  npx -p @immersive-media-technologies/photoshop-mcp-imt photoshop-mcp-imt-chatgpt [--port 8000] [--tunnel cloudflared|ngrok]
//         node tools/chatgpt-gateway.mjs                      (from a source checkout)
// Ctrl+C stops both. While it runs, whoever knows the URL can drive your Photoshop — keep it
// running only during the session and close it afterwards.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = join(ROOT, 'dist', 'index.js');
const PRODUCT = 'PS-MCP-IMT';
const SERVER_ENV = { PS_MCP_FACADE: '1', PS_MCP_UXP: '1' };

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const port = Number(opt('--port', '8000'));
const wanted = opt('--tunnel', '');
const isWin = process.platform === 'win32';

if (!existsSync(ENTRY)) {
  console.error(`${PRODUCT}: ${ENTRY} not found — run npm run build first`);
  process.exit(1);
}
const has = (bin) => spawnSync(isWin ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;
const tunnel = wanted || (has('cloudflared') ? 'cloudflared' : has('ngrok') ? 'ngrok' : '');
if (!tunnel || !has(tunnel)) {
  console.error(`${PRODUCT}: no tunnel tool found. Install one:`);
  console.error('  cloudflared (no account needed):  macOS  brew install cloudflared');
  console.error('                                    Windows winget install Cloudflare.cloudflared');
  console.error('  or ngrok (free account):          https://ngrok.com/download  then  ngrok config add-authtoken <token>');
  process.exit(1);
}

console.log(`${PRODUCT} → ChatGPT gateway`);
console.log(`  server:  ${ENTRY}`);
console.log(`  gateway: http://127.0.0.1:${port}/mcp  (supergateway, Streamable HTTP)`);
console.log(`  tunnel:  ${tunnel}`);
console.log('');

const npx = isWin ? 'npx.cmd' : 'npx';
const gateway = spawn(
  npx,
  ['-y', 'supergateway', '--stdio', `"${process.execPath}" "${ENTRY}"`, '--outputTransport', 'streamableHttp', '--port', String(port), '--streamableHttpPath', '/mcp'],
  { env: { ...process.env, ...SERVER_ENV }, stdio: ['ignore', 'pipe', 'pipe'], shell: isWin }
);
gateway.stdout.on('data', (d) => process.stdout.write(`[gateway] ${d}`));
gateway.stderr.on('data', (d) => process.stderr.write(`[gateway] ${d}`));

const tun =
  tunnel === 'cloudflared'
    ? spawn('cloudflared', ['tunnel', '--url', `http://127.0.0.1:${port}`, '--no-autoupdate'], { stdio: ['ignore', 'pipe', 'pipe'] })
    : spawn('ngrok', ['http', String(port), '--log', 'stdout', '--log-format', 'json'], { stdio: ['ignore', 'pipe', 'pipe'] });

let announced = false;
function announce(url) {
  if (announced) return;
  announced = true;
  const mcpUrl = `${url.replace(/\/$/, '')}/mcp`;
  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Public MCP URL:  ${mcpUrl}`);
  console.log('');
  console.log('  ChatGPT → Settings → Connectors → Create (developer mode)');
  console.log(`  → MCP server URL: ${mcpUrl}   → Authentication: none`);
  console.log('');
  console.log('  Anyone who knows this URL can drive your Photoshop while this runs.');
  console.log('  Ctrl+C stops the gateway and the tunnel.');
  console.log('════════════════════════════════════════════════════════════');
}
const sniff = (chunk) => {
  const m = String(chunk).match(/https:\/\/[a-z0-9.-]+\.(trycloudflare\.com|ngrok(-free)?\.(app|dev|io))/i);
  if (m) announce(m[0]);
};
tun.stdout.on('data', sniff);
tun.stderr.on('data', (d) => {
  sniff(d);
  if (!announced && /error|failed/i.test(String(d))) process.stderr.write(`[${tunnel}] ${d}`);
});
tun.on('exit', (code) => {
  console.error(`[${tunnel}] exited (${code})`);
  shutdown(1);
});
gateway.on('exit', (code) => {
  console.error(`[gateway] exited (${code})`);
  shutdown(1);
});

function shutdown(code = 0) {
  for (const p of [gateway, tun]) {
    try {
      if (isWin) spawnSync('taskkill', ['/pid', String(p.pid), '/f', '/t'], { stdio: 'ignore' });
      else p.kill('SIGTERM');
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
