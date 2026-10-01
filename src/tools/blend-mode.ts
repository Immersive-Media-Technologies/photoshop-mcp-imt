/**
 * MCP blend-mode names (Photoshop UI) → ExtendScript BlendMode enum members.
 *
 * `COLOR` is the UI name; the DOM enum is `BlendMode.COLORBLEND`.
 * @see https://theiviaxx.github.io/photoshop-docs/Photoshop/BlendMode/COLORBLEND.html
 */

export const LAYER_BLEND_MODE_ENUM = [
  'NORMAL',
  'DISSOLVE',
  'DARKEN',
  'MULTIPLY',
  'COLORBURN',
  'LINEARBURN',
  'DARKERCOLOR',
  'LIGHTEN',
  'SCREEN',
  'COLORDODGE',
  'LINEARDODGE',
  'LIGHTERCOLOR',
  'OVERLAY',
  'SOFTLIGHT',
  'HARDLIGHT',
  'VIVIDLIGHT',
  'LINEARLIGHT',
  'PINLIGHT',
  'HARDMIX',
  'DIFFERENCE',
  'EXCLUSION',
  'SUBTRACT',
  'DIVIDE',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
] as const;

export type LayerBlendMode = (typeof LAYER_BLEND_MODE_ENUM)[number];

/** UI / schema token → ExtendScript `BlendMode.*` identifier (or AM fallback token). */
const TO_EXTENDSCRIPT: Record<string, string> = {
  NORMAL: 'NORMAL',
  DISSOLVE: 'DISSOLVE',
  DARKEN: 'DARKEN',
  MULTIPLY: 'MULTIPLY',
  COLORBURN: 'COLORBURN',
  LINEARBURN: 'LINEARBURN',
  DARKERCOLOR: 'DARKERCOLOR',
  LIGHTEN: 'LIGHTEN',
  SCREEN: 'SCREEN',
  COLORDODGE: 'COLORDODGE',
  LINEARDODGE: 'LINEARDODGE',
  LIGHTERCOLOR: 'LIGHTERCOLOR',
  OVERLAY: 'OVERLAY',
  SOFTLIGHT: 'SOFTLIGHT',
  HARDLIGHT: 'HARDLIGHT',
  VIVIDLIGHT: 'VIVIDLIGHT',
  LINEARLIGHT: 'LINEARLIGHT',
  PINLIGHT: 'PINLIGHT',
  HARDMIX: 'HARDMIX',
  DIFFERENCE: 'DIFFERENCE',
  EXCLUSION: 'EXCLUSION',
  SUBTRACT: 'SUBTRACT',
  DIVIDE: 'DIVIDE',
  HUE: 'HUE',
  SATURATION: 'SATURATION',
  COLOR: 'COLORBLEND',
  COLORBLEND: 'COLORBLEND',
  LUMINOSITY: 'LUMINOSITY',
  PASSTHROUGH: 'PASSTHROUGH',
};

/**
 * Resolve a caller blend-mode token to a safe ExtendScript identifier.
 * Returns null for unknown or non-alphabetic values (never interpolate those).
 */
export function resolveLayerBlendMode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(key)) return null;
  return TO_EXTENDSCRIPT[key] ?? null;
}
