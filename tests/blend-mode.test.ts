import { describe, expect, it } from 'vitest';
import { LAYER_BLEND_MODE_ENUM, resolveLayerBlendMode } from '../src/tools/blend-mode.js';

describe('resolveLayerBlendMode', () => {
  it('maps COLOR to COLORBLEND (ExtendScript DOM name)', () => {
    expect(resolveLayerBlendMode('COLOR')).toBe('COLORBLEND');
  });

  it('accepts COLORBLEND as an alias', () => {
    expect(resolveLayerBlendMode('COLORBLEND')).toBe('COLORBLEND');
  });

  it('passes LUMINOSITY through unchanged', () => {
    expect(resolveLayerBlendMode('LUMINOSITY')).toBe('LUMINOSITY');
  });

  it('keeps DARKERCOLOR / LIGHTERCOLOR as Action Manager fallback tokens', () => {
    expect(resolveLayerBlendMode('DARKERCOLOR')).toBe('DARKERCOLOR');
    expect(resolveLayerBlendMode('LIGHTERCOLOR')).toBe('LIGHTERCOLOR');
  });

  it('rejects unknown or unsafe tokens', () => {
    expect(resolveLayerBlendMode('NOTAMODE')).toBeNull();
    expect(resolveLayerBlendMode('NORMAL;hack')).toBeNull();
    expect(resolveLayerBlendMode(12)).toBeNull();
  });

  it('covers every schema enum value', () => {
    for (const name of LAYER_BLEND_MODE_ENUM) {
      expect(resolveLayerBlendMode(name)).toBeTruthy();
    }
  });
});
