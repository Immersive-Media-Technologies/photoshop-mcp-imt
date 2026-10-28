// ps_skill: serves skills/ps (router + references) with no path traversal.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { listSkillDocs, readSkillDoc, skillToolDefinition } from '../src/product/skill.js';

const dir = mkdtempSync(join(tmpdir(), 'ps-skill-'));
mkdirSync(join(dir, 'references'));
writeFileSync(join(dir, 'SKILL.md'), '# router');
writeFileSync(join(dir, 'references', 'generative.md'), '# generative');
writeFileSync(join(dir, 'references', 'gotchas.md'), '# gotchas');
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const textOf = (r: { content: Array<{ type: string; text?: string }> }): string => r.content.map((c) => c.text ?? '').join('');

describe('ps_skill', () => {
  it('lists references sorted, without .md', () => {
    expect(listSkillDocs(dir)).toEqual(['generative', 'gotchas']);
  });
  it('router for no doc / SKILL / SKILL.md; reference by name, with or without references/ and .md', () => {
    for (const d of [undefined, '', 'SKILL', 'skill.md']) expect(readSkillDoc(d, dir)).toBe('# router');
    for (const d of ['generative', 'generative.md', 'references/generative.md', './references/generative']) expect(readSkillDoc(d, dir)).toBe('# generative');
  });
  it('refuses traversal and unknown names', () => {
    for (const d of ['../SKILL', '..', 'references/../../etc/passwd', 'nope', 'Gen erative']) expect(readSkillDoc(d, dir)).toBeNull();
  });
  it('tool: router, reference, error listing the available docs', async () => {
    const t = skillToolDefinition(dir);
    expect(t.tool.name).toBe('ps_skill');
    expect(String((t.tool.inputSchema.properties as Record<string, { description: string }>).doc.description)).toContain('generative | gotchas');
    expect(textOf(await t.handler({}))).toBe('# router');
    expect(textOf(await t.handler({ doc: 'gotchas' }))).toBe('# gotchas');
    const e = await t.handler({ doc: 'missing' });
    expect(e.isError).toBe(true);
    expect(textOf(e)).toContain('Available: generative, gotchas');
  });
  it('the shipped skill folder exists and the router names ps_skill', () => {
    const docs = listSkillDocs();
    expect(docs.length).toBeGreaterThan(0);
    expect(readSkillDoc(undefined)).toContain('ps_skill');
  });
});
