import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
import { atomicFailure, atomicFailureFromError, atomicSuccess, parseSnippetResult, runSnippet } from './atomic-shared.js';
import {
  emitTextRangesLiteral,
  emitTextStyleLiteral,
  parseTextRangesArg,
  parseTextStyleArgs,
} from './text-style-options.js';

export function createTextTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_list_fonts',
        description:
          'List installed fonts available to Photoshop.\n\n' +
          'Use when: choosing a font for photoshop_create_text_layer or photoshop_set_text_font.\n' +
          'TextItem.font requires the PostScript name — use postScriptName from results, or pass display name to set/create tools (they resolve automatically).\n\n' +
          'Returns: fonts array ({ name, postScriptName, family, style }), total count, truncated flag.\n' +
          'First call may be slow (app.fonts.length can exceed 1000). Side effects: none.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional substring filter (matches name, postScriptName, or family)',
            },
            limit: {
              type: 'number',
              description: 'Maximum fonts to return (default: 200)',
              default: 200,
              minimum: 1,
              maximum: 1000,
            },
          },
        },
      },
      handler: async (args) => listFonts(connection, args),
    },
    {
      tool: {
        name: 'photoshop_set_text_font',
        description:
          'Set font family and size for active text layer.\n\n' +
          'Accepts display name (e.g. "Arial") or PostScript name (e.g. "ArialMT") — resolved via app.fonts.\n' +
          'Use photoshop_list_fonts to discover available fonts.',
        inputSchema: {
          type: 'object',
          properties: {
            fontName: {
              type: 'string',
              description: 'Font display or PostScript name (see photoshop_list_fonts)',
            },
            fontSize: {
              type: 'number',
              description: 'Font size in points (optional)',
              minimum: 1,
            },
          },
          required: ['fontName'],
        },
      },
      handler: async (args) => setTextFont(connection, args),
    },
    {
      tool: {
        name: 'photoshop_set_text_color',
        description: 'Set color for active text layer',
        inputSchema: {
          type: 'object',
          properties: {
            red: {
              type: 'number',
              description: 'Red component (0-255)',
              minimum: 0,
              maximum: 255,
            },
            green: {
              type: 'number',
              description: 'Green component (0-255)',
              minimum: 0,
              maximum: 255,
            },
            blue: {
              type: 'number',
              description: 'Blue component (0-255)',
              minimum: 0,
              maximum: 255,
            },
          },
          required: ['red', 'green', 'blue'],
        },
      },
      handler: async (args) => setTextColor(connection, args),
    },
    {
      tool: {
        name: 'photoshop_set_text_alignment',
        description: 'Set text alignment for active text layer',
        inputSchema: {
          type: 'object',
          properties: {
            alignment: {
              type: 'string',
              description: 'Text alignment',
              enum: ['LEFT', 'CENTER', 'RIGHT', 'LEFTJUSTIFIED', 'CENTERJUSTIFIED', 'RIGHTJUSTIFIED', 'FULLYJUSTIFIED'],
            },
          },
          required: ['alignment'],
        },
      },
      handler: async (args) => setTextAlignment(connection, args),
    },
    {
      tool: {
        name: 'photoshop_update_text_content',
        description: 'Update the text content of active text layer',
        inputSchema: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: 'New text content',
            },
          },
          required: ['text'],
        },
      },
      handler: async (args) => updateTextContent(connection, args),
    },
    {
      tool: {
        name: 'photoshop_set_text_style',
        description:
          'Set layer-wide typography on the active text layer: tracking, leading, point vs paragraph box, alignment, font, size, color.\n\n' +
          'Users often say: letter spacing, tracking, line height, leading, text box width, paragraph text, 字间距, 行高, 文本框.\n\n' +
          'Use when: tightening/loosening type, setting line height, converting to a wrapped paragraph box, or batching several text attributes in one undo-friendly call.\n' +
          'Do NOT use when: creating a new layer — pass the same fields on photoshop_create_text_layer.\n' +
          'Do NOT use when: mixed fonts/colors inside one layer — use photoshop_set_text_ranges.\n' +
          'Do NOT use execute_script for tracking/leading/box.\n\n' +
          'Returns: JSON { ok, summary, details: { style } }.\n' +
          'Preconditions: active text layer. Side effects: mutates TextItem attributes.',
        inputSchema: {
          type: 'object',
          properties: {
            tracking: {
              type: 'number',
              description: 'Character spacing in 1/1000 em (−1000 to 10000)',
            },
            leading: {
              type: 'number',
              description: 'Line height in points. Sets auto_leading false.',
              minimum: 0.1,
            },
            auto_leading: {
              type: 'boolean',
              description: 'Use Photoshop auto leading',
            },
            kind: {
              type: 'string',
              enum: ['point', 'paragraph'],
              description: 'point or paragraph (wrapped) text',
            },
            box_width: {
              type: 'number',
              description: 'Paragraph box width in pixels (implies kind=paragraph)',
              minimum: 1,
            },
            box_height: {
              type: 'number',
              description: 'Paragraph box height in pixels (implies kind=paragraph)',
              minimum: 1,
            },
            alignment: {
              type: 'string',
              enum: [
                'LEFT',
                'CENTER',
                'RIGHT',
                'LEFTJUSTIFIED',
                'CENTERJUSTIFIED',
                'RIGHTJUSTIFIED',
                'FULLYJUSTIFIED',
              ],
              description: 'Justification (same enum as photoshop_set_text_alignment)',
            },
            fontName: {
              type: 'string',
              description: 'Font display or PostScript name',
            },
            fontSize: {
              type: 'number',
              description: 'Size in points',
              minimum: 1,
            },
            red: { type: 'number', description: 'Red 0–255', minimum: 0, maximum: 255 },
            green: { type: 'number', description: 'Green 0–255', minimum: 0, maximum: 255 },
            blue: { type: 'number', description: 'Blue 0–255', minimum: 0, maximum: 255 },
          },
        },
      },
      handler: async (args) => setTextStyle(connection, args),
    },
    {
      tool: {
        name: 'photoshop_set_text_ranges',
        description:
          'Apply mixed fonts, sizes, and colors inside a single text layer (Action Manager textStyleRange).\n\n' +
          'Users often say: mixed type, two fonts in one line, multicolor text, 混排, 同一文字层.\n\n' +
          'Use when: one layer must contain more than one font or color. from is inclusive, to is exclusive (JavaScript slice / ExtendScript string indexes).\n' +
          'Do NOT use when: the whole layer shares one style — use photoshop_set_text_style.\n' +
          'Do NOT split into extra layers for mixed type unless this tool errors.\n\n' +
          'Returns: JSON { ok, summary, details: { style, ranges } }.\n' +
          'Preconditions: active text layer. Unspecified gaps keep the layer default style. Side effects: rewrites character styles; restores tracking/leading/box afterward.',
        inputSchema: {
          type: 'object',
          properties: {
            ranges: {
              type: 'array',
              description: 'Non-overlapping character spans (from inclusive, to exclusive)',
              minItems: 1,
              maxItems: 64,
              items: {
                type: 'object',
                properties: {
                  from: { type: 'number', description: 'Start index (inclusive)', minimum: 0 },
                  to: { type: 'number', description: 'End index (exclusive)' },
                  fontName: { type: 'string', description: 'Font display or PostScript name for this span' },
                  fontSize: { type: 'number', description: 'Size in points', minimum: 1 },
                  red: { type: 'number', minimum: 0, maximum: 255 },
                  green: { type: 'number', minimum: 0, maximum: 255 },
                  blue: { type: 'number', minimum: 0, maximum: 255 },
                },
                required: ['from', 'to'],
              },
            },
          },
          required: ['ranges'],
        },
      },
      handler: async (args) => setTextRanges(connection, args),
    },
  ];
}

async function listFonts(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const query = args.query as string | undefined;
  const limit = (args.limit as number | undefined) ?? 200;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.listFonts(query, limit);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Fonts listed${query ? ` (query: "${query}")` : ''}\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error listing fonts: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function setTextFont(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const fontName = args.fontName as string;
  const fontSize = args.fontSize as number | undefined;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.setTextFont(fontName, fontSize);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Text font set to ${fontName}${fontSize ? `, size ${fontSize}pt` : ''}\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error setting text font: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function setTextColor(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const red = args.red as number;
  const green = args.green as number;
  const blue = args.blue as number;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.setTextColor(red, green, blue);
    await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Text color set to RGB(${red}, ${green}, ${blue})`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error setting text color: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function setTextAlignment(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const alignment = args.alignment as string;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.setTextAlignment(alignment);
    await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Text alignment set to ${alignment}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error setting text alignment: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function updateTextContent(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const text = args.text as string;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.updateTextContent(text);
    await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Text content updated to: "${text}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error updating text content: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function setTextStyle(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const parsed = parseTextStyleArgs(args, { requireSome: true });
  if (parsed.error) return atomicFailure(parsed.error);

  try {
    const raw = await runSnippet(connection, ExtendScriptSnippets.setTextStyle(emitTextStyleLiteral(parsed.style)));
    const details = parseSnippetResult(raw);
    if (!details) {
      return atomicFailureFromError(new Error(`Unparseable text style result: ${String(raw)}`));
    }
    const style = details.style && typeof details.style === 'object' ? (details.style as Record<string, unknown>) : details;
    const tracking = typeof style.tracking === 'number' ? ` tracking=${style.tracking}` : '';
    const kind = typeof style.kind === 'string' ? ` ${style.kind}` : '';
    return atomicSuccess(`Text style updated${kind}${tracking}`, details);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}

async function setTextRanges(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const parsed = parseTextRangesArg(args);
  if (parsed.error) return atomicFailure(parsed.error);

  try {
    const raw = await runSnippet(connection, ExtendScriptSnippets.setTextRanges(emitTextRangesLiteral(parsed.ranges)));
    const details = parseSnippetResult(raw);
    if (!details) {
      return atomicFailureFromError(new Error(`Unparseable text ranges result: ${String(raw)}`));
    }
    return atomicSuccess(`Applied ${parsed.ranges.length} text range(s)`, details);
  } catch (error) {
    return atomicFailureFromError(error);
  }
}
