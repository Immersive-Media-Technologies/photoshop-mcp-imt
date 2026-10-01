// Мини-клиент stdio MCP: node scripts/probe/mcp-call.mjs <tool> '<json args>' [<tool> '<json>' …]
// Печатает ответ каждого вызова и время. Сервер — dist/index.js с PS_MCP_FACADE=1.
import { spawn } from 'node:child_process';
const srv = spawn('node', ['dist/index.js'], { env: { ...process.env, PS_MCP_FACADE: '1' }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = ''; const waiters = new Map(); let id = 0;
srv.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (!line.trim()) continue; try { const m = JSON.parse(line); if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); } } catch {} } });
const send = (method, params) => new Promise((res) => { const i = ++id; waiters.set(i, res); srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + '\n'); });
await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'probe', version: '0' } });
srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const a = process.argv.slice(2);
for (let k = 0; k < a.length; k += 2) {
  const t0 = Date.now();
  const r = await send('tools/call', { name: a[k], arguments: JSON.parse(a[k + 1] || '{}') });
  const txt = (r.result?.content || []).map((c) => c.text).join('\n');
  console.log(`--- ${a[k]} (${((Date.now() - t0) / 1000).toFixed(1)}s) isError=${!!r.result?.isError}\n${txt.slice(0, 600)}`);
}
srv.kill();
