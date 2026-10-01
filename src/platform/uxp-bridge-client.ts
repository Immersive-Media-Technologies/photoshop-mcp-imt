/**
 * Client for the MCP-hosted UXP bridge (health check + neural filter invoke).
 */
import { ensureUxpBridgeServer, invokeUxpBridge, uxpPluginSeen } from './uxp-bridge-server.js';

const HEALTH_TIMEOUT_MS = 800;

export async function isUxpBridgeReachable(): Promise<boolean> {
  // Deep Artisan 29.09: сервер не поднимается без PS_MCP_UXP=1 (ничего сетевого);
  // «достижим» = плагин в Photoshop опрашивает нас (uxpPluginSeen), а не «порт открыт»
  if (process.env.PS_MCP_UXP !== '1') return false;
  try {
    const port = await ensureUxpBridgeServer();
    // плагин опрашивает раз в 400 мс — сразу после старта сервера ждём первый опрос (до 1.5 с)
    for (let i = 0; i < 15 && !uxpPluginSeen(); i++) await new Promise((r) => setTimeout(r, 100));
    if (!uxpPluginSeen()) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  }
}

export type NeuralFilterKind =
  'skin_smoothing' | 'harmonize' | 'depth_blur' | 'super_zoom' | 'colorize';

export interface NeuralFilterParams {
  smoothness?: number;
  blur?: number;
  reference_layer_id?: number;
}

export async function invokeNeuralFilter(
  filter: NeuralFilterKind,
  params: NeuralFilterParams = {}
): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const result = await invokeUxpBridge('neural_filter', { filter, ...params }, 90_000);
  if (!result.ok) {
    return { ok: false, error: result.error ?? 'neural_filter_failed' };
  }
  return { ok: true, data: result.data };
}
