import type { ToolResult } from '../../core/tool-registry.js';
import type { PhotoshopErrorCode } from '../../errors/envelope.js';
import { ExtendScriptSnippets } from '../../api/extendscript.js';
import { getPhotoshopCapabilities } from '../../platform/capabilities.js';
import type { PhotoshopConnection } from '../../platform/connection.js';
import { PhotoshopAPIFactory } from '../../api/photoshop-api.js';
import {
  atomicFailure,
  atomicFailureFromError,
  atomicSuccess,
  parseSnippetResult,
} from '../atomic-shared.js';

/** Generative cloud jobs may exceed the default 30s script timeout. */
export const GENERATIVE_SCRIPT_TIMEOUT_MS = 120_000;

export async function runGenerativeSnippet(
  connection: PhotoshopConnection,
  script: string
): Promise<unknown> {
  const apiFactory = new PhotoshopAPIFactory(connection);
  const api = await apiFactory.createAPI();
  return api.executeScript(script, GENERATIVE_SCRIPT_TIMEOUT_MS);
}

export async function requireGenerativeCapability(
  connection: PhotoshopConnection,
  feature: 'generative_fill' | 'generative_upscale'
): Promise<ToolResult | null> {
  const version = await connection.getVersion();
  const caps = getPhotoshopCapabilities(version);
  if (!caps.features[feature]) {
    return atomicFailure({
      ok: false,
      code: 'version_unsupported',
      message: `Photoshop ${version} does not expose ${feature}`,
      suggested_next_tool: 'photoshop_get_capabilities',
    });
  }
  return null;
}

export function parseGenerativeResult(raw: unknown): ToolResult {
  const parsed = parseSnippetResult(raw);
  if (!parsed) {
    return atomicFailureFromError(new Error(`Unparseable generative result: ${String(raw)}`));
  }

  if (parsed.ok === false) {
    const rawCode = typeof parsed.code === 'string' ? parsed.code : 'generative_unavailable';
    const allowed: PhotoshopErrorCode[] = [
      'generative_credits_exhausted',
      'generative_no_selection',
      'generative_timeout',
      'generative_unavailable',
      'version_unsupported',
    ];
    const code: PhotoshopErrorCode = allowed.includes(rawCode as PhotoshopErrorCode)
      ? (rawCode as PhotoshopErrorCode)
      : 'generative_unavailable';
    const message = typeof parsed.message === 'string' ? parsed.message : 'Generative action failed';
    return atomicFailure({
      ok: false,
      code,
      message,
      suggested_next_tool:
        code === 'generative_no_selection'
          ? 'photoshop_select_rectangle'
          : 'photoshop_get_capabilities',
    });
  }

  const summary =
    typeof parsed.summary === 'string' ? parsed.summary : 'Generative action completed';
  const nextTool =
    typeof parsed.next_suggested_tool === 'string'
      ? parsed.next_suggested_tool
      : 'photoshop_get_preview';
  const details =
    parsed.details && typeof parsed.details === 'object' && !Array.isArray(parsed.details)
      ? (parsed.details as Record<string, unknown>)
      : undefined;

  return atomicSuccess(summary, details, nextTool);
}

export function clampGenerativeScale(value: unknown): 2 | 4 {
  const n = typeof value === 'number' ? value : Number(value);
  return n >= 4 ? 4 : 2;
}

export const GENERATIVE_EXPAND_DIRECTIONS = [
  'left',
  'right',
  'top',
  'bottom',
  'all',
] as const;

export type GenerativeExpandDirection = (typeof GENERATIVE_EXPAND_DIRECTIONS)[number];

export function normalizeExpandDirection(value: unknown): GenerativeExpandDirection {
  const raw = typeof value === 'string' ? value.trim().toLowerCase() : 'all';
  return (GENERATIVE_EXPAND_DIRECTIONS as readonly string[]).includes(raw)
    ? (raw as GenerativeExpandDirection)
    : 'all';
}

export { ExtendScriptSnippets };
