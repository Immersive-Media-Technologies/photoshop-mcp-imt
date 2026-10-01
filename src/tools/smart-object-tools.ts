import { stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
import { PhotoshopConnection } from '../platform/connection.js';
import {
  atomicFailureFromError,
  atomicSuccess,
  parseSnippetResult,
  runSnippet,
} from './atomic-shared.js';

export function createSmartObjectTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_convert_to_smart_object',
        description:
          'Convert the active layer (or a named layer) to an embedded Smart Object.\n\n' +
          'Users often say: convert to smart object, make smart layer, embed layer.\n\n' +
          'Use when: non-destructive transforms/filters are needed on a raster or shape layer.\n' +
          'Do NOT use when: the layer is already a Smart Object — returns success with already_smart_object.\n' +
          'Do NOT use on background layers — unlock or duplicate first.\n\n' +
          'Returns: JSON { ok, summary, details: { layer_name, kind, already_smart_object? } }.\n' +
          'Preconditions: active document; target layer must be selected or named. Side effects: one history step.',
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
      handler: async (args) => convertToSmartObject(connection, args),
    },
    {
      tool: {
        name: 'photoshop_replace_smart_object_contents',
        description:
          'Replace the embedded contents of a Smart Object layer from an image file. Preserves transforms, warps, and Smart Filters on the layer.\n\n' +
          'Users often say: replace smart object, swap mockup screen, relink embedded file.\n\n' +
          'Use when: updating a mockup or template Smart Object with a new asset file.\n' +
          'Do NOT use when: the target is not a Smart Object — convert first or use photoshop_place_image.\n' +
          'Do NOT use for linked Smart Objects that need Relink to File — this replaces embedded contents.\n\n' +
          'Returns: JSON { ok, summary, details: { layer_name, file_path } }.\n' +
          'Preconditions: Smart Object layer active or named; file_path must exist (absolute). Side effects: replaces embedded pixels.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: {
              type: 'string',
              description: 'Absolute path to the replacement image file (JPEG, PNG, PSD, etc.)',
            },
            layer_name: {
              type: 'string',
              description: 'Optional exact Smart Object layer name. Default: active layer.',
            },
          },
          required: ['file_path'],
        },
      },
      handler: async (args) => replaceSmartObjectContents(connection, args),
    },
    {
      tool: {
        name: 'photoshop_edit_smart_object_contents',
        description:
          'Open a Smart Object for editing (double-click / Edit Contents). The embedded .psb becomes the active document until you save and close it.\n\n' +
          'Users often say: edit smart object, open embedded file, double-click smart layer.\n\n' +
          'Use when: modifying pixels inside an embedded Smart Object non-destructively.\n' +
          'Do NOT use when: replacing the whole asset — use photoshop_replace_smart_object_contents.\n\n' +
          'Returns: JSON { ok, summary, details: { parent_document, embedded_document, layer_name } }.\n' +
          'Preconditions: Smart Object layer active or named.\n' +
          'Side effects: active document switches to the embedded .psb — save/close it to return to the parent document.',
        inputSchema: {
          type: 'object',
          properties: {
            layer_name: {
              type: 'string',
              description: 'Optional exact Smart Object layer name. Default: active layer.',
            },
          },
        },
      },
      handler: async (args) => editSmartObjectContents(connection, args),
    },
    {
      tool: {
        name: 'photoshop_create_smart_object_via_copy',
        description:
          'Create an independent Smart Object via Copy — unlinked duplicate with its own embedded contents.\n\n' +
          'Users often say: new smart object via copy, independent smart copy, duplicate smart object separately.\n\n' +
          'Use when: you need a second Smart Object that does not share embedded data with the original.\n' +
          'Do NOT use when: you want linked instances — use photoshop_duplicate_layer (Layer via Copy).\n\n' +
          'Returns: JSON { ok, summary, details: { source_layer_name, new_layer_name, kind } }.\n' +
          'Preconditions: Smart Object layer active or named. Side effects: adds a new Smart Object layer.',
        inputSchema: {
          type: 'object',
          properties: {
            layer_name: {
              type: 'string',
              description: 'Optional source Smart Object layer name. Default: active layer.',
            },
          },
        },
      },
      handler: async (args) => createSmartObjectViaCopy(connection, args),
    },
  ];
}

async function runSmartObjectSnippet(
  connection: PhotoshopConnection,
  script: string,
  successSummary: string,
  detailsKeys?: string[]
): Promise<ToolResult> {
  try {
    const raw = await runSnippet(connection, script);
    const parsed = parseSnippetResult(raw);
    if (!parsed) {
      return atomicFailureFromError(new Error(`Unparseable Smart Object result: ${String(raw)}`));
    }
    if (parsed.ok === false) {
      return atomicFailureFromError(new Error(String(parsed.message || 'Smart Object operation failed')));
    }
    const details: Record<string, unknown> = {};
    if (detailsKeys) {
      for (const key of detailsKeys) {
        if (parsed[key] !== undefined) details[key] = parsed[key];
      }
    }
    if (parsed.context !== undefined) details.context = parsed.context;
    return atomicSuccess(successSummary, details);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function convertToSmartObject(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;
  return runSmartObjectSnippet(
    connection,
    ExtendScriptSnippets.convertToSmartObject(layerName),
    layerName ? `Layer "${layerName}" converted to Smart Object` : 'Active layer converted to Smart Object',
    ['layer_name', 'kind', 'already_smart_object']
  );
}

async function replaceSmartObjectContents(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const filePath = typeof args.file_path === 'string' ? args.file_path.trim() : '';
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;

  if (!filePath) {
    return atomicFailureFromError(new Error('file_path is required.'));
  }
  if (!isAbsolute(filePath)) {
    return atomicFailureFromError(new Error('file_path must be an absolute path.'));
  }

  try {
    await stat(filePath);
  } catch (error) {
    return atomicFailureFromError(
      new Error(
        `Replacement file not found: ${filePath} (${error instanceof Error ? error.message : String(error)})`
      )
    );
  }

  return runSmartObjectSnippet(
    connection,
    ExtendScriptSnippets.replaceSmartObjectContents(filePath, layerName),
    `Smart Object contents replaced from ${filePath}`,
    ['layer_name', 'file_path']
  );
}

async function editSmartObjectContents(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;
  return runSmartObjectSnippet(
    connection,
    ExtendScriptSnippets.editSmartObjectContents(layerName),
    'Smart Object opened for editing — active document is now the embedded contents',
    ['parent_document', 'embedded_document', 'layer_name']
  );
}

async function createSmartObjectViaCopy(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const layerName = typeof args.layer_name === 'string' ? args.layer_name.trim() : undefined;
  return runSmartObjectSnippet(
    connection,
    ExtendScriptSnippets.createSmartObjectViaCopy(layerName),
    'New Smart Object created via copy',
    ['source_layer_name', 'new_layer_name', 'kind']
  );
}
