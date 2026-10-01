import { ToolDefinition, ToolResult } from '../../core/tool-registry.js';
import { ExtendScriptSnippets } from '../../api/extendscript.js';
import { getPhotoshopCapabilities } from '../../platform/capabilities.js';
import { PhotoshopConnection } from '../../platform/connection.js';
import {
  parseGenerativeResult,
  runGenerativeSnippet,
} from '../generative/_shared.js';
import {
  clampInt,
  executeRecipe,
  gradientMaskAxisPercents,
  jsString,
  toolFailure,
} from './_shared.js';

const TOOL_NAME = 'photoshop_recipe_sky_blend';

export function bindSkyBlend(connection: PhotoshopConnection): ToolDefinition {
  return {
    tool: {
      name: TOOL_NAME,
      description:
        'One-shot sky composite: places an external sky image, adds a layer mask, and applies a horizon gradient fade. Wrapped in a single undoable history step.\n' +
        '\n' +
        'Users often say: replace sky, fix blown sky, better clouds, swap sky background.\n' +
        '\n' +
        'Use when: the user provides a sky image path and native sky replacement is unavailable or manual blend is preferred.\n' +
        'Do NOT use when: no sky_image_path is available — ask the user for an absolute file path first.\n' +
        'Do NOT use when: fading the active subject layer only — use photoshop_recipe_gradient_fade.\n' +
        '\n' +
        'Returns: { ok, summary, undo_history_states_consumed, details: { sky_image_path, layer_name, horizon_pct, feather_pct, direction } }.\n' +
        '\n' +
        'Preconditions: active document; sky image file must exist on disk.\n' +
        'Side effects: adds a placed sky layer with gradient mask; one undo reverts everything.',
      inputSchema: {
        type: 'object',
        properties: {
          sky_image_path: {
            type: 'string',
            description: 'Absolute path to the sky image file (JPEG, PNG, etc.)',
          },
          horizon_pct: {
            type: 'number',
            description: 'Document-height percentage where sky meets landscape (0-100, default 50)',
            minimum: 0,
            maximum: 100,
            default: 50,
          },
          feather_pct: {
            type: 'number',
            description: 'Half-width of the transition zone around the horizon (0-50, default 15)',
            minimum: 0,
            maximum: 50,
            default: 15,
          },
          x: {
            type: 'number',
            description: 'Placement X offset in pixels (default 0)',
            default: 0,
          },
          y: {
            type: 'number',
            description: 'Placement Y offset in pixels (default 0)',
            default: 0,
          },
          use_native_sky: {
            type: 'boolean',
            description:
              'Try native Sky Replacement first when supported (default true when capable)',
          },
        },
        required: ['sky_image_path'],
      },
    },
    handler: async (args) => runSkyBlend(connection, args),
  };
}

async function runSkyBlend(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const skyPath = typeof args.sky_image_path === 'string' ? args.sky_image_path.trim() : '';
  if (!skyPath) {
    return toolFailure({
      ok: false,
      code: 'invalid_argument',
      message: 'sky_image_path is required',
    });
  }

  const version = await connection.getVersion();
  const caps = getPhotoshopCapabilities(version);
  const tryNative = args.use_native_sky !== false && caps.features.sky_replacement_native;

  if (tryNative) {
    try {
      const raw = await runGenerativeSnippet(
        connection,
        ExtendScriptSnippets.skyReplacement(skyPath)
      );
      const nativeResult = parseGenerativeResult(raw);
      if (!nativeResult.isError) {
        const text =
          nativeResult.content[0]?.type === 'text' ? nativeResult.content[0].text : '{}';
        try {
          const body = JSON.parse(text) as Record<string, unknown>;
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    ...body,
                    undo_history_states_consumed: 1,
                    details: {
                      ...(typeof body.details === 'object' && body.details ? body.details : {}),
                      method: 'native_sky_replacement',
                      sky_image_path: skyPath,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch {
          return nativeResult;
        }
      }
      if (args.use_native_sky === true) {
        return nativeResult;
      }
    } catch (error) {
      if (args.use_native_sky === true) {
        return toolFailure({
          ok: false,
          code: 'generative_unavailable',
          message: error instanceof Error ? error.message : String(error),
          suggested_next_tool: 'photoshop_get_capabilities',
        });
      }
    }
  }

  const horizonPct = clampInt(args.horizon_pct, 0, 100, 50);
  const featherPct = clampInt(args.feather_pct, 0, 50, 15);
  const x = typeof args.x === 'number' && Number.isFinite(args.x) ? Math.round(args.x) : 0;
  const y = typeof args.y === 'number' && Number.isFinite(args.y) ? Math.round(args.y) : 0;
  const startPct = Math.max(0, horizonPct - featherPct);
  const endPct = Math.min(100, horizonPct + featherPct);
  const endpoints = gradientMaskAxisPercents('top_to_bottom', startPct, endPct);
  const escapedPath = jsString(skyPath);

  const body = `
    var imageFile = new File("${escapedPath}");
    if (!imageFile.exists) {
      return { ok: false, code: 'file_not_found', message: 'Image file not found: ${escapedPath}' };
    }

    app.displayDialogs = DialogModes.NO;

    var placeDesc = new ActionDescriptor();
    placeDesc.putPath(cTID('null'), imageFile);
    placeDesc.putEnumerated(cTID('FTcs'), cTID('QCSt'), cTID('Qcsa'));
    var offsetDesc = new ActionDescriptor();
    offsetDesc.putUnitDouble(cTID('Hrzn'), cTID('#Pxl'), ${x});
    offsetDesc.putUnitDouble(cTID('Vrtc'), cTID('#Pxl'), ${y});
    placeDesc.putObject(cTID('Ofst'), cTID('Ofst'), offsetDesc);
    executeAction(cTID('Plc '), placeDesc, DialogModes.NO);

    var doc = app.activeDocument;
    var skyLayer = doc.activeLayer;
    skyLayer.name = 'Sky Blend';

    var maskCreated = false;
    if (!__mcp_hasLayerMaskAM()) {
      __mcp_makeLayerMaskAtChannel('revealAll');
      maskCreated = true;
    }

    doc.activeLayer = skyLayer;
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
      doc.activeLayer = skyLayer;
    }

    return {
      ok: true,
      summary: 'Sky image placed and blended at horizon (${horizonPct}%)',
      undo_history_states_consumed: 1,
      next_suggested_tool: 'photoshop_get_preview',
      details: {
        sky_image_path: '${escapedPath}',
        layer_name: skyLayer.name,
        horizon_pct: ${horizonPct},
        feather_pct: ${featherPct},
        direction: 'top_to_bottom',
        mask_created: maskCreated
      }
    };
  `;

  return executeRecipe(connection, 'Sky Blend', body);
}
