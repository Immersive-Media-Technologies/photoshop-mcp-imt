export const EXTENDSCRIPT_UTF8_BOM = '\uFEFF';

/** Prefix UTF-8 BOM once so ExtendScript $.evalFile detects UTF-8 (Adobe docs). */
export function prefixExtendScriptBom(script: string): string {
  return script.startsWith(EXTENDSCRIPT_UTF8_BOM) ? script : EXTENDSCRIPT_UTF8_BOM + script;
}
