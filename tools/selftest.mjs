// Live self-test: start the built server over stdio, ping Photoshop, read its version
// and the document state. Prints one JSON object; exit code 0 only when Photoshop answered.
//   node tools/selftest.mjs            (uses the same env as the caller: PS_MCP_UXP etc.)
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const srv = spawn(process.execPath, [join(ROOT, 'dist', 'index.js')], {
  env: { ...process.env, PS_MCP_FACADE: '1', LOG_LEVEL: '3' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let buf = '';
const waiters = new Map();
let id = 0;
srv.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try {
      const m = JSON.parse(line);
      if (m.id && waiters.has(m.id)) {
        waiters.get(m.id)(m);
        waiters.delete(m.id);
      }
    } catch {
      /* not JSON-RPC */
    }
  }
});
const send = (method, params, timeoutMs = 40_000) =>
  new Promise((res, rej) => {
    const i = ++id;
    const t = setTimeout(() => rej(new Error(`timeout: ${method}`)), timeoutMs);
    waiters.set(i, (m) => {
      clearTimeout(t);
      res(m);
    });
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n');
  });
const text = (r) => (r.result?.content || []).map((c) => c.text).join('\n');

const out = { ok: false };
try {
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } });
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const ping = await send('tools/call', { name: 'ps_do', arguments: { operation: 'ping', args: {} } });
  out.ping = text(ping);
  out.ok = !ping.result?.isError && /Successfully connected/i.test(out.ping);
  if (out.ok) {
    const v = await send('tools/call', { name: 'ps_do', arguments: { operation: 'get_version', args: {} } });
    out.version = (text(v).match(/\d+\.\d+(\.\d+)?/) || [''])[0];
    const st = await send('tools/call', { name: 'ps_get_state', arguments: {} });
    try {
      const s = JSON.parse(text(st));
      out.documents = s.openDocumentCount ?? (s.hasDocument ? 1 : 0);
      out.via = s.via ?? 'extendscript';
    } catch {
      out.state = text(st).slice(0, 200);
    }
    if (process.env.PS_MCP_UXP) {
      const u = await send('tools/call', { name: 'ps_uxp', arguments: { action: 'ping' } }, 8_000).catch(() => null);
      out.uxp = u && !u.result?.isError ? 'ok' : 'not connected';
    }
  }
} catch (e) {
  out.error = e instanceof Error ? e.message : String(e);
} finally {
  srv.kill();
}
console.log(JSON.stringify(out, null, 2));
process.exit(out.ok ? 0 : 1);
