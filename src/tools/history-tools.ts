import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';

export function createHistoryTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_undo',
        description: 'Undo the last operation(s) - equivalent to Ctrl/Cmd+Z',
        inputSchema: {
          type: 'object',
          properties: {
            steps: {
              type: 'number',
              description: 'Number of steps to undo (default: 1)',
              minimum: 1,
              default: 1,
            },
          },
        },
      },
      handler: async (args) => undo(connection, args),
    },
    {
      tool: {
        name: 'photoshop_redo',
        description: 'Redo the previously undone operation(s) - equivalent to Ctrl/Cmd+Shift+Z',
        inputSchema: {
          type: 'object',
          properties: {
            steps: {
              type: 'number',
              description: 'Number of steps to redo (default: 1)',
              minimum: 1,
              default: 1,
            },
          },
        },
      },
      handler: async (args) => redo(connection, args),
    },
    {
      tool: {
        name: 'photoshop_get_history',
        description: 'Get the history states of the active document',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      handler: async () => getHistory(connection),
    },
  ];
}

async function undo(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const steps = (args.steps as number) || 1;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.undo(steps);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Undo successful (${steps} step${steps > 1 ? 's' : ''})\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error undoing: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function redo(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const steps = (args.steps as number) || 1;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.redo(steps);
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Redo successful (${steps} step${steps > 1 ? 's' : ''})\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error redoing: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function getHistory(connection: PhotoshopConnection): Promise<ToolResult> {
  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.getHistoryStates();
    const result = await api.executeScript(script);

    return {
      content: [
        {
          type: 'text' as const,
          text: `History States:\n${JSON.stringify(result, null, 2)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting history: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
