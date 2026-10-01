import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { ExtendScriptSnippets, type GradientMaskDirection } from '../api/extendscript.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { clampInt } from './recipes/_shared.js';
import {
  atomicFailure,
  atomicFailureFromError,
  atomicSuccess,
  parseSnippetResult,
  runSnippet,
} from './atomic-shared.js';
import type { PhotoshopErrorCode } from '../errors/envelope.js';

function mapClippingSnippetFailure(parsed: Record<string, unknown>): ToolResult | null {
  if (parsed.ok !== false) return null;
  const rawCode = typeof parsed.code === 'string' ? parsed.code : 'extendscript_runtime_error';
  const allowed: PhotoshopErrorCode[] = [
    'no_active_document',
    'no_active_layer',
    'layer_not_found',
    'no_base_layer_below',
    'not_clipping',
    'extendscript_runtime_error',
  ];
  const code: PhotoshopErrorCode =
    rawCode === 'no_document'
      ? 'no_active_document'
      : allowed.includes(rawCode as PhotoshopErrorCode)
        ? (rawCode as PhotoshopErrorCode)
        : 'extendscript_runtime_error';
  return atomicFailure({
    ok: false,
    code,
    message: String(parsed.message || 'Clipping mask operation failed'),
    suggested_next_tool:
      typeof parsed.suggested_next_tool === 'string'
        ? parsed.suggested_next_tool
        : code === 'no_base_layer_below' || code === 'not_clipping'
          ? 'photoshop_get_layers'
          : 'photoshop_get_state',
  });
}

async function runClippingMaskSnippet(
  connection: PhotoshopConnection,
  script: string,
  successSummary: string,
  detailsKeys: string[]
): Promise<ToolResult> {
  try {
    const raw = await runSnippet(connection, script);
    const parsed = parseSnippetResult(raw);
    if (!parsed) {
      return atomicFailureFromError(new Error(`Unparseable clipping mask result: ${String(raw)}`));
    }
    const failure = mapClippingSnippetFailure(parsed);
    if (failure) return failure;
    const details: Record<string, unknown> = {};
    for (const key of detailsKeys) {
      if (parsed[key] !== undefined) details[key] = parsed[key];
    }
    if (parsed.context !== undefined) details.context = parsed.context;
    return atomicSuccess(successSummary, details);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

const GRADIENT_DIRECTIONS: GradientMaskDirection[] = [
  'top_to_bottom',
  'bottom_to_top',
  'left_to_right',
  'right_to_left',
];

function parseGradientDirection(value: unknown): GradientMaskDirection {
  if (typeof value === 'string' && GRADIENT_DIRECTIONS.includes(value as GradientMaskDirection)) {
    return value as GradientMaskDirection;
  }
  return 'bottom_to_top';
}

export function createMaskTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_apply_gradient_mask',
        description:
          'Apply a linear black-to-white gradient on the active layer mask channel (fade/blend).\n\n' +
          'Users often say: fade into background, gradient mask, blend subject, soft edge fade.\n\n' +
          'This paints on an existing layer mask — not a Gradient Fill layer.\n' +
          'Use when: softening edges or fading a layer into the background through its mask.\n' +
          'Do NOT use when: subject is not isolated — use photoshop_recipe_remove_background or photoshop_create_layer_mask first.\n\n' +
          'Returns: JSON { ok, summary, details: { applied, direction, angle, mask_auto_created? } }.\n' +
          'Preconditions: active document and active layer. Creates a reveal-all mask if none exists.\n' +
          'Side effects: modifies layer mask pixels; two history steps when mask is auto-created.',
        inputSchema: {
          type: 'object',
          properties: {
            direction: {
              type: 'string',
              enum: GRADIENT_DIRECTIONS,
              description: 'Gradient fade direction on the mask (default bottom_to_top)',
              default: 'bottom_to_top',
            },
            start_pct: {
              type: 'number',
              description: 'Gradient start along fade axis (0-100)',
              minimum: 0,
              maximum: 100,
              default: 0,
            },
            end_pct: {
              type: 'number',
              description: 'Gradient end along fade axis (0-100)',
              minimum: 0,
              maximum: 100,
              default: 100,
            },
            angle_deg: {
              type: 'number',
              description: 'Override gradient angle in degrees (optional)',
            },
          },
        },
      },
      handler: async (args) => applyGradientMask(connection, args),
    },
    {
      tool: {
        name: 'photoshop_create_clipping_mask',
        description:
          'Create a clipping mask on the active layer (or a named layer).\n\n' +
          'Users often say: clip to layer below, clipping mask, clip this layer, mask to shape below.\n\n' +
          'Use when: the active layer should be visible only where the layer directly below it has opaque pixels.\n' +
          'Do NOT use when: the layer is already clipped — returns success with already_clipping.\n' +
          'Do NOT use when: the layer is the bottom-most layer — there is no base layer to clip into.\n\n' +
          'Returns: JSON { ok, summary, details: { layer_name, is_clipping, already_clipping? } }.\n' +
          'Preconditions: active document; target layer must sit directly above the base layer below it in the same group/stack.\n' +
          'Side effects: one history step (groupEvent).',
        inputSchema: {
          type: 'object',
          properties: {
            layer_name: {
              type: 'string',
              description: 'Optional exact layer name (recursive search). Default: active layer.',
            },
          },
        },
      },
      handler: async (args) => createClippingMask(connection, args),
    },
    {
      tool: {
        name: 'photoshop_release_clipping_mask',
        description:
          'Release (remove) the clipping mask from the active layer (or a named layer).\n\n' +
          'Users often say: unclip, release clipping mask, remove clipping mask.\n\n' +
          'Use when: a clipped layer should become independent again.\n' +
          'Do NOT use when: the layer is not clipped — returns not_clipping error.\n\n' +
          'Returns: JSON { ok, summary, details: { layer_name, is_clipping: false } }.\n' +
          'Preconditions: active document; target layer must currently be a clipping mask (grouped).\n' +
          'Side effects: sets layer.grouped = false; one history step.',
        inputSchema: {
          type: 'object',
          properties: {
            layer_name: {
              type: 'string',
              description: 'Optional exact layer name (recursive search). Default: active layer.',
            },
          },
        },
      },
      handler: async (args) => releaseClippingMask(connection, args),
    },
  ];
}

async function createClippingMask(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;
  return runClippingMaskSnippet(
    connection,
    ExtendScriptSnippets.createClippingMask(layerName),
    layerName ? `Clipping mask created on "${layerName}"` : 'Clipping mask created on active layer',
    ['layer_name', 'is_clipping', 'already_clipping']
  );
}

async function releaseClippingMask(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;
  return runClippingMaskSnippet(
    connection,
    ExtendScriptSnippets.releaseClippingMask(layerName),
    layerName ? `Clipping mask released from "${layerName}"` : 'Clipping mask released from active layer',
    ['layer_name', 'is_clipping']
  );
}

async function applyGradientMask(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const direction = parseGradientDirection(args.direction);
  const startPct = clampInt(args.start_pct, 0, 100, 0);
  const endPct = clampInt(args.end_pct, 0, 100, 100);
  const angleDeg = typeof args.angle_deg === 'number' ? args.angle_deg : undefined;

  const gradientScript = ExtendScriptSnippets.applyGradientMask(
    direction,
    startPct,
    endPct,
    angleDeg
  );

  let maskAutoCreated = false;

  try {
    const raw = await runSnippet(connection, gradientScript);
    const parsed = parseSnippetResult(raw);
    if (!parsed) {
      return atomicFailureFromError(new Error(`Snippet returned unparseable payload: ${String(raw)}`));
    }
    return atomicSuccess('Gradient applied on layer mask', {
      ...parsed,
      mask_auto_created: false,
    });
  } catch (firstError) {
    const firstMessage = firstError instanceof Error ? firstError.message : String(firstError);
    if (!/no layer mask/i.test(firstMessage)) {
      return atomicFailureFromError(firstError);
    }
  }

  try {
    const maskRaw = await runSnippet(connection, ExtendScriptSnippets.createLayerMask());
    const maskParsed = parseSnippetResult(maskRaw);
    if (maskParsed?.maskCreated === true) {
      maskAutoCreated = true;
    }

    const raw = await runSnippet(connection, gradientScript);
    const parsed = parseSnippetResult(raw);
    if (!parsed) {
      return atomicFailureFromError(new Error(`Snippet returned unparseable payload: ${String(raw)}`));
    }

    return atomicSuccess('Gradient applied on layer mask', {
      ...parsed,
      mask_auto_created: maskAutoCreated,
    });
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
