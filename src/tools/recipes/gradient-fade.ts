import { ToolDefinition, ToolResult } from '../../core/tool-registry.js';
import { PhotoshopConnection } from '../../platform/connection.js';
import type { GradientMaskDirection } from '../../api/extendscript.js';
import {
  clampInt,
  executeRecipe,
  gradientMaskAxisPercents,
  gradientMaskDefaultAngle,
} from './_shared.js';

const TOOL_NAME = 'photoshop_recipe_gradient_fade';

const GRADIENT_DIRECTIONS: GradientMaskDirection[] = [
  'top_to_bottom',
  'bottom_to_top',
  'left_to_right',
  'right_to_left',
];

export function bindGradientFade(connection: PhotoshopConnection): ToolDefinition {
  return {
    tool: {
      name: TOOL_NAME,
      description:
        'One-shot gradient fade on the active layer mask: creates a reveal-all mask if needed, then paints a linear black-to-white gradient for soft edge blending. Wrapped in a single undoable history step.\n' +
        '\n' +
        'Users often say: fade into background, gradient mask, blend subject, soft edge fade, arka planı yumuşat.\n' +
        '\n' +
        'This applies a linear gradient on the layer mask channel — not a Gradient Fill layer.\n' +
        'Use when: the user wants the active layer to fade into the background or layers below through its mask.\n' +
        'Do NOT use when: the subject is not isolated — use photoshop_recipe_remove_background first.\n' +
        'Do NOT use when: replacing the sky with an external image — use photoshop_recipe_sky_blend.\n' +
        '\n' +
        'Returns: { ok, summary, undo_history_states_consumed, details: { direction, start_pct, end_pct, mask_created, layer_name } }.\n' +
        '\n' +
        'Preconditions: active document with an active layer.\n' +
        'Side effects: creates or modifies the active layer mask; one undo reverts everything.',
      inputSchema: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            description: 'Gradient fade direction on the mask (default bottom_to_top)',
            enum: GRADIENT_DIRECTIONS,
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
            description: 'Optional gradient angle override in degrees',
          },
        },
      },
    },
    handler: async (args) => runGradientFade(connection, args),
  };
}

async function runGradientFade(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const direction = parseGradientDirection(args.direction);
  const startPct = clampInt(args.start_pct, 0, 100, 0);
  const endPct = clampInt(args.end_pct, 0, 100, 100);
  const angle =
    typeof args.angle_deg === 'number' && Number.isFinite(args.angle_deg)
      ? Math.round(args.angle_deg)
      : gradientMaskDefaultAngle(direction);
  const endpoints = gradientMaskAxisPercents(direction, startPct, endPct);

  const body = `
    var doc = app.activeDocument;
    var layer = doc.activeLayer;
    if (!layer) {
      return { ok: false, code: 'no_active_layer', message: 'No active layer', suggested_next_tool: 'photoshop_get_state' };
    }

    var maskCreated = false;
    if (!__mcp_hasLayerMaskAM()) {
      __mcp_makeLayerMaskAtChannel('revealAll');
      maskCreated = true;
    }

    app.displayDialogs = DialogModes.NO;
    doc.activeLayer = layer;
    __mcp_selectLayerMaskChannel();

    var docW = doc.width.as('px');
    var docH = doc.height.as('px');
    var fromXPx = docW * (${endpoints.fromH} / 100.0);
    var fromYPx = docH * (${endpoints.fromV} / 100.0);
    var toXPx = docW * (${endpoints.toH} / 100.0);
    var toYPx = docH * (${endpoints.toV} / 100.0);
    __mcp_gradientFillLayerMask(fromXPx, fromYPx, toXPx, toYPx, ${endpoints.reverse ? 'true' : 'false'});

    try {
      doc.activeChannels = doc.componentChannels;
    } catch (eRestore) {
      doc.activeLayer = layer;
    }

    return {
      ok: true,
      summary: 'Subject faded into background via gradient mask',
      undo_history_states_consumed: 1,
      next_suggested_tool: 'photoshop_get_preview',
      details: {
        direction: '${direction}',
        start_pct: ${startPct},
        end_pct: ${endPct},
        mask_created: maskCreated,
        layer_name: layer.name,
        angle: ${angle}
      }
    };
  `;

  return executeRecipe(connection, 'Gradient Fade', body);
}

function parseGradientDirection(value: unknown): GradientMaskDirection {
  if (typeof value === 'string' && GRADIENT_DIRECTIONS.includes(value as GradientMaskDirection)) {
    return value as GradientMaskDirection;
  }
  return 'bottom_to_top';
}
