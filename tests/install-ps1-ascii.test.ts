// Windows PowerShell 5.1 reads a BOM-less .ps1 in the ANSI code page: the UTF-8 bytes of «—»
// end in 0x94, which cp1252 maps to a right double quote that PowerShell treats as a string
// delimiter — the whole script fails to parse (seen live on Windows 11, 2026-10-04).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('install.ps1', () => {
  it('is pure ASCII so Windows PowerShell 5.1 parses it', () => {
    const s = readFileSync(new URL('../install.ps1', import.meta.url), 'utf8');
    const bad = [...s].map((c, i) => [c, i] as const).filter(([c]) => c.charCodeAt(0) > 127);
    expect(bad.map(([c, i]) => `${c}@${i}`)).toEqual([]);
  });
});
