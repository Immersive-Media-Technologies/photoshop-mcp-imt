/**
 * Deep Artisan 29.09.2026 — UXP-мост как ЗАПАСНОЙ транспорт (решение пользователя).
 *
 * Основной путь ps-mcp — ExtendScript через osascript. Он ломается в двух случаях:
 * Photoshop модальный (диалог/прогресс — Apple-events не исполняются, код
 * photoshop_busy / extendscript_timeout) и если Adobe снимет ExtendScript. UXP-плагин
 * (uxp-plugin/) сидит внутри Photoshop, опрашивает наш HTTP-сервер (только при
 * PS_MCP_UXP=1) и исполняет команды через UXP API (batchPlay, DOM, saveAs).
 *
 * Режим: PS_MCP_UXP=1 — мост включён, используется как ФОЛБЭК (после отказа
 * ExtendScript, если плагин жив); PS_MCP_UXP_PREFER=1 — UXP первым для операций,
 * у которых есть UXP-реализация (state/layers/save/export). Без переменных —
 * ничего сетевого не открывается, поведение апстрима.
 * 30.09 (решение пользователя): приложение ставит PREFER=1 всегда — при
 * модальном Photoshop ExtendScript молчал 30 с + 5 с AppleScript до фолбэка, а
 * UXP отвечает за секунду по localhost; без плагина PREFER ничего не меняет.
 */
import { invokeUxpBridge } from './uxp-bridge-server.js';
import { isUxpBridgeReachable } from './uxp-bridge-client.js';

export type UxpMode = 'off' | 'fallback' | 'prefer';

export function uxpMode(env: NodeJS.ProcessEnv = process.env): UxpMode {
  if (env.PS_MCP_UXP !== '1') return 'off';
  return env.PS_MCP_UXP_PREFER === '1' ? 'prefer' : 'fallback';
}

/** Ошибка основного пути, после которой имеет смысл пробовать UXP. Чистая. */
export function isTransportFailure(text: string): boolean {
  return /Photoshop busy|photoshop_busy|Script execution timeout|extendscript_timeout|script_timeout|waiting in the execution queue|osascript|-2741|AppleEvent|Apple event/i.test(
    text,
  );
}

export async function uxpAvailable(): Promise<boolean> {
  if (uxpMode() === 'off') return false;
  return isUxpBridgeReachable();
}

export interface UxpCall {
  ok: boolean;
  data?: unknown;
  error?: string;
}

async function call(action: string, params: Record<string, unknown>, timeoutMs: number): Promise<UxpCall> {
  const r = await invokeUxpBridge(action, params, timeoutMs);
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error ?? `${action}_failed` };
}

export const uxp = {
  ping: () => call('ping', {}, 5_000),
  state: () => call('state', {}, 15_000),
  layers: () => call('layers', {}, 20_000),
  batchPlay: (descriptors: unknown[], options?: Record<string, unknown>) =>
    call('batchplay', { descriptors, ...(options ? { options } : {}) }, 120_000),
  evalJs: (code: string, args?: Record<string, unknown>) => call('eval_js', { code, ...(args ? { args } : {}) }, 120_000),
  exportPng: (path: string) => call('export_png', { path }, 60_000),
  save: (path?: string) => call('save', path ? { path } : {}, 60_000),
};
