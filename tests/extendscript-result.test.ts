// toSource() payloads with raw line breaks inside strings (Photoshop's localized error texts).
import { describe, expect, it } from 'vitest';
import { parseExtendScriptPayload } from '../src/utils/extendscript-result.js';

describe('parseExtendScriptPayload', () => {
  it('parses JSON first', () => {
    expect(parseExtendScriptPayload('{"ok":true}')).toEqual({ ok: true });
  });
  it('parses a toSource literal whose string carries a raw newline', () => {
    const raw = '({ok:false, code:"generative_unavailable", message:"Общая ошибка Photoshop.\n- Команда \\"<неизвестно>\\" в данный момент недоступна."})';
    const parsed = parseExtendScriptPayload(raw) as Record<string, unknown>;
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('generative_unavailable');
    expect(String(parsed.message)).toContain('\n- Команда');
  });
  it('returns the trimmed string when nothing parses', () => {
    expect(parseExtendScriptPayload('  plain text  ')).toBe('plain text');
  });
});
