import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { recordMcpToolCall } from '../analytics/mcp-session.js';
import type { ToolHandler } from '../core/tool-registry.js';

export type PhotoshopErrorCode =
  | 'no_active_document'
  | 'no_active_layer'
  | 'layer_not_found'
  | 'document_not_found'
  | 'ambiguous_name'
  | 'invalid_arguments'
  | 'selection_required'
  | 'version_unsupported'
  | 'generative_unavailable'
  | 'generative_timeout'
  | 'generative_credits_exhausted'
  | 'generative_no_selection'
  | 'uxp_bridge_unavailable'
  | 'extendscript_runtime_error'
  | 'file_not_found'
  | 'font_not_found'
  | 'unsupported_color_mode'
  | 'no_base_layer_below'
  | 'not_clipping'
  // Deep Artisan 20.09
  | 'photoshop_busy'
  | 'script_timeout'
  | 'command_unavailable'
  | 'unknown';

export interface PhotoshopErrorEnvelope {
  ok: false;
  code: PhotoshopErrorCode;
  message: string;
  suggested_next_tool?: string;
  suggested_args?: Record<string, unknown>;
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  code: PhotoshopErrorCode;
  suggested_next_tool?: string;
}> = [
  // Deep Artisan 20.09 — ПЕРВЫМИ: иначе «timed out … queue» уезжал в generative_timeout.
  // Photoshop в модальном режиме (диалог/прогресс/инструмент в поиске): ВСЕ скрипты
  // висят до таймаута — проба 4 с не ответила → busy (connection.ts), повторять нельзя.
  { pattern: /Photoshop busy/i, code: 'photoshop_busy' },
  { pattern: /Script execution timeout|waiting in the execution queue/i, code: 'script_timeout', suggested_next_tool: 'photoshop_get_state' },
  // «Команда "X" в данный момент недоступна» / "is not currently available" — состояние
  // документа не допускает команду (один видимый слой для Merge Visible, слой заблокирован,
  // группа, фон…) — не версия Photoshop и не MCP.
  { pattern: /в данный момент недоступна|is not currently available|not currently available|not available at this time/i, code: 'command_unavailable', suggested_next_tool: 'photoshop_get_layers' },
  { pattern: /document_not_found/i, code: 'document_not_found', suggested_next_tool: 'photoshop_list_documents' },
  { pattern: /no active document/i, code: 'no_active_document', suggested_next_tool: 'photoshop_get_state' },
  { pattern: /no documents/i, code: 'no_active_document', suggested_next_tool: 'photoshop_get_state' },
  { pattern: /no active layer/i, code: 'no_active_layer', suggested_next_tool: 'photoshop_get_layers' },
  { pattern: /layer not found/i, code: 'layer_not_found', suggested_next_tool: 'photoshop_get_layers' },
  { pattern: /no base layer below|nothing to clip into/i, code: 'no_base_layer_below', suggested_next_tool: 'photoshop_get_layers' },
  { pattern: /not clipping|not a clipping mask/i, code: 'not_clipping', suggested_next_tool: 'photoshop_get_layers' },
  { pattern: /selection/i, code: 'selection_required', suggested_next_tool: 'photoshop_get_state' },
  { pattern: /version_unsupported|not supported.*version/i, code: 'version_unsupported', suggested_next_tool: 'photoshop_get_capabilities' },
  { pattern: /generative.*credit|quota|sign in/i, code: 'generative_credits_exhausted', suggested_next_tool: 'photoshop_get_capabilities' },
  { pattern: /generative.*timeout|timed out/i, code: 'generative_timeout', suggested_next_tool: 'photoshop_get_preview' },
  { pattern: /generative_no_selection|selection required for generative/i, code: 'generative_no_selection', suggested_next_tool: 'photoshop_select_rectangle' },
  { pattern: /uxp.?bridge|neural filter.*bridge/i, code: 'uxp_bridge_unavailable', suggested_next_tool: 'photoshop_get_capabilities' },
  { pattern: /generative/i, code: 'generative_unavailable', suggested_next_tool: 'photoshop_get_capabilities' },
  { pattern: /font_not_found/i, code: 'font_not_found', suggested_next_tool: 'photoshop_list_fonts' },
  { pattern: /file not found|does not exist/i, code: 'file_not_found' },
  { pattern: /color mode/i, code: 'unsupported_color_mode', suggested_next_tool: 'photoshop_get_document_info' },
];

export function classifyError(message: string): PhotoshopErrorEnvelope {
  for (const { pattern, code, suggested_next_tool } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return {
        ok: false,
        code,
        message,
        ...(suggested_next_tool ? { suggested_next_tool } : {}),
      };
    }
  }

  return {
    ok: false,
    code: message.includes('ERROR:') ? 'extendscript_runtime_error' : 'unknown',
    message,
    suggested_next_tool: 'photoshop_get_state',
  };
}

export function envelopeToToolResult(envelope: PhotoshopErrorEnvelope): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(envelope, null, 2) }],
    isError: true,
  };
}

export function enrichErrorResult(result: CallToolResult): CallToolResult {
  const text = result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  if (!text) return result;

  try {
    const parsed = JSON.parse(text) as { ok?: boolean; code?: string };
    if (parsed.ok === false && parsed.code) return result;
  } catch {
    // not JSON — classify plain error text
  }

  if (text.startsWith('Error:') || text.toLowerCase().includes('error')) {
    const message = text.replace(/^Error:\s*/i, '').trim();
    return envelopeToToolResult(classifyError(message));
  }

  return result;
}

export function buildEnvelopeFromError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return envelopeToToolResult(classifyError(message));
}

function extractErrorCodeFromResult(result: CallToolResult): string {
  const text = result.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  if (!text) return 'unknown';

  try {
    const parsed = JSON.parse(text) as { ok?: boolean; code?: string };
    if (parsed.ok === false && parsed.code) return parsed.code;
  } catch {
    // not JSON — fall through
  }

  return 'unknown';
}

export function wrapToolHandler(toolName: string, handler: ToolHandler): ToolHandler {
  return async (args) => {
    const started = Date.now();
    try {
      let result = await handler(args);
      if (result.isError) {
        result = enrichErrorResult(result);
      }

      const ok = !result.isError;
      recordMcpToolCall({
        toolName,
        ok,
        errorCode: ok ? undefined : extractErrorCodeFromResult(result),
        durationMs: Date.now() - started,
      });

      return result;
    } catch (error) {
      const result = buildEnvelopeFromError(error);
      recordMcpToolCall({
        toolName,
        ok: false,
        errorCode: extractErrorCodeFromResult(result),
        durationMs: Date.now() - started,
      });
      return result;
    }
  };
}
