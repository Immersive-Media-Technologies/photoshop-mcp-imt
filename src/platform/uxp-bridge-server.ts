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
  return lastPollAt > 0 && Date.now() - lastPollAt < withinMs;
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

export async function ensureUxpBridgeServer(): Promise<number> {
  if (server) return listenPort;

  return new Promise((resolve, reject) => {
    const expected = uxpBridgeToken();
    const s = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://127.0.0.1:${listenPort}`);

      if (req.method === 'GET' && url.pathname === '/health') {
        json(res, 200, { ok: true, pending: pendingCommands.length, pluginSeen: uxpPluginSeen(), lastPollAt });
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
        listenPort += 1;
        s.listen(listenPort, '127.0.0.1');
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
