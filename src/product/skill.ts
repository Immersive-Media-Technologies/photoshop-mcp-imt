// ps_skill — serves the Photoshop agent skill (skills/ps) from the server itself, so clients that
// cannot load skill folders (a Claude Desktop extension, Cursor, ChatGPT through the gateway) still
// get it. Layouts: source checkout and npm package → <root>/skills/ps; .mcpb → server/skills/ps
// (dist/product/../.. is the package root in all three).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDefinition, ToolResult } from '../core/tool-registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function skillDir(root: string = ROOT): string {
  return path.join(root, 'skills', 'ps');
}

/** Reference names (file names without .md) under skills/ps/references. */
export function listSkillDocs(dir: string = skillDir()): string[] {
  const refs = path.join(dir, 'references');
  if (!existsSync(refs)) return [];
  return readdirSync(refs)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort();
}

/**
 * "" / "SKILL" / "SKILL.md" → the router; "generative" / "references/generative.md" → that reference.
 * Null for an unknown name. Names are restricted to [a-z0-9-] — no path traversal.
 */
export function readSkillDoc(doc: string | undefined, dir: string = skillDir()): string | null {
  const d = (doc ?? '').trim().replace(/\\/g, '/');
  if (!d || /^skill(\.md)?$/i.test(d)) {
    const f = path.join(dir, 'SKILL.md');
    return existsSync(f) ? readFileSync(f, 'utf8') : null;
  }
  const name = d.replace(/^\.?\/?references\//, '').replace(/\.md$/i, '').toLowerCase();
  if (!/^[a-z0-9-]+$/.test(name)) return null;
  const f = path.join(dir, 'references', `${name}.md`);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
}

function text(t: string, isError = false): ToolResult {
  return isError ? { content: [{ type: 'text', text: t }], isError: true } : { content: [{ type: 'text', text: t }] };
}

export function skillToolDefinition(dir: string = skillDir()): ToolDefinition {
  const docs = listSkillDocs(dir);
  return {
    tool: {
      name: 'ps_skill',
      description:
        'The Photoshop agent skill. No `doc`: the router — tools, order of work, addressing, what scripts cannot do in Photoshop and ' +
        'which reference to read; read it at the start of any Photoshop task beyond a single read or edit. `doc`: one reference — ' +
        "Photoshop's generative tools (Generative Fill / Expand / Remove, Generate Image, partner models and credits, reference images), " +
        'retouch (Remove tool, Harmonize, Generative Upscale, Neural Filters), selection and masking, colour and retouch recipes, ' +
        'batch and export, AI Assistant, multi-tool combos, gotchas.',
      inputSchema: {
        type: 'object',
        properties: {
          doc: { type: 'string', description: docs.length ? `reference: ${docs.join(' | ')}` : 'reference name' },
        },
      },
    },
    handler: async (args) => {
      const doc = typeof args.doc === 'string' ? args.doc : undefined;
      const body = readSkillDoc(doc, dir);
      if (body === null) {
        const list = listSkillDocs(dir);
        return text(`unknown skill doc '${doc ?? ''}'. Available: ${list.length ? list.join(', ') : '(skill files missing from this install)'}`, true);
      }
      return text(body);
    },
  };
}
