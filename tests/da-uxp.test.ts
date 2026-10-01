// Deep Artisan 29.09: UXP-мост как запасной транспорт — режим, распознавание отказа
// основного пути и фолбэк фасада (мост подменён).
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
import { buildFacadeTools } from '../src/da/facade.js';
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
  it('uxpMode по переменным окружения', () => {
    expect(uxpMode({})).toBe('off');
    expect(uxpMode({ PS_MCP_UXP: '1' })).toBe('fallback');
    expect(uxpMode({ PS_MCP_UXP: '1', PS_MCP_UXP_PREFER: '1' })).toBe('prefer');
    expect(uxpMode({ PS_MCP_UXP_PREFER: '1' })).toBe('off');
  });
  it('READ_SCRIPT_TIMEOUT_MS — 8 с по умолчанию (30.09: быстрый фолбэк read-only запросов)', async () => {
    const { READ_SCRIPT_TIMEOUT_MS } = await import('../src/tools/state-tools.js');
    expect(READ_SCRIPT_TIMEOUT_MS).toBe(8_000);
  });
  it('isTransportFailure — только отказы транспорта, не ошибки Photoshop по существу', () => {
    expect(isTransportFailure('Error: Photoshop busy: it is not responding to scripts')).toBe(true);
    expect(isTransportFailure('Script execution timeout')).toBe(true);
    expect(isTransportFailure('{"code":"script_timeout"}')).toBe(true);
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
  it('ExtendScript ответил — UXP не трогаем', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: '{"name":"a.psd"}' }] }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(textOf(r)).toBe('{"name":"a.psd"}');
    expect(bridge.calls).toEqual([]);
  });
  it('photoshop_busy + плагин жив → та же операция через UXP с пометкой via', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'Photoshop busy' }], isError: true }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(r.isError).toBeFalsy();
    expect(JSON.parse(textOf(r))).toMatchObject({ via: 'uxp', name: 'a.psd' });
    expect(bridge.calls).toEqual(['state']);
  });
  it('плагина нет → ошибка основного пути как есть', async () => {
    bridge.available = false;
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'Photoshop busy' }], isError: true }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(r.isError).toBe(true);
    expect(bridge.calls).toEqual([]);
  });
  it('ошибка по существу (не транспорт) — фолбэка нет', async () => {
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'no active document' }], isError: true }), new Map());
    const r = await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    expect(r.isError).toBe(true);
    expect(bridge.calls).toEqual([]);
  });
  it('prefer → UXP первым; export передаёт путь', async () => {
    bridge.mode = 'prefer';
    const tools = buildFacadeTools(registryWith({ content: [{ type: 'text', text: 'x' }] }), new Map());
    await tools.find((t) => t.tool.name === 'ps_get_state')!.handler({});
    await tools.find((t) => t.tool.name === 'ps_export_frame')!.handler({ path: '/tmp/da-uxp-test/frame.png' });
    expect(bridge.calls).toEqual(['state', 'export:/tmp/da-uxp-test/frame.png']);
  });
  it('ps_uxp: виден при включённом мосте, batchplay/script/ping', async () => {
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

// 29.09 (мост включён всегда): токен моста — файл 0600, заголовок, 401 без него
import { mkdtempSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
describe('uxp bridge token', () => {
  it('uxpTokenOk — совпадение заголовка с ожидаемым, пусто/массив/чужой → false', async () => {
    const { uxpTokenOk } = await vi.importActual<typeof import('../src/platform/uxp-bridge-server.js')>('../src/platform/uxp-bridge-server.js');
    expect(uxpTokenOk('abc', 'abc')).toBe(true);
    expect(uxpTokenOk([' abc ', 'x'], 'abc')).toBe(true);
    expect(uxpTokenOk(undefined, 'abc')).toBe(false);
    expect(uxpTokenOk('', 'abc')).toBe(false);
    expect(uxpTokenOk('abd', 'abc')).toBe(false);
  });
  it('uxpBridgeToken — создаёт файл 0600 по PS_MCP_UXP_TOKEN_FILE и переиспользует его', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'da-uxp-token-'));
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
