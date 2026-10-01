import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';

export function createImagePlacementTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_place_image',
        description:
          'Place an external image file as a new layer in the active document.\n\n' +
          'x/y are absolute canvas coordinates for the placed layer\'s top-left bound in pixels ' +
          '(0,0 = document top-left). They are NOT an offset from Photoshop\'s default centered Place.\n\n' +
          'Use when: compositing assets into an open document at a known position.\n' +
          'Do NOT use when: opening a file as a new document — use photoshop_open_image.\n\n' +
          'Returns: placed layer name, bounds, and position.semantics = absolute_top_left.\n' +
          'Preconditions: active document; file must exist. Side effects: adds a new layer.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Full path to the image file (JPEG, PNG, PSD, etc.)',
            },
            x: {
              type: 'number',
              description: 'Absolute canvas X of the placed layer top-left, in pixels (default: 0)',
              default: 0,
            },
            y: {
              type: 'number',
              description: 'Absolute canvas Y of the placed layer top-left, in pixels (default: 0)',
              default: 0,
            },
          },
          required: ['filePath'],
        },
      },
      handler: async (args) => placeImage(connection, args),
    },
    {
      tool: {
        name: 'photoshop_open_image',
        description:
          'Open an image file as a new Photoshop document.\n\n' +
          'Use when: user provides a file path to edit or no document is open yet.\n' +
          'Do NOT use when: adding to an existing composite — use photoshop_place_image.\n\n' +
          'Returns: document id, name, width, height.\n' +
          'Preconditions: file must exist on disk. Side effects: opens document as active.',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: {
              type: 'string',
              description: 'Full path to the image file',
            },
          },
          required: ['filePath'],
        },
      },
      handler: async (args) => openImage(connection, args),
    },
  ];
}

async function placeImage(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const filePath = args.filePath as string;
  const x = typeof args.x === 'number' && Number.isFinite(args.x) ? args.x : 0;
  const y = typeof args.y === 'number' && Number.isFinite(args.y) ? args.y : 0;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.placeImage(filePath, x, y);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Image placed successfully: ${filePath}\nPosition (absolute top-left): (${x}, ${y})\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error placing image: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function openImage(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const filePath = args.filePath as string;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.openImage(filePath);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Image opened as new document: ${filePath}\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error opening image: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
