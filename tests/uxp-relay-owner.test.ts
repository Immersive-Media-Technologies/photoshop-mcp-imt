// 06.11 (live case): an older copy of this server (a Claude Desktop extension, 0.4.6) held the
// bridge port and expected another token header. The plugin's polls got 401, and every relayed
// command said «the plugin is not running». Now the relaying instance asks the owner with its token
// and names the real cause.
import { createServer, type Server } from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

let fake: Server;
let port = 0;

beforeAll(async () => {
  fake = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, bridge: 'ps-mcp-uxp', pending: 0, pluginSeen: false, lastPollAt: 0 }));
      return;
    }
    // an old owner: every other request without ITS header → 401
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'bridge_token_required' }));
  });
  await new Promise<void>((r) => fake.listen(0, '127.0.0.1', () => r()));
  const a = fake.address();
  port = typeof a === 'object' && a ? a.port : 0;
  const dir = mkdtempSync(join(tmpdir(), 'psmcp-token-'));
  const tokenFile = join(dir, 'uxp-bridge.token');
  writeFileSync(tokenFile, 'a'.repeat(48) + '\n');
  process.env.PHOTOSHOP_UXP_BRIDGE_PORT = String(port);
  process.env.PS_MCP_UXP_TOKEN_FILE = tokenFile;
  process.env.PS_MCP_UXP = '1';
});

afterAll(async () => {
  const srv = await import('../src/platform/uxp-bridge-server.js');
  await srv.shutdownUxpBridgeServer();
  await new Promise<void>((r) => fake.close(() => r()));
});

describe('relay to an incompatible port owner', () => {
  it('names the older copy instead of «the plugin is not running»', async () => {
    const srv = await import('../src/platform/uxp-bridge-server.js');
    const client = await import('../src/platform/uxp-bridge-client.js');
    await srv.ensureUxpBridgeServer();
    expect(srv.uxpBridgeMode()).toBe('relay');
    expect(await client.isUxpBridgeReachable()).toBe(false);
    const problem = srv.uxpBridgeProblem();
    expect(problem).toContain(`127.0.0.1:${port}`);
    expect(problem).toContain('does not accept this bridge token');
    expect(problem).toContain('older version');
  });
});
