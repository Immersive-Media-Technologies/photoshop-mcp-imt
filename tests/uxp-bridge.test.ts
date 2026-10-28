// UXP bridge as the backup transport: mode, recognising a failure of the main path,
// and the facade fallback (the bridge is stubbed).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({
  available: true,
  mode: 'fallback' as 'off' | 'fallback' | 'prefer',
  calls: [] as string[],
}));
vi.mock('../src/platform/uxp-transport.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/platform/uxp-transport.js')>();
  return {
    ...actual,
    uxpMode: () => bridge.mode,
    uxpAvailable: async () => bridge.available,
    uxp: {
      ping: async () => (bridge.calls.push('ping'), { ok: true, data: { ok: true, version: '27.9' } }),
      state: async () => (bridge.calls.push('state'), { ok: true, data: { hasDocument: true, name: 'a.psd' } }),
      layers: async () => (bridge.calls.push('layers'), { ok: true, data: { layers: [] } }),
      batchPlay: async () => (bridge.calls.push('batchplay'), { ok: true, data: [{}] }),
      evalJs: async () => (bridge.calls.push('script'), { ok: true, data: 42 }),
      exportPng: async (p: string) => (bridge.calls.push('export:' + p), { ok: true, data: { path: p } }),
      save: async () => (bridge.calls.push('save'), { ok: true, data: {} }),
    },
  };
});

import { isTransportFailure } from '../src/platform/uxp-transport.js';
const { uxpMode } = await vi.importActual<typeof import('../src/platform/uxp-transport.js')>('../src/platform/uxp-transport.js');
import { buildFacadeTools } from '../src/product/facade.js';
import { ToolRegistry, type ToolResult } from '../src/core/tool-registry.js';

function registryWith(getStateResult: ToolResult): ToolRegistry {
  const reg = new ToolRegistry();
  const stub = (name: string, r: ToolResult) =>
    reg.register(name, { tool: { name, description: 'x', inputSchema: { type: 'object', properties: {} } }, handler: async () => r });
  stub('photoshop_get_state', getStateResult);
  stub('photoshop_get_layers', { content: [{ type: 'text', text: 'Photoshop busy: modal' }], isError: true });
  stub('photoshop_export_as', { content: [{ type: 'text', text: 'ok' }] });
  return reg;
}
const textOf = (r: ToolResult): string => r.content.map((c) => (c as { text?: string }).text ?? '').join('');

describe('uxp transport (pure)', () => {
  it('uxpMode follows the environment variables', () => {
    expect(uxpMode({})).toBe('off');
    expect(uxpMode({ PS_MCP_UXP: '1' })).toBe('fallback');
    expect(uxpMode({ PS_MCP_UXP: '1', PS_MCP_UXP_PREFER: '1' })).toBe('prefer');
    expect(uxpMode({ PS_MCP_UXP_PREFER: '1' })).toBe('off');
  });
  it('READ_SCRIPT_TIMEOUT_MS defaults to 8 s (fast fallback for read-only requests)', async () => {
    const { READ_SCRIPT_TIMEOUT_MS } = await import('../src/tools/state-tools.js');
    expect(READ_SCRIPT_TIMEOUT_MS).toBe(8_000);
  });
  it('isTransportFailure: only transport failures, not substantive Photoshop errors', () => {
    expect(isTransportFailure('Error: Photoshop busy: it is not responding to scripts')).toBe(true);
    expect(isTransportFailure('Script execution timeout')).toBe(true);
    expect(isTransportFailure('{"code":"extendscript_timeout"}')).toBe(true);
    expect(isTransportFailure('layer not found')).toBe(false);
    expect(isTransportFailure('no active document')).toBe(false);
  });
});

describe('facade fallback', () => {
  beforeEach(() => {
    bridge.calls = [];
    bridge.available = true;
    bridge.mode = 'fallback';
  });
  it('ExtendScript answered: UXP is not touched', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: '{"name":"a.psd"}' }] }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(textOf(r)).toBe('{"name":"a.psd"}');
    expect(bridge.calls).toEqual([]);
  });
  it('photoshop_busy + plugin alive → the same operation through UXP, marked via', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'Photoshop busy' }], isError: true }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r))).toMatchObject({ via: 'uxp', name: 'a.psd' });
    expect(bridge.calls).toEqual(['state']);
  });
  it('no plugin → the main path error as is', async () => {
    bridge.available = false;
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'Photoshop busy' }], isError: true }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(r.isError).toBe(true);
    expect(bridge.calls).toEqual([]);
  });
  it('a substantive error (not transport) → no fallback', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'no active document' }], isError: true }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(r.isError).toBe(true);
    expect(bridge.calls).toEqual([]);
  });
  it('prefer → UXP first; export passes the path', async () => {
    bridge.mode = 'prefer';
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'x' }] }), new Map());
    await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    await tools.find((t) => t.tool.name === 'ps_export_frame')!.handler({ path: '/tmp/uxp-bridge-test/frame.png' });
    expect(bridge.calls).toEqual(['state', 'export:/tmp/uxp-bridge-test/frame.png']);
  });
  it('ps_uxp: visible when the bridge is on; batchplay/script/ping', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'x' }] }), new Map());
    const t = tools.find((x) => x.tool.name === 'ps_uxp')!;
    expect(t).toBeTruthy();
    expect(textOf(await t.handler({ action: 'ping' }))).toContain('27.9');
    expect(textOf(await t.handler({ action: 'script', code: 'return 42' }))).toBe('42');
    await t.handler({ action: 'batchplay', descriptors: [{ _obj: 'select' }] });
    expect(bridge.calls).toEqual(['ping', 'script', 'batchplay']);
    bridge.mode = 'off';
    expect(buildFacadeTools(registryWith({ content: [] }), new Map()).some((x) => x.tool.name === 'ps_uxp')).toBe(false);
  });
});

// Bridge token: a 0600 file, a header, 401 without it
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
describe('uxp bridge token', () => {
  it('uxpTokenOk: the header matches the expected token; empty / array / foreign → false', async () => {
    const { uxpTokenOk } = await vi.importActual<typeof import('../src/platform/uxp-bridge-server.js')>('../src/platform/uxp-bridge-server.js');
    expect(uxpTokenOk('abc', 'abc')).toBe(true);
    expect(uxpTokenOk([' abc ', 'x'], 'abc')).toBe(true);
    expect(uxpTokenOk(undefined, 'abc')).toBe(false);
    expect(uxpTokenOk('', 'abc')).toBe(false);
    expect(uxpTokenOk('abd', 'abc')).toBe(false);
  });
  it('uxpBridgeToken creates a 0600 file at PS_MCP_UXP_TOKEN_FILE and reuses it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uxp-bridge-token-'));
    process.env.PS_MCP_UXP_TOKEN_FILE = join(dir, 'sub', 'uxp-bridge.token');
    const mod = await vi.importActual<typeof import('../src/platform/uxp-bridge-server.js')>('../src/platform/uxp-bridge-server.js');
    const t = mod.uxpBridgeToken();
    expect(t).toMatch(/^[a-f0-9]{48}$/);
    expect(readFileSync(process.env.PS_MCP_UXP_TOKEN_FILE, 'utf8').trim()).toBe(t);
    expect(statSync(process.env.PS_MCP_UXP_TOKEN_FILE).mode & 0o777).toBe(0o600);
    expect(mod.uxpBridgeToken()).toBe(t);
    expect(mod.uxpTokenFileExists()).toBe(true);
    delete process.env.PS_MCP_UXP_TOKEN_FILE;
  });
});

// The plugin cannot read environment variables: it finds the token at the server's default
// path and sends it in the header the server checks. Both sides must agree.
describe('bridge identity (server and plugin agree)', () => {
  const plugin = readFileSync(new URL('../uxp-plugin/main.js', import.meta.url), 'utf8');
  const manifest = JSON.parse(readFileSync(new URL('../uxp-plugin/manifest.json', import.meta.url), 'utf8'));
  const pack = readFileSync(new URL('../scripts/pack-uxp.mjs', import.meta.url), 'utf8');

  it('default token file is ~/.ps-mcp-imt/uxp-bridge.token, and the plugin reads that path', async () => {
    const mod = await vi.importActual<typeof import('../src/platform/uxp-bridge-server.js')>('../src/platform/uxp-bridge-server.js');
    const { homedir } = await import('node:os');
    expect(mod.defaultUxpTokenPath()).toBe(join(homedir(), '.ps-mcp-imt', 'uxp-bridge.token'));
    delete process.env.PS_MCP_UXP_TOKEN_FILE;
    expect(mod.uxpTokenPath()).toBe(mod.defaultUxpTokenPath());
    expect(plugin).toContain('/.ps-mcp-imt/uxp-bridge.token');
  });

  it('header X-PS-MCP-Bridge-Token on both sides', async () => {
    const mod = await vi.importActual<typeof import('../src/platform/uxp-bridge-server.js')>('../src/platform/uxp-bridge-server.js');
    expect(mod.UXP_TOKEN_HEADER).toBe('x-ps-mcp-bridge-token');
    expect(plugin).toContain("'X-PS-MCP-Bridge-Token': bridgeToken");
  });

  it('plugin id, name and package', () => {
    expect(manifest.id).toBe('llc.imt.ps-mcp-bridge');
    expect(manifest.name).toBe('PS-MCP-IMT Bridge');
    expect(manifest.entrypoints[0].label.default).toBe('PS-MCP-IMT Bridge');
    expect(manifest.version).toBe('1.2.0');
    expect(pack).toContain("'ps-mcp-imt-bridge.ccx'");
  });
});
