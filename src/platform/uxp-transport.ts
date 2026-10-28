/**
 * UXP bridge as the BACKUP transport (2026-09-29).
 *
 * The main path of ps-mcp is ExtendScript through osascript / COM. It breaks in two
 * cases: Photoshop is modal (a dialog / progress bar: Apple events do not run, code
 * photoshop_busy / extendscript_timeout), and if Adobe ever removes ExtendScript. The
 * UXP plugin (uxp-plugin/) sits inside Photoshop, polls our HTTP server (only with
 * PS_MCP_UXP=1) and runs commands through the UXP API (batchPlay, DOM, saveAs).
 *
 * Mode: PS_MCP_UXP=1 turns the bridge on and uses it as a FALLBACK (after ExtendScript
 * failed, if the plugin is alive); PS_MCP_UXP_PREFER=1 puts UXP first for the operations
 * that have a UXP implementation (state/layers/save/export). Without the variables
 * nothing is opened on the network and the behaviour is upstream's.
 * PREFER=1 is worth setting: with Photoshop modal, ExtendScript waited 30 s + 5 s of
 * AppleScript before the fallback, while UXP answers within a second over localhost;
 * without the plugin PREFER changes nothing.
 */
import { invokeUxpBridge } from './uxp-bridge-server.js';
import { envFlag } from '../utils/env-flag.js';
import { isUxpBridgeReachable } from './uxp-bridge-client.js';

export type UxpMode = 'off' | 'fallback' | 'prefer';

export function uxpMode(env: NodeJS.ProcessEnv = process.env): UxpMode {
  if (!envFlag('PS_MCP_UXP', false, env)) return 'off';
  return envFlag('PS_MCP_UXP_PREFER', false, env) ? 'prefer' : 'fallback';
}

/** A failure of the main path after which trying UXP makes sense. Pure. */
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
