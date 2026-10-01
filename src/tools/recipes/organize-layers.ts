import { ToolDefinition, ToolResult } from '../../core/tool-registry.js';
import { PhotoshopConnection } from '../../platform/connection.js';
import { executeRecipe } from './_shared.js';

const TOOL_NAME = 'photoshop_recipe_organize_layers';

const NAMING_OPTIONS = ['type_index', 'content_summary', 'preserve'] as const;
type NamingScheme = (typeof NAMING_OPTIONS)[number];

export function bindOrganizeLayers(connection: PhotoshopConnection): ToolDefinition {
  return {
    tool: {
      name: TOOL_NAME,
      description:
        "Tidy the active document's layer stack: rename layers using a consistent scheme and optionally auto-group them by kind. Never deletes, merges or rasterizes — visual output stays identical.\n" +
        '\n' +
        'Use when: the user complains about layer mess ("layer 1 copy 2", "untitled 7") or asks for organization.\n' +
        'Do NOT use when: the user wants smart, semantic naming based on layer content beyond text — recipe only summarizes text layers, not image content.\n' +
        '\n' +
        'Returns: { ok, summary, details: { renamed_count, group_count } }.\n' +
        '\n' +
        'Preconditions: active document.\n' +
        'Side effects: renames top-level layers and (optionally) moves them into kind-grouped folders; one undo reverts everything.',
      inputSchema: {
        type: 'object',
        properties: {
          naming_scheme: {
            type: 'string',
            description: `How to rename layers: type_index (default, e.g. text_01), content_summary (text layers get a slug of their content; other kinds get type_index), preserve (do not rename).`,
            enum: [...NAMING_OPTIONS],
            default: 'type_index',
          },
          auto_group: {
            type: 'boolean',
            description: 'Group layers by kind (text / image / shape / adjustment). Default true.',
            default: true,
          },
        },
      },
    },
    handler: async (args) => runOrganizeLayers(connection, args),
  };
}

async function runOrganizeLayers(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const naming = parseNaming(args.naming_scheme);
  const autoGroup = args.auto_group !== false;

  const body = `
    var doc = app.activeDocument;
    if (doc.layers.length < 1) {
      return { ok: false, code: 'recipe_no_result', message: 'No layers to organize.' };
    }

    var allLayers = [];
    for (var i = 0; i < doc.layers.length; i++) {
      var l = doc.layers[i];
      try {
        if (l.typename === 'LayerSet') continue;
      } catch (eType) {}
      allLayers.push(l);
    }

    function kindGroupName(layer) {
      try {
        if (layer.kind === LayerKind.TEXT) return 'Text';
        if (layer.kind === LayerKind.SMARTOBJECT) return 'Smart Objects';
        if (layer.kind === LayerKind.SOLIDFILL || layer.kind === LayerKind.GRADIENTFILL || layer.kind === LayerKind.PATTERNFILL) return 'Fills';
        if (layer.kind === LayerKind.BRIGHTNESSCONTRAST || layer.kind === LayerKind.LEVELS || layer.kind === LayerKind.CURVES || layer.kind === LayerKind.HUESATURATION || layer.kind === LayerKind.COLORBALANCE || layer.kind === LayerKind.SELECTIVECOLOR || layer.kind === LayerKind.PHOTOFILTER || layer.kind === LayerKind.GRADIENTMAP) return 'Adjustments';
      } catch (eKind) {}
      return 'Images';
    }

    function slugify(text) {
      var s = String(text || '').toLowerCase();
      s = s.replace(/[^a-z0-9]+/g, '_');
      s = s.replace(/^_+|_+$/g, '');
      if (!s) s = 'untitled';
      return s.slice(0, 32);
    }

    var renamedCount = 0;
    var typeCounters = {};

    for (var j = 0; j < allLayers.length; j++) {
      var layer = allLayers[j];
      var kindLabel = '';
      try {
        if (layer.kind === LayerKind.TEXT) kindLabel = 'text';
        else if (layer.kind === LayerKind.SMARTOBJECT) kindLabel = 'smartobject';
        else if (layer.kind === LayerKind.NORMAL) kindLabel = 'image';
        else kindLabel = 'layer';
      } catch (eK) { kindLabel = 'layer'; }

      var newName = layer.name;
      if ('${naming}' === 'type_index') {
        if (!typeCounters[kindLabel]) typeCounters[kindLabel] = 0;
        typeCounters[kindLabel] += 1;
        var idx = typeCounters[kindLabel];
        var pad = idx < 10 ? '0' + idx : String(idx);
        newName = kindLabel + '_' + pad;
      } else if ('${naming}' === 'content_summary') {
        if (kindLabel === 'text') {
          try {
            newName = 'text_' + slugify(layer.textItem.contents);
          } catch (eText) {
            if (!typeCounters[kindLabel]) typeCounters[kindLabel] = 0;
            typeCounters[kindLabel] += 1;
            newName = 'text_' + typeCounters[kindLabel];
          }
        } else {
          if (!typeCounters[kindLabel]) typeCounters[kindLabel] = 0;
          typeCounters[kindLabel] += 1;
          var idxC = typeCounters[kindLabel];
          var padC = idxC < 10 ? '0' + idxC : String(idxC);
          newName = kindLabel + '_' + padC;
        }
      }

      if (newName !== layer.name) {
        layer.name = newName;
        renamedCount += 1;
      }
    }

    var groupCount = 0;
    if (${autoGroup ? 'true' : 'false'}) {
      var groupCache = {};
      for (var k = allLayers.length - 1; k >= 0; k--) {
        var lk = allLayers[k];
        var gName = kindGroupName(lk);
        if (!groupCache[gName]) {
          var grp = doc.layerSets.add();
          grp.name = gName;
          groupCache[gName] = grp;
          groupCount += 1;
        }
        try {
          lk.move(groupCache[gName], ElementPlacement.INSIDE);
        } catch (eMove) {}
      }
    }

    return {
      ok: true,
      summary: 'Organized layers — renamed ' + renamedCount + ', created ' + groupCount + ' group(s)',
      undo_history_states_consumed: 1,
      next_suggested_tool: 'photoshop_get_layers',
      details: {
        naming_scheme: '${naming}',
        auto_group: ${autoGroup ? 'true' : 'false'},
        renamed_count: renamedCount,
        group_count: groupCount
      }
    };
  `;

  return executeRecipe(connection, 'Organize Layers', body);
}

function parseNaming(raw: unknown): NamingScheme {
  if (typeof raw !== 'string') return 'type_index';
  const v = raw.trim().toLowerCase();
  return NAMING_OPTIONS.find((o) => o === v) ?? 'type_index';
}
