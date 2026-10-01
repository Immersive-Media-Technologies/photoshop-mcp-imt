import { ToolDefinition, ToolResult } from '../../core/tool-registry.js';
import { ExtendScriptSnippets } from '../../api/extendscript.js';
import { getPhotoshopCapabilities } from '../../platform/capabilities.js';
import { PhotoshopConnection } from '../../platform/connection.js';
import {
  parseGenerativeResult,
  runGenerativeSnippet,
} from '../generative/_shared.js';
import { clampInt, executeRecipe, toolFailure } from './_shared.js';

const TOOL_NAME = 'photoshop_recipe_remove_distraction';

export function bindRemoveDistraction(connection: PhotoshopConnection): ToolDefinition {
  return {
    tool: {
      name: TOOL_NAME,
      description:
        'One-shot distraction removal: generative AI remove when available, else content-aware fill. Wrapped in a single undoable history step.\n' +
        '\n' +
        'Users often say: remove that person, erase distraction, content aware remove, clone out object.\n' +
        '\n' +
        'Use when: the user has selected the object or region to remove.\n' +
        'Do NOT use when: no selection exists — use photoshop_select_rectangle or photoshop_select_subject first.\n' +
        '\n' +
        'Returns: { ok, summary, undo_history_states_consumed, details }.\n' +
        'Preconditions: active document with an active pixel selection.\n' +
        'Side effects: fills/removes selected pixels; clears selection.',
      inputSchema: {
        type: 'object',
        properties: {
          feather_px: {
            type: 'number',
            description: 'Edge feather in pixels before remove (0-20, default 0)',
            minimum: 0,
            maximum: 20,
            default: 0,
          },
          use_generative: {
            type: 'boolean',
            description:
              'Prefer generative remove when Photoshop supports it (default true when capable)',
          },
        },
      },
    },
    handler: async (args) => runRemoveDistraction(connection, args),
  };
}

async function runRemoveDistraction(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const feather = clampInt(args.feather_px, 0, 20, 0);
  const version = await connection.getVersion();
  const caps = getPhotoshopCapabilities(version);
  const useGenerative =
    args.use_generative !== false && caps.features.generative_remove;

  if (useGenerative) {
    try {
      const raw = await runGenerativeSnippet(
        connection,
        ExtendScriptSnippets.generativeRemove(feather, false)
      );
      const result = parseGenerativeResult(raw);
      if (!result.isError) {
        const text = result.content[0]?.type === 'text' ? result.content[0].text : '{}';
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
                      fill_method: 'generative_remove',
                      feather_px: feather,
                    },
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch {
          return result;
        }
      }
      if (args.use_generative === true) {
        return result;
      }
    } catch (error) {
      if (args.use_generative === true) {
        return toolFailure({
          ok: false,
          code: 'generative_unavailable',
          message: error instanceof Error ? error.message : String(error),
          suggested_next_tool: 'photoshop_get_capabilities',
        });
      }
    }
  }

  const body = `
    var doc = app.activeDocument;
    var hasSel = false;
    try { hasSel = doc.selection.bounds != null; } catch (e) { hasSel = false; }
    if (!hasSel) {
      return {
        ok: false,
        code: 'selection_required',
        message: 'Active pixel selection required before content-aware fill',
        suggested_next_tool: 'photoshop_select_rectangle'
      };
    }

    app.displayDialogs = DialogModes.NO;

    if (${feather} > 0) {
      try { doc.selection.feather(${feather}); } catch (eF) {}
    }

    var fillDesc = new ActionDescriptor();
    fillDesc.putEnumerated(sTID('using'), sTID('fillContents'), sTID('contentAware'));
    executeAction(sTID('fill'), fillDesc, DialogModes.NO);
    doc.selection.deselect();

    return {
      ok: true,
      summary: 'Distraction removed via content-aware fill',
      undo_history_states_consumed: 1,
      next_suggested_tool: 'photoshop_get_preview',
      details: {
        feather_px: ${feather},
        fill_method: 'content_aware'
      }
    };
  `;

  return executeRecipe(connection, 'Remove Distraction', body);
}
