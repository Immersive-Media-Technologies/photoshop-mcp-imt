import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';
import { ExtendScriptSnippets } from '../api/extendscript.js';
import { resolveScriptTimeoutMs } from '../platform/script-timeout.js';
import { atomicFailure, parseSnippetResult } from './atomic-shared.js';

export function createActionTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_play_action',
        description:
          'Play a recorded action from the Actions palette.\n\n' +
          'Names are the ones the Actions panel shows, in the Photoshop UI language: the built-in set is ' +
          '"Default Actions" only in English Photoshop. When the set or the action does not exist, the error ' +
          '(code invalid_arguments) lists the names this Photoshop has; retry with one of them.',
        inputSchema: {
          type: 'object',
          properties: {
            actionName: {
              type: 'string',
              description: 'Name of the action to play, exactly as the Actions panel shows it',
            },
            actionSetName: {
              type: 'string',
              description:
                'Name of the action set containing the action, exactly as the Actions panel shows it (localized for the sets Photoshop ships)',
            },
          },
          required: ['actionName', 'actionSetName'],
        },
      },
      handler: async (args) => playAction(connection, args),
    },
    {
      tool: {
        name: 'photoshop_execute_script',
        description:
          'Execute custom ExtendScript (JSX) code inside Photoshop (advanced escape hatch).\n\n' +
          'Use when: no existing tool covers the operation and you can write safe JSX.\n' +
          'Do NOT use when: a recipe or atomic tool exists — prefer photoshop_recipe_* or photoshop_* tools.\n\n' +
          'Returns: script return value serialized as text/JSON.\n' +
          'IMPORTANT: Your code runs inside a wrapping IIFE. Use an explicit `return` to pass data back — ' +
          'a bare trailing expression returns undefined. Example: `return { ok: true };` ' +
          'Objects are serialized with toSource() and parsed automatically on macOS and Windows.\n' +
          'Long scripts: pass timeout_ms (up to 600000) so the default 30s budget does not kill the job.\n' +
          'Preconditions: valid ExtendScript; active document if script expects one. Side effects: depends on code.',
        inputSchema: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              description: 'ExtendScript code to execute',
            },
            timeout_ms: {
              type: 'number',
              description:
                'Script timeout in milliseconds (default 30000, max 600000). Override with env PHOTOSHOP_SCRIPT_TIMEOUT. Use for long loops, batch jobs, or large documents.',
              minimum: 1000,
              maximum: 600000,
            },
          },
          required: ['code'],
        },
      },
      handler: async (args) => executeCustomScript(connection, args),
    },
  ];
}

async function playAction(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const actionName = args.actionName as string;
  const actionSetName = args.actionSetName as string;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const script = ExtendScriptSnippets.playAction(actionName, actionSetName);
    const result = parseSnippetResult(await api.executeScript(script));
    if (result?.ok === false) {
      // Unknown set or action: the message lists the names this Photoshop has.
      return atomicFailure({
        ok: false,
        code: 'invalid_arguments',
        message: typeof result.message === 'string' ? result.message : 'Action not found',
      });
    }

    return {
      content: [
        {
          type: 'text' as const,
          text: `Action played: "${actionName}" from set "${actionSetName}"`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error playing action: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

async function executeCustomScript(
  connection: PhotoshopConnection,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const code = args.code as string;

  try {
    const apiFactory = new PhotoshopAPIFactory(connection);
    const api = await apiFactory.createAPI();

    const timeoutMs = resolveScriptTimeoutMs(
      typeof args.timeout_ms === 'number' ? args.timeout_ms : undefined
    );
    const script = ExtendScriptSnippets.executeCustomScript(code);
    const result = await api.executeScript(script, timeoutMs);

    return {
      content: [
        {
          type: 'text' as const,
          text: `Custom script executed\nResult: ${JSON.stringify(result)}`,
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error executing custom script: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
