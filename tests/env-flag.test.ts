import { describe, expect, it } from 'vitest';
import { envFlag } from '../src/utils/env-flag.js';
import { uxpMode } from '../src/platform/uxp-transport.js';

describe('envFlag', () => {
  it('accepts shell and MCPB spellings', () => {
    for (const v of ['1', 'true', 'TRUE', 'on', 'yes']) expect(envFlag('X', false, { X: v })).toBe(true);
    for (const v of ['0', 'false', 'off', 'no', '']) expect(envFlag('X', true, { X: v })).toBe(false);
  });
  it('falls back to the default when unset or garbage', () => {
    expect(envFlag('X', false, {})).toBe(false);
    expect(envFlag('X', true, {})).toBe(true);
    expect(envFlag('X', true, { X: 'maybe' })).toBe(true);
  });
  it('drives the UXP mode', () => {
    expect(uxpMode({})).toBe('off');
    expect(uxpMode({ PS_MCP_UXP: 'true' })).toBe('fallback');
    expect(uxpMode({ PS_MCP_UXP: '1', PS_MCP_UXP_PREFER: 'true' })).toBe('prefer');
    expect(uxpMode({ PS_MCP_UXP: 'false', PS_MCP_UXP_PREFER: '1' })).toBe('off');
  });
});
