import { describe, expect, it } from 'vitest';
import { ExtendScriptSnippets } from '../src/api/extendscript.js';

const MULTI_WORD = 'Photorealistic, highly detailed São Paulo city skyline';
const QUOTED_PROMPT = '"Photorealistic, highly detailed S\\u00e3o Paulo city skyline"';

describe('generative prompt string literals', () => {
  it('wraps generativeFill prompt in a real JS string (issue #31)', () => {
    const jsx = ExtendScriptSnippets.generativeFill(MULTI_WORD);
    expect(jsx).toContain(`desc.putString(sTID('prompt'), ${QUOTED_PROMPT})`);
    expect(jsx).not.toMatch(/putString\(sTID\('prompt'\), Photorealistic/);
  });

  it('escapes caller-supplied quotes instead of treating them as delimiters', () => {
    const jsx = ExtendScriptSnippets.generativeFill('say "hi"');
    expect(jsx).toContain(`desc.putString(sTID('prompt'), "say \\"hi\\"")`);
  });

  it('wraps generativeExpand prompt, direction and amount (canvas enlargement + syntheticFill out_painting)', () => {
    const jsx = ExtendScriptSnippets.generativeExpand('all', MULTI_WORD, 120);
    expect(jsx).toContain(`__mcp_syntheticFill(doc, ${QUOTED_PROMPT}, flows[f])`);
    expect(jsx).toContain(`var dirName = "all";`);
    expect(jsx).toContain('var amount = 120 > 0 ? 120 :');
    expect(jsx).toContain("flows = ['out_painting', 'in_painting']");
    expect(jsx).toContain('doc.resizeCanvas(');
    // no amount → 25 % of the longer side
    expect(ExtendScriptSnippets.generativeExpand('right', 'x')).toContain('var amount = 0 > 0 ? 0 : Math.round(Math.max(w0, h0) * 0.25)');
  });

  it('generativeFill goes through syntheticFill first, the old events only as a fallback', () => {
    const jsx = ExtendScriptSnippets.generativeFill(MULTI_WORD);
    expect(jsx).toContain(`__mcp_syntheticFill(doc, ${QUOTED_PROMPT}, 'in_painting')`);
    expect(jsx.indexOf('__mcp_syntheticFill(doc,')).toBeLessThan(jsx.indexOf("['generativeFill', 'generativeLayerFill', 'firefly']"));
  });

  it('the generative wait compares history length and layer count, not HistoryState.index', () => {
    const jsx = ExtendScriptSnippets.generativeFill('x');
    expect(jsx).toContain('var baselineHist = __mcp_genBaseline(doc);');
    expect(jsx).not.toContain('doc.activeHistoryState.index');
    expect(jsx).toContain('hist > b.hist || (b.layers && layers > b.layers)');
  });

  it('wraps generateImage prompt', () => {
    const jsx = ExtendScriptSnippets.generateImage(MULTI_WORD, 1024, 1024);
    expect(jsx).toContain(`__mcp_syntheticFill(doc, ${QUOTED_PROMPT}, 'text_to_image')`);
  });

  it('wraps skyReplacement path for File()', () => {
    const jsx = ExtendScriptSnippets.skyReplacement('C:\\Skies\\blue sky.psd');
    expect(jsx).toContain('var skyFile = new File("C:\\\\Skies\\\\blue sky.psd")');
  });
});
