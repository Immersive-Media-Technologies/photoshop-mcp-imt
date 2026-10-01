import { randomBytes } from 'node:crypto';
import { ToolDefinition, ToolResult } from '../../core/tool-registry.js';
import { resolveExportPath } from '../../lib/export-paths.js';
import { PhotoshopConnection } from '../../platform/connection.js';
import { clampInt, executeRecipe, jsString } from './_shared.js';

const TOOL_NAME = 'photoshop_recipe_prepare_for_web';

const FORMAT_OPTIONS = ['jpeg', 'png'] as const;
type WebFormat = (typeof FORMAT_OPTIONS)[number];

export function bindPrepareForWeb(connection: PhotoshopConnection): ToolDefinition {
  return {
    tool: {
      name: TOOL_NAME,
      description:
        'Export a web-optimized version of the active document: duplicate, convert to sRGB, downscale longest edge, sharpen for screen, save to disk. The source PSD stays untouched.\n' +
        '\n' +
        'Use when: the user wants a shareable JPEG/PNG sized for the web from the current artwork.\n' +
        'Do NOT use when: the user wants multiple platform-specific exports — use photoshop_recipe_export_social_variants. Do NOT call photoshop_save_document afterwards; this recipe already wrote the file.\n' +
        '\n' +
        'Returns: { ok, summary, output_paths, undo_history_states_consumed }.\n' +
        '\n' +
        'Preconditions: active document. Format is jpeg (default) or png.\n' +
        'Side effects: writes one file to disk; the source document is unchanged.',
      inputSchema: {
        type: 'object',
        properties: {
          max_dimension_px: {
            type: 'number',
            description: 'Longest-edge pixel cap (default 2048). Min 64, max 8192.',
            minimum: 64,
            maximum: 8192,
            default: 2048,
          },
          format: {
            type: 'string',
            description: 'Output format: jpeg (default) or png.',
            enum: ['jpeg', 'png'],
            default: 'jpeg',
          },
          quality: {
            type: 'number',
            description: 'JPEG quality on the Photoshop 1-12 scale. Default 9. Ignored for png.',
            minimum: 1,
            maximum: 12,
            default: 9,
          },
          path: {
            type: 'string',
            description:
              'Optional output path. Absolute paths used as-is. Relative paths resolve under ~/.photoshop-mcp/exports[/<chat-id>]. Omit to auto-generate.',
          },
        },
      },
    },
    handler: async (args) => runPrepareForWeb(connection, args),
  };
}

async function runPrepareForWeb(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const maxDim = clampInt(args.max_dimension_px, 64, 8192, 2048);
  const format = parseFormat(args.format);
  const quality = clampInt(args.quality, 1, 12, 9);
  const userPath = typeof args.path === 'string' ? args.path : undefined;

  const ext = format === 'jpeg' ? 'jpg' : 'png';
  let outPath = resolveExportPath(userPath, ext);
  if (!outPath.toLowerCase().endsWith(`.${ext}`)) {
    outPath = `${outPath}.${ext}`;
  }
  if (!userPath) {
    outPath = outPath.replace(`.${ext}`, `-${randomBytes(2).toString('hex')}.${ext}`);
  }

  const body = `
    var src = app.activeDocument;
    var dupName = 'mcp-prepare-' + (new Date()).getTime();
    var dup = src.duplicate(dupName, true);
    try {
      try {
        dup.convertProfile('sRGB IEC61966-2.1', Intent.RELATIVECOLORIMETRIC, true, true);
      } catch (eProfile) {}

      var w = dup.width.as('px');
      var h = dup.height.as('px');
      var longest = Math.max(w, h);
      if (longest > ${maxDim}) {
        var ratio = ${maxDim} / longest;
        dup.resizeImage(
          UnitValue(Math.round(w * ratio), 'px'),
          UnitValue(Math.round(h * ratio), 'px'),
          null,
          ResampleMethod.BICUBICSHARPER
        );
      }

      var sharpenLayer = dup.activeLayer;
      try {
        sharpenLayer.applyUnSharpMask(30, 0.6, 0);
      } catch (eSharpen) {}

      var outFile = new File("${jsString(outPath)}");
      ${
        format === 'jpeg'
          ? `var jpegOptions = new JPEGSaveOptions(); jpegOptions.quality = ${quality}; jpegOptions.embedColorProfile = true; dup.saveAs(outFile, jpegOptions, true);`
          : `var pngOptions = new PNGSaveOptions(); pngOptions.compression = 9; pngOptions.interlaced = false; dup.saveAs(outFile, pngOptions, true);`
      }
      var finalW = dup.width.as('px');
      var finalH = dup.height.as('px');
      dup.close(SaveOptions.DONOTSAVECHANGES);

      return {
        ok: true,
        summary: 'Exported web-optimized ${format.toUpperCase()} at ' + finalW + '×' + finalH + 'px',
        undo_history_states_consumed: 0,
        output_paths: [outFile.fsName],
        next_suggested_tool: 'photoshop_get_preview',
        details: {
          format: '${format}',
          quality: ${format === 'jpeg' ? quality : 0},
          max_dimension_px: ${maxDim}
        }
      };
    } catch (eOuter) {
      try { dup.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return { ok: false, code: 'recipe_runtime_error', message: 'Prepare-for-web failed: ' + (eOuter.message || eOuter) };
    }
  `;

  return executeRecipe(connection, 'Prepare for Web', body);
}

function parseFormat(raw: unknown): WebFormat {
  if (typeof raw !== 'string') return 'jpeg';
  const v = raw.trim().toLowerCase();
  return FORMAT_OPTIONS.find((o) => o === v) ?? 'jpeg';
}
