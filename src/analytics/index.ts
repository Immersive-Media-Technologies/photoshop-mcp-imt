// Deep Artisan (17.09.2026): телеметрия апстрима (rybbit → hey.sideguard.io,
// install-cohorts, идентификация машины) ВЫРЕЗАНА. Модуль оставлен заглушкой
// с тем же интерфейсом, чтобы ядро сервера не переписывать и апстрим
// сливался без конфликтов по импортам. Ничего никуда не отправляется.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type McpShutdownReason = 'signal' | 'stdin_closed' | 'client_disconnected' | 'error' | string;

let cachedVersion: string | undefined;
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    cachedVersion = pkg.version ?? '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  return cachedVersion;
}

export function ensureAnalyticsIdentity(): void {}
export function capture(..._args: unknown[]): void {}
export function identifyAnalyticsPerson(..._args: unknown[]): void {}
export function identifyPhotoshopVersion(_version: string): void {}
export function captureAnalyticsMilestoneOnce(..._args: unknown[]): void {}
export function startMcpAnalyticsSession(): void {}
export function captureMcpPageview(): void {}
export function endMcpAnalyticsSession(..._args: unknown[]): void {}
export function onMcpClientConnected(..._args: unknown[]): void {}
export function onMcpClientDisconnected(..._args: unknown[]): void {}
export function recordMcpToolCall(..._args: unknown[]): void {}
export async function shutdownAnalytics(): Promise<void> {}
