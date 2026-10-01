/**
 * MCP-hosted UXP bridge server — companion Photoshop plugin polls for commands.
 * See docs/plans/2026-07-03-1149-photoshop-ai-features/ and uxp-plugin/.
 */
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Logger } from '../utils/logger.js';

const logger = new Logger('UxpBridgeServer');

export interface UxpBridgeCommand {
  id: string;
  action: string;
  params: Record<string, unknown>;
}

export interface UxpBridgeResult {
  id: string;
  ok: boolean;
  data?: unknown;
  error?: string;
}

const DEFAULT_PORT = Number.parseInt(process.env.PHOTOSHOP_UXP_BRIDGE_PORT ?? '38452', 10);

let server: Server | null = null;
let listenPort = DEFAULT_PORT;
// Relay mode (01.10): several MCP clients on one machine (Claude Desktop, Cursor, Deep Artisan)
// each start their own server, but the plugin polls ONE fixed port. The instance that owns the
// port serves the plugin; every other instance detects it on /health and forwards its commands
// to the owner over POST /invoke (same shared-secret token). Before this, the second instance
// listened on port+1, which the plugin never polls → «UXP bridge is not connected».
let relayPort: number | null = null;
let relayPluginSeen = false;
let relayCheckedAt = 0;
export function uxpBridgeMode(): 'owner' | 'relay' | 'off' {
  return server ? 'owner' : relayPort ? 'relay' : 'off';
}
const pendingCommands: UxpBridgeCommand[] = [];
const results = new Map<string, UxpBridgeResult>();
// Deep Artisan 29.09: когда плагин опрашивал сервер в последний раз — «мост есть»
// значит «плагин жив», а не «наш порт открыт»
let lastPollAt = 0;

// Deep Artisan 29.09 (решение пользователя «мост включён всегда»): порт 127.0.0.1:38452
// защищён общим секретом — токен лежит в ~/.deepartisan/state/uxp-bridge.token (0600),
// плагин читает файл и шлёт заголовок X-DA-Bridge-Token; запрос без токена → 401.
// Файл создаётся один раз и переживает перезапуски (плагин перечитывает его при 401).
export const UXP_TOKEN_HEADER = 'x-da-bridge-token';
export function uxpTokenPath(): string {
  return process.env.PS_MCP_UXP_TOKEN_FILE || join(homedir(), '.deepartisan', 'state', 'uxp-bridge.token');
}
let token: string | null = null;
export function uxpBridgeToken(): string {
  if (token) return token;
  const p = uxpTokenPath();
  try {
    const t = readFileSync(p, 'utf8').trim();
    if (/^[a-f0-9]{32,}$/i.test(t)) return (token = t);
  } catch {
    /* файла нет — создадим */
  }
  const fresh = randomBytes(24).toString('hex');
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, fresh + '\n', { mode: 0o600 });
    chmodSync(p, 0o600);
  } catch (e) {
    logger.warn(`cannot write bridge token ${p}: ${(e as Error).message}`);
  }
  return (token = fresh);
}
/** Чистая: заголовок запроса совпадает с токеном (сравнение без раннего выхода не нужно — токен случайный). */
export function uxpTokenOk(header: string | string[] | undefined, expected: string): boolean {
  const h = Array.isArray(header) ? header[0] : header;
  return typeof h === 'string' && h.length > 0 && h.trim() === expected;
}
export function uxpTokenFileExists(): boolean {
  return existsSync(uxpTokenPath());
}

/** Плагин опрашивал сервер не позже, чем `withinMs` назад. */
export function uxpPluginSeen(withinMs = 3000): boolean {
  if (relayPort) return relayPluginSeen && Date.now() - relayCheckedAt < withinMs + 2000;
  return lastPollAt > 0 && Date.now() - lastPollAt < withinMs;
}

/** Relay mode: ask the owner instance whether the plugin is polling it. */
export async function refreshRelayHealth(): Promise<boolean> {
  if (!relayPort) return false;
  const h = await probeOwner(relayPort);
  relayPluginSeen = !!h?.pluginSeen;
  relayCheckedAt = Date.now();
  if (!h) relayPort = null; // owner gone — next ensure() tries to take the port itself
  return relayPluginSeen;
}

interface OwnerHealth {
  ok: boolean;
  pluginSeen?: boolean;
  bridge?: string;
}
/** GET /health of another instance of this server on `port`; null when nobody (or something else) answers. */
async function probeOwner(port: number): Promise<OwnerHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 800);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as OwnerHealth;
    return body && body.ok === true && body.bridge === 'ps-mcp-uxp' ? body : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function json(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function getUxpBridgePort(): number {
  return listenPort;
}

let starting: Promise<number> | null = null;
export async function ensureUxpBridgeServer(): Promise<number> {
  if (server) return listenPort;
  if (relayPort) return relayPort;
  if (starting) return starting;
  starting = startBridge().finally(() => {
    starting = null;
  });
  return starting;
}

function startBridge(): Promise<number> {
  return new Promise((resolve, reject) => {
    const expected = uxpBridgeToken();
    const s = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${listenPort}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, { ok: true, bridge: 'ps-mcp-uxp', pending: pendingCommands.length, pluginSeen: uxpPluginSeen(), lastPollAt });
        return;
      }
      if (!uxpTokenOk(req.headers[UXP_TOKEN_HEADER], expected)) {
        json(res, 401, { ok: false, error: 'bridge_token_required' });
        return;
      }

      if (req.method === 'GET' && url.pathname === '/poll') {
        lastPollAt = Date.now();
        const cmd = pendingCommands.shift();
        if (!cmd) {
          res.writeHead(204);
          res.end();
          return;
        }
        json(res, 200, cmd);
        return;
      }

      if (req.method === 'POST' && url.pathname === '/result') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body) as UxpBridgeResult;
            if (parsed?.id) {
              results.set(parsed.id, parsed);
            }
            json(res, 200, { ok: true });
          } catch {
            json(res, 400, { ok: false, error: 'invalid_json' });
          }
        });
        return;
      }

      if (req.method === 'POST' && url.pathname === '/invoke') {
        // another instance of this server relays a command to us (the port owner)
        let body = '';
        req.on('data', (chunk) => {
          body += chunk;
        });
        req.on('end', () => {
          void (async () => {
            try {
              const parsed = JSON.parse(body) as { action?: string; params?: Record<string, unknown>; timeoutMs?: number };
              if (!parsed?.action) {
                json(res, 400, { ok: false, error: 'action_required' });
                return;
              }
              const r = await invokeUxpBridge(parsed.action, parsed.params ?? {}, parsed.timeoutMs ?? 60_000);
              json(res, 200, r);
            } catch {
              json(res, 400, { ok: false, error: 'invalid_json' });
            }
          })();
        });
        return;
      }

      json(res, 404, { ok: false, error: 'not_found' });
    });

    s.listen(listenPort, '127.0.0.1', () => {
      server = s;
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        listenPort = addr.port;
      }
      logger.info(`UXP bridge listening on 127.0.0.1:${listenPort}`);
      resolve(listenPort);
    });

    s.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        void (async () => {
          const owner = await probeOwner(listenPort);
          if (owner) {
            relayPort = listenPort;
            relayPluginSeen = !!owner.pluginSeen;
            relayCheckedAt = Date.now();
            logger.info(`UXP bridge: another instance owns 127.0.0.1:${listenPort} — relaying commands to it`);
            resolve(listenPort);
            return;
          }
          // the port is held by something else — fall back to the next one (plugin won't see us)
          listenPort += 1;
          s.listen(listenPort, '127.0.0.1');
        })();
        return;
      }
      reject(err);
    });
  });
}

export async function invokeUxpBridge(
  action: string,
  params: Record<string, unknown>,
  timeoutMs = 60_000
): Promise<UxpBridgeResult> {
  await ensureUxpBridgeServer();
  const id = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (relayPort && !server) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs + 2000);
    try {
      const res = await fetch(`http://127.0.0.1:${relayPort}/invoke`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [UXP_TOKEN_HEADER]: uxpBridgeToken() },
        body: JSON.stringify({ action, params, timeoutMs }),
        signal: controller.signal,
      });
      if (res.status === 401) return { id, ok: false, error: 'uxp_bridge_token_mismatch' };
      if (!res.ok) return { id, ok: false, error: `uxp_bridge_relay_http_${res.status}` };
      return (await res.json()) as UxpBridgeResult;
    } catch (e) {
      relayPort = null; // owner vanished mid-call — next call re-probes / takes the port
      return { id, ok: false, error: `uxp_bridge_relay_failed: ${(e as Error).message}` };
    } finally {
      clearTimeout(timer);
    }
  }
  pendingCommands.push({ id, action, params });

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const hit = results.get(id);
    if (hit) {
      results.delete(id);
      return hit;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  return { id, ok: false, error: 'uxp_bridge_timeout' };
}

export async function shutdownUxpBridgeServer(): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
}
