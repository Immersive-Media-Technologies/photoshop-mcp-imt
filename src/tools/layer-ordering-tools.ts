import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';

export function createLayerOrderingTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_move_layer_to_position',
        description: 'Move the active layer relative to another layer',
        inputSchema: {
          type: 'object',
          properties: {
            targetLayerName: {
              type: 'string',
              description: 'Name of the layer to move relative to',
            },
            position: {
              type: 'string',
              description: 'Position relative to target layer',
              enum: ['ABOVE', 'BELOW', 'TOP', 'BOTTOM'],
            },
          },
          required: ['targetLayerName', 'position'],
        },
      },
      handler: async (args) => moveLayerToPosition(connection, args),
    },
    {
      tool: {
        name: 'photoshop_move_layer_to_top',
        description: 'Move the active layer to the top of the layer stack',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => moveLayerToTop(connection),
    },
    {
      tool: {
        name: 'photoshop_move_layer_to_bottom',
        description: 'Move the active layer to the bottom of the layer stack',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => moveLayerToBottom(connection),
    },
    {
      tool: {
        name: 'photoshop_move_layer_up',
        description: 'Move the active layer up one position in the layer stack',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => moveLayerUp(connection),
    },
    {
      tool: {
        name: 'photoshop_move_layer_down',
        description: 'Move the active layer down one position in the layer stack',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => moveLayerDown(connection),
    },
  ];
}

async function moveLayerToPosition(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const targetLayerName = args.targetLayerName as string;
  const position = args.position as string;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.moveLayerToPosition(targetLayerName, position);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer moved ${position} "${targetLayerName}"\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving layer: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function moveLayerToTop(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.moveLayerToTop();
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer moved to top\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving layer to top: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function moveLayerToBottom(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.moveLayerToBottom();
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer moved to bottom\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving layer to bottom: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function moveLayerUp(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.moveLayerUp();
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer moved up\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving layer up: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function moveLayerDown(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.moveLayerDown();
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Layer moved down\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error moving layer down: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
