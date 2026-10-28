// Facade over the upstream tool registry (2026-09-17).
//
// Upstream exposes all ~116 tools to the client, and tool definitions go to the
// model on EVERY turn: 25–30K tokens of context. With the facade (a dispatcher,
// the catalog + do pattern) the client sees only:
//   ps_catalog(category?)        — list of operations (by category / with parameters)
//   ps_do(operation, args)       — any upstream operation by name
//   ps_batch(ops[], stopOnError) — several operations in a row
//   ps_get_state / ps_get_layers / ps_save_document / ps_execute_script
//   ps_export_frame(path)        — PNG of the current view
//   ps_recipe(name, args)        — upstream's ready-made recipes
//   ps_skill(doc?)               — the Photoshop agent skill (skills/ps), router or one reference
// All real tools stay registered: ps_do calls them through the registry, so
// upstream behaviour and errors do not change.
import { mkdirSync } from 'node:fs';
import { envFlag } from '../utils/env-flag.js';
import { dirname } from 'node:path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition, ToolRegistry, ToolResult } from '../core/tool-registry.js';
import { isTransportFailure, uxp, uxpAvailable, uxpMode } from '../platform/uxp-transport.js';
import { skillToolDefinition } from './skill.js';

export const FACADE_PREFIX = 'photoshop_';

export function facadeEnabled(): boolean {
  return envFlag('PS_MCP_FACADE');
}

function opName(toolName: string): string {
  return toolName.startsWith(FACADE_PREFIX) ? toolName.slice(FACADE_PREFIX.length) : toolName;
}

function toolName(op: string): string {
  const o = String(op || '').trim();
  return o.startsWith(FACADE_PREFIX) ? o : FACADE_PREFIX + o;
}

function firstSentence(desc: string | undefined): string {
  const d = (desc || '').split('\n')[0].trim();
  return d.length > 160 ? d.slice(0, 157) + '…' : d;
}

function text(t: string, isError = false): ToolResult {
  return isError ? { content: [{ type: 'text', text: t }], isError: true } : { content: [{ type: 'text', text: t }] };
}

/** Full operation signature (for the per-category catalog). */
function opDetail(t: Tool): string {
  const props = (t.inputSchema?.properties ?? {}) as Record<string, { type?: string; description?: string; enum?: unknown[]; default?: unknown }>;
  const req = new Set((t.inputSchema?.required as string[] | undefined) ?? []);
  const lines = [`- ${opName(t.name)}: ${firstSentence(t.description)}`];
  for (const [k, v] of Object.entries(props)) {
    const typ = v.enum ? v.enum.map(String).join(' | ') : v.type ?? 'any';
    const def = v.default !== undefined ? ` (default ${JSON.stringify(v.default)})` : '';
    lines.push(`    ${k}${req.has(k) ? '' : '?'}: ${typ}${def}${v.description ? ' — ' + v.description : ''}`);
  }
  return lines.join('\n');
}

export function buildFacadeTools(
  registry: ToolRegistry,
  categories: Map<string, string>,
): ToolDefinition[] {
  const catOf = (name: string): string => categories.get(name) ?? 'other';
  const allOps = (): Tool[] => registry.list().filter((t) => t.name.startsWith(FACADE_PREFIX) && !t.name.startsWith(FACADE_PREFIX + 'recipe_'));
  const recipes = (): Tool[] => registry.list().filter((t) => t.name.startsWith(FACADE_PREFIX + 'recipe_'));

  const run = async (op: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const name = toolName(op);
    if (!registry.has(name)) {
      const near = registry
        .list()
        .map((t) => opName(t.name))
        .filter((n) => n.includes(opName(name).split('_')[0]))
        .slice(0, 8);
      return text(
        `unknown operation '${opName(name)}'. Use ps_catalog to list operations.` +
          (near.length ? ` Similar: ${near.join(', ')}` : ''),
        true,
      );
    }
    return registry.execute(name, args ?? {});
  };

  // UXP bridge as the backup transport (2026-09-29): ExtendScript failed (Photoshop
  // is modal / timed out) and the plugin is alive → the same operation through UXP;
  // PS_MCP_UXP_PREFER=1 → UXP first. The answer is marked "via: uxp".
  const resultText = (r: ToolResult): string =>
    r.content.map((c) => (c.type === 'text' ? String((c as { text?: string }).text ?? '') : '')).join('\n');
  const viaUxp = async (
    primary: () => Promise<ToolResult>,
    alt: () => Promise<{ ok: boolean; data?: unknown; error?: string }>,
  ): Promise<ToolResult> => {
    const mode = uxpMode();
    const run = async (): Promise<ToolResult> => {
      const u = await alt();
      if (!u.ok) return text(`UXP bridge: ${u.error ?? 'failed'}`, true);
      return text(JSON.stringify({ via: 'uxp', ...(typeof u.data === 'object' && u.data ? (u.data as object) : { data: u.data }) }, null, 2));
    };
    if (mode === 'prefer' && (await uxpAvailable())) return run();
    const r = await primary();
    if (mode !== 'off' && r.isError && isTransportFailure(resultText(r)) && (await uxpAvailable())) {
      const u = await run();
      if (!u.isError) return u;
      return text(resultText(r) + '\n' + resultText(u), true);
    }
    return r;
  };

  const tools: ToolDefinition[] = [
    {
      tool: {
        name: 'ps_catalog',
        description:
          'List Photoshop operations available through ps_do. Without `category`: categories with counts and operation names. ' +
          'With `category`: every operation of that category with its parameters. Call it before using an operation you have not used in this session.',
        inputSchema: {
          type: 'object',
          properties: {
            category: { type: 'string', description: 'document | layer | text | selection | mask | filter | adjust | color | generative | neural | smart_object | transform | history | action | export | style | data | stack | state | image | recipe' },
          },
        },
      },
      handler: async (args) => {
        const cat = typeof args.category === 'string' ? args.category.trim().toLowerCase() : '';
        if (cat === 'recipe') {
          return text(['Recipes (ps_recipe name, args):', ...recipes().map(opDetail)].join('\n'));
        }
        if (cat) {
          const ops = allOps().filter((t) => catOf(t.name) === cat);
          if (ops.length === 0) return text(`no such category '${cat}'. Categories: ${[...new Set(allOps().map((t) => catOf(t.name)))].sort().join(', ')}`, true);
          return text([`Category ${cat} (${ops.length}):`, ...ops.map(opDetail)].join('\n'));
        }
        const groups = new Map<string, string[]>();
        for (const t of allOps()) {
          const c = catOf(t.name);
          if (!groups.has(c)) groups.set(c, []);
          groups.get(c)!.push(opName(t.name));
        }
        const lines = [...groups.entries()].sort().map(([c, names]) => `${c} (${names.length}): ${names.sort().join(', ')}`);
        lines.push(`recipe (${recipes().length}): ${recipes().map((t) => opName(t.name).replace(/^recipe_/, '')).sort().join(', ')}`);
        return text(lines.join('\n'));
      },
    },
    {
      tool: {
        name: 'ps_do',
        description:
          'Run one Photoshop operation by name (see ps_catalog), e.g. {"operation":"create_text_layer","args":{"text":"Hi"}}. ' +
          'Returns the operation result JSON. Prefer this over writing ExtendScript.',
        inputSchema: {
          type: 'object',
          properties: {
            operation: { type: 'string', description: 'operation name from ps_catalog (without the photoshop_ prefix)' },
            args: { type: 'object', description: 'operation parameters', additionalProperties: true },
          },
          required: ['operation'],
        },
      },
      handler: async (args) => run(String(args.operation ?? ''), (args.args as Record<string, unknown>) ?? {}),
    },
    {
      tool: {
        name: 'ps_batch',
        description: 'Run several operations in order. Each op: {operation, args}. Stops at the first error when stopOnError (default true). Returns one result per op.',
        inputSchema: {
          type: 'object',
          properties: {
            ops: {
              type: 'array',
              items: {
                type: 'object',
                properties: { operation: { type: 'string' }, args: { type: 'object', additionalProperties: true } },
                required: ['operation'],
              },
            },
            stopOnError: { type: 'boolean', default: true },
          },
          required: ['ops'],
        },
      },
      handler: async (args) => {
        const ops = Array.isArray(args.ops) ? (args.ops as Array<{ operation: string; args?: Record<string, unknown> }>) : [];
        const stop = args.stopOnError !== false;
        const out: Array<{ operation: string; ok: boolean; result: unknown }> = [];
        for (const op of ops) {
          const r = await run(op.operation, op.args ?? {});
          const ok = !r.isError;
          out.push({ operation: op.operation, ok, result: r.content });
          if (!ok && stop) break;
        }
        return text(JSON.stringify({ ok: out.every((o) => o.ok), results: out }, null, 2), !out.every((o) => o.ok));
      },
    },
    {
      tool: {
        name: 'ps_get_state',
        description: 'Active document state: name, size, mode, layers summary, selection. Cheap — call it before and after edits instead of previews.',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => viaUxp(() => run('get_state', {}), () => uxp.state()),
    },
    {
      tool: {
        name: 'ps_get_layers',
        description: 'Layer tree of the active document (names, types, visibility, opacity, blend modes).',
        inputSchema: { type: 'object', properties: {} },
      },
      handler: async () => viaUxp(() => run('get_layers', {}), () => uxp.layers()),
    },
    {
      tool: {
        name: 'ps_save_document',
        description: 'Save the active document (optionally to a new path / format). Save a copy before irreversible steps (flatten, merge, overwrite).',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'absolute path; omit to save in place' },
            format: { type: 'string', description: 'PSD | JPEG | PNG' },
          },
        },
      },
      handler: async (args) => {
        // create the target folder, as ps_export_frame does (Photoshop does not)
        if (typeof args.path === 'string' && args.path.trim()) {
          try {
            mkdirSync(dirname(args.path.trim()), { recursive: true });
          } catch {
            /* let the save itself fail */
          }
        }
        const p = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : undefined;
        const fmt = String(args.format ?? '').toUpperCase();
        // UXP fallback only for PSD / save in place (other formats use the ExtendScript path)
        if (!p || !fmt || fmt === 'PSD') return viaUxp(() => run('save_document', args), () => uxp.save(p));
        return run('save_document', args);
      },
    },
    {
      tool: {
        name: 'ps_export_frame',
        description:
          'Export the current view of the active document as a PNG file to `path` (absolute). Use it for check frames the user will look at; name the file descriptively.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'absolute .png path' },
            quality: { type: 'number', description: 'for JPEG/WebP only' },
          },
          required: ['path'],
        },
      },
      handler: async (args) => {
        // Photoshop does not create the output folder: the first export into a new
        // folder failed with "General Photoshop error" (live run, 2026-09-17)
        if (typeof args.path === 'string' && args.path.trim()) {
          try {
            mkdirSync(dirname(args.path.trim()), { recursive: true });
          } catch {
            /* let the export itself fail with a clear error */
          }
        }
        return viaUxp(
          () => run('export_as', { path: args.path, format: 'PNG', ...(args.quality !== undefined ? { quality: args.quality } : {}) }),
          () => uxp.exportPng(String(args.path)),
        );
      },
    },
    {
      tool: {
        name: 'ps_execute_script',
        description:
          'Run arbitrary ExtendScript in Photoshop and return its result. Use only when no ps_do operation covers the task. ' +
          'The code runs inside a function: use an explicit `return` to pass data back (objects are serialized); a bare trailing expression returns undefined.',
        inputSchema: {
          type: 'object',
          properties: { script: { type: 'string', description: 'ExtendScript (ES3) source; end with `return …`' } },
          required: ['script'],
        },
      },
      // upstream expects the `code` parameter (live run, 2026-09-17: with `script` the
      // code did not run and the tool silently returned Result: "undefined")
      handler: async (args) => run('execute_script', { code: args.script ?? args.code }),
    },
    {
      tool: {
        name: 'ps_recipe',
        description: 'Run a multi-step recipe by name (ps_catalog category "recipe"): remove_background, enhance_portrait, apply_color_grade, prepare_for_web, sky_blend, …',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            args: { type: 'object', additionalProperties: true },
          },
          required: ['name'],
        },
      },
      handler: async (args) => run('recipe_' + String(args.name ?? '').replace(/^recipe_/, ''), (args.args as Record<string, unknown>) ?? {}),
    },
  ];
  tools.push(skillToolDefinition());
  if (uxpMode() !== 'off') {
    tools.push({
      tool: {
        name: 'ps_uxp',
        description:
          'Photoshop UXP bridge (backup transport, runs INSIDE Photoshop via the PS-MCP-IMT Bridge plugin). ' +
          'Use when ExtendScript calls fail with photoshop_busy / extendscript_timeout, or for batchPlay-only features. ' +
          'action: ping | batchplay (descriptors: action descriptor JSON array) | script (code: JS with photoshop/uxp/params in scope, use return).',
        inputSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['ping', 'batchplay', 'script'] },
            descriptors: { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'batchplay: action descriptors ({_obj: …})' },
            options: { type: 'object', additionalProperties: true, description: 'batchplay options (synchronousExecution, modalBehavior)' },
            code: { type: 'string', description: 'script: JavaScript body; `photoshop`, `uxp`, `params` are in scope; end with return' },
            args: { type: 'object', additionalProperties: true, description: 'script: params object' },
          },
          required: ['action'],
        },
      },
      handler: async (args) => {
        if (!(await uxpAvailable()))
          return text(
            'UXP bridge is not connected: the PS-MCP-IMT Bridge plugin is not running inside Photoshop. ' +
              'Ask the user to open Plugins → PS-MCP-IMT Bridge in Photoshop (the panel must be opened once per Photoshop launch), or to install the plugin (README, section «The UXP bridge»).',
            true,
          );
        const act = String(args.action ?? '');
        const u =
          act === 'ping'
            ? await uxp.ping()
            : act === 'batchplay'
              ? await uxp.batchPlay((args.descriptors as unknown[]) ?? [], args.options as Record<string, unknown> | undefined)
              : act === 'script'
                ? await uxp.evalJs(String(args.code ?? ''), args.args as Record<string, unknown> | undefined)
                : { ok: false, error: `unknown action '${act}'` };
        if (!u.ok) return text(`UXP bridge: ${u.error ?? 'failed'}`, true);
        return text(JSON.stringify(u.data ?? null, null, 2));
      },
    });
  }
  return tools;
}

export const FACADE_TOOL_NAMES = new Set([
  'ps_catalog',
  'ps_do',
  'ps_batch',
  'ps_get_state',
  'ps_get_layers',
  'ps_save_document',
  'ps_export_frame',
  'ps_execute_script',
  'ps_recipe',
  'ps_skill',
  'ps_uxp',
]);
