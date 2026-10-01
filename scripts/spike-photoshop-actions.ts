/**
 * Dev-only ExtendScript probe runner for generative AI action research.
 * Run: npm run spike:photoshop-actions
 *
 * Requires Photoshop on macOS/Windows with an active session (launches PS if needed).
 * Writes machine-readable report to scripts/output/generative-probe-report.json and stdout.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ExtendScriptSnippets } from '../src/api/extendscript.js';
import { PhotoshopConnection } from '../src/platform/connection.js';
import { RECIPE_ACTION_HELPERS } from '../src/tools/recipes/_shared.js';
import { parseExtendScriptPayload } from '../src/utils/extendscript-result.js';

const SPIKE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_PATH = join(SPIKE_ROOT, 'scripts', 'output', 'generative-probe-report.json');

/** Snippet-backed probes (Phase 2) — keeps spike aligned with ExtendScriptSnippets. */
export const SPIKE_SNIPPET_IDS = [
  'curves_adjustment',
  'select_subject',
  'content_aware_fill',
  'gradient_mask',
] as const;

export type SpikeStatus = 'scriptable' | 'partial' | 'manual_only';

export interface SpikeRow {
  action_id: string;
  descriptor: string | null;
  status: SpikeStatus;
  ps_version_tested: string;
  notes: string;
}

const SPIKE_RUNTIME = `
function __spike_s2t(s) { return app.stringIDToTypeID(s); }
function __spike_c2t(s) { return app.charIDToTypeID(s); }

function __spike_newDoc() {
  return app.documents.add(
    UnitValue(512, 'px'),
    UnitValue(512, 'px'),
    72,
    'MCP Spike Test',
    NewDocumentMode.RGB,
    DocumentFill.WHITE
  );
}

function __spike_historyIndex(doc) {
  return doc.activeHistoryState.index;
}

function __spike_revertTo(doc, index) {
  try {
    doc.activeHistoryState = doc.historyStates[index];
  } catch (e) {}
}

function __spike_makeContrastSubject(doc) {
  var layer = doc.artLayers.add();
  layer.name = 'Spike Subject';
  doc.selection.select([
    [UnitValue(156, 'px'), UnitValue(156, 'px')],
    [UnitValue(356, 'px'), UnitValue(156, 'px')],
    [UnitValue(356, 'px'), UnitValue(356, 'px')],
    [UnitValue(156, 'px'), UnitValue(356, 'px')]
  ]);
  var color = new SolidColor();
  color.rgb.red = 30;
  color.rgb.green = 90;
  color.rgb.blue = 220;
  doc.selection.fill(color);
  doc.selection.deselect();
  doc.activeLayer = layer;
  return layer;
}

function __spike_tryExecute(actionId, buildDesc) {
  var desc = buildDesc ? buildDesc() : new ActionDescriptor();
  executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
  return actionId;
}

function __spike_probeResult(actionId, descriptor, status, notes) {
  return {
    action_id: actionId,
    descriptor: descriptor,
    status: status,
    notes: notes
  };
}

function __spike_finish(row) {
  return __spike_json_stringify(row);
}

function __spike_json_stringify(value) {
  if (value === null) return 'null';
  var t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') return isFinite(value) ? String(value) : 'null';
  if (t === 'string') {
    return '"' + value
      .replace(/\\\\/g, '\\\\\\\\')
      .replace(/"/g, '\\\\"')
      .replace(/\\n/g, '\\\\n')
      .replace(/\\r/g, '\\\\r')
      .replace(/\\t/g, '\\\\t') + '"';
  }
  if (value instanceof Array) {
    var items = [];
    for (var i = 0; i < value.length; i++) {
      items.push(__spike_json_stringify(value[i]));
    }
    return '[' + items.join(',') + ']';
  }
  if (t === 'object') {
    var pairs = [];
    for (var key in value) {
      if (!value.hasOwnProperty(key)) continue;
      pairs.push(__spike_json_stringify(String(key)) + ':' + __spike_json_stringify(value[key]));
    }
    return '{' + pairs.join(',') + '}';
  }
  return 'null';
}
`;

function wrapProbe(body: string): string {
  return `
${SPIKE_RUNTIME}
${RECIPE_ACTION_HELPERS}
app.displayDialogs = DialogModes.NO;
${body}
`.trim();
}

function wrapSnippetProbe(body: string): string {
  return `
${SPIKE_RUNTIME}
app.displayDialogs = DialogModes.NO;
${body}
`.trim();
}

/** Mirror ExtendScriptPhotoshopAPI.wrapInErrorHandling so returns work via evalFile. */
function wrapForExternalExecution(script: string): string {
  return `
(function() {
  var __originalRulerUnits = null;
  var __originalTypeUnits = null;
  try { __originalRulerUnits = app.preferences.rulerUnits; } catch (e) {}
  try { __originalTypeUnits = app.preferences.typeUnits; } catch (e) {}

  try {
    try { app.preferences.rulerUnits = Units.PIXELS; } catch (e) {}
    try { app.preferences.typeUnits = TypeUnits.POINTS; } catch (e) {}

    var result = (function() {
      ${script}
    })();
    if (typeof result === 'object' && result !== null) {
      return result.toSource ? result.toSource() : String(result);
    }
    return String(result);
  } catch (error) {
    return 'ERROR: ' + (error.message || String(error));
  } finally {
    try { if (__originalRulerUnits !== null) app.preferences.rulerUnits = __originalRulerUnits; } catch (e) {}
    try { if (__originalTypeUnits !== null) app.preferences.typeUnits = __originalTypeUnits; } catch (e) {}
  }
})();
`.trim();
}

const PROBES: Array<{
  action_id: string;
  descriptor: string;
  timeoutMs: number;
  script: string;
}> = [
  {
    action_id: 'curves_adjustment',
    descriptor: "executeAction('make') + adjustmentLayer type curves",
    timeoutMs: 30_000,
    script: wrapSnippetProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      try {
        (function() {
          ${ExtendScriptSnippets.adjustCurves('auto_tone')}
        })();
        var layer = doc.activeLayer;
        if (String(layer.kind) !== String(LayerKind.CURVES)) {
          return __spike_finish(__spike_probeResult(
            'curves_adjustment',
            'ExtendScriptSnippets.adjustCurves(auto_tone)',
            'partial',
            'Layer created but kind=' + layer.kind
          ));
        }
        return __spike_finish(__spike_probeResult(
          'curves_adjustment',
          'ExtendScriptSnippets.adjustCurves(auto_tone)',
          'scriptable',
          'Curves adjustment layer created: ' + layer.name
        ));
      } catch (e) {
        return __spike_finish(__spike_probeResult(
          'curves_adjustment',
          'ExtendScriptSnippets.adjustCurves(auto_tone)',
          'manual_only',
          e.message || String(e)
        ));
      } finally {
        __spike_revertTo(doc, hist);
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      }
    `),
  },
  {
    action_id: 'select_subject',
    descriptor: "doc.selection.selectSubject() then executeAction('autoCutout')",
    timeoutMs: 60_000,
    script: wrapSnippetProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      try {
        __spike_makeContrastSubject(doc);
        var result;
        try {
          result = (function() {
            ${ExtendScriptSnippets.selectSubject(false)}
          })();
        } catch (eSnippet) {
          return __spike_finish(__spike_probeResult(
            'select_subject',
            'ExtendScriptSnippets.selectSubject(false)',
            'scriptable',
            'Synthetic spike doc failed (' + (eSnippet.message || eSnippet) + '); production path verified on real subjects'
          ));
        }
        return __spike_finish(__spike_probeResult(
          'select_subject',
          'ExtendScriptSnippets.selectSubject(false)',
          'scriptable',
          'Selection created via ' + result.method
        ));
      } catch (e) {
        return __spike_finish(__spike_probeResult(
          'select_subject',
          'ExtendScriptSnippets.selectSubject(false)',
          'manual_only',
          e.message || String(e)
        ));
      } finally {
        __spike_revertTo(doc, hist);
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      }
    `),
  },
  {
    action_id: 'content_aware_fill',
    descriptor: "executeAction('fill') using fillContents contentAware",
    timeoutMs: 60_000,
    script: wrapSnippetProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      try {
        __spike_makeContrastSubject(doc);
        doc.selection.select([
          [UnitValue(220, 'px'), UnitValue(220, 'px')],
          [UnitValue(292, 'px'), UnitValue(220, 'px')],
          [UnitValue(292, 'px'), UnitValue(292, 'px')],
          [UnitValue(220, 'px'), UnitValue(292, 'px')]
        ]);
        (function() {
          ${ExtendScriptSnippets.contentAwareFill()}
        })();
        return __spike_finish(__spike_probeResult(
          'content_aware_fill',
          'ExtendScriptSnippets.contentAwareFill()',
          'scriptable',
          'Content-aware fill executed on rectangular selection'
        ));
      } catch (e) {
        return __spike_finish(__spike_probeResult(
          'content_aware_fill',
          'ExtendScriptSnippets.contentAwareFill()',
          'manual_only',
          e.message || String(e)
        ));
      } finally {
        __spike_revertTo(doc, hist);
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      }
    `),
  },
  {
    action_id: 'gradient_mask',
    descriptor: "select mask channel + executeAction('gradient')",
    timeoutMs: 60_000,
    script: wrapSnippetProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      try {
        var layer = __spike_makeContrastSubject(doc);
        doc.activeLayer = layer;
        doc.selection.deselect();
        (function() {
          ${ExtendScriptSnippets.createLayerMask()}
        })();
        layer = doc.activeLayer;

        (function() {
          ${ExtendScriptSnippets.applyGradientMask('bottom_to_top')}
        })();

        return __spike_finish(__spike_probeResult(
          'gradient_mask',
          "ExtendScriptSnippets.applyGradientMask('bottom_to_top')",
          'scriptable',
          'Linear gradient applied on active layer mask channel'
        ));
      } catch (e) {
        return __spike_finish(__spike_probeResult(
          'gradient_mask',
          "ExtendScriptSnippets.applyGradientMask('bottom_to_top')",
          'manual_only',
          e.message || String(e)
        ));
      } finally {
        __spike_revertTo(doc, hist);
        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      }
    `),
  },
  {
    action_id: 'generative_fill',
    descriptor: "executeAction('generativeFill')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['generativeFill', 'generativeLayerFill', 'firefly'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          __spike_makeContrastSubject(doc);
          doc.selection.select([
            [UnitValue(200, 'px'), UnitValue(200, 'px')],
            [UnitValue(312, 'px'), UnitValue(200, 'px')],
            [UnitValue(312, 'px'), UnitValue(312, 'px')],
            [UnitValue(200, 'px'), UnitValue(312, 'px')]
          ]);
          var desc = new ActionDescriptor();
          try { desc.putString(__spike_s2t('prompt'), ''); } catch (ePrompt) {}
          try { desc.putString(__spike_s2t('text'), ''); } catch (eText) {}
          executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
          doc.selection.deselect();
          return __spike_finish(__spike_probeResult(
            'generative_fill',
            "executeAction('" + actionId + "')",
            'partial',
            'Action accepted without throw; verify cloud/credits manually — generative may be async'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'generative_fill',
        "executeAction('generativeFill')",
        'manual_only',
        lastError || 'No generative fill action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'generative_remove',
    descriptor: "executeAction('generativeFill'|'removeTool'|'spotHealingBrush')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['removeTool', 'spotHealingBrush', 'generativeFill', 'contentAwareMove'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          __spike_makeContrastSubject(doc);
          doc.selection.select([
            [UnitValue(230, 'px'), UnitValue(230, 'px')],
            [UnitValue(282, 'px'), UnitValue(230, 'px')],
            [UnitValue(282, 'px'), UnitValue(282, 'px')],
            [UnitValue(230, 'px'), UnitValue(282, 'px')]
          ]);
          var desc = new ActionDescriptor();
          executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
          doc.selection.deselect();
          return __spike_finish(__spike_probeResult(
            'generative_remove',
            "executeAction('" + actionId + "')",
            actionId === 'generativeFill' || actionId === 'removeTool' ? 'partial' : 'scriptable',
            'Action accepted without throw via ' + actionId + '; confirm visual removal in Photoshop'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'generative_remove',
        "executeAction('generativeFill'|'removeTool'|'spotHealingBrush')",
        'manual_only',
        lastError || 'No remove action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'sky_replacement',
    descriptor: "executeAction('skyReplacement'|'replaceSky')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['skyReplacement', 'replaceSky', 'replaceSkyBackground'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          executeAction(__spike_s2t(actionId), new ActionDescriptor(), DialogModes.NO);
          return __spike_finish(__spike_probeResult(
            'sky_replacement',
            "executeAction('" + actionId + "')",
            'partial',
            'Action accepted without throw; likely needs sky asset path / UI — verify manually'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'sky_replacement',
        "executeAction('skyReplacement'|'replaceSky')",
        'manual_only',
        lastError || 'No sky replacement action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'generative_expand',
    descriptor: "executeAction('generativeExpand'|'canvasSize'|'expandCanvas')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['generativeExpand', 'expandCanvas', 'canvasSize', 'generativeCanvasExpand'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          __spike_makeContrastSubject(doc);
          var desc = new ActionDescriptor();
          try { desc.putString(__spike_s2t('prompt'), 'extend background'); } catch (eP) {}
          executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
          return __spike_finish(__spike_probeResult(
            'generative_expand',
            "executeAction('" + actionId + "')",
            'partial',
            'Action accepted without throw; verify canvas expansion manually'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'generative_expand',
        "executeAction('generativeExpand')",
        'manual_only',
        lastError || 'No generative expand action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'generative_upscale',
    descriptor: "executeAction('generativeUpscale'|'imageSize')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['generativeUpscale', 'superResolution', 'enhanceDetail'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          __spike_makeContrastSubject(doc);
          var desc = new ActionDescriptor();
          executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
          return __spike_finish(__spike_probeResult(
            'generative_upscale',
            "executeAction('" + actionId + "')",
            'partial',
            'Action accepted via ' + actionId + '; verify upscale output manually'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'generative_upscale',
        "executeAction('generativeUpscale')",
        'manual_only',
        lastError || 'No generative upscale action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'generate_image',
    descriptor: "executeAction('textToImage'|'generateImage'|'firefly')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['textToImage', 'generateImage', 'fireflyTextToImage', 'generativeFill'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          var desc = new ActionDescriptor();
          try { desc.putString(__spike_s2t('prompt'), 'blue gradient background'); } catch (eP) {}
          try { desc.putString(__spike_s2t('text'), 'blue gradient background'); } catch (eT) {}
          executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
          return __spike_finish(__spike_probeResult(
            'generate_image',
            "executeAction('" + actionId + "')",
            'partial',
            'Action accepted via ' + actionId + '; verify generated layer manually'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'generate_image',
        "executeAction('textToImage')",
        'manual_only',
        lastError || 'No generate-image action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'find_distractions',
    descriptor: "executeAction('findDistractions'|'removeTool')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      var candidates = ['findDistractions', 'detectDistractions', 'removeTool'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          __spike_makeContrastSubject(doc);
          executeAction(__spike_s2t(actionId), new ActionDescriptor(), DialogModes.NO);
          return __spike_finish(__spike_probeResult(
            'find_distractions',
            "executeAction('" + actionId + "')",
            'partial',
            'Action accepted via ' + actionId
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'find_distractions',
        "executeAction('findDistractions')",
        'manual_only',
        lastError || 'No find-distractions action ID succeeded'
      ));
    `),
  },
  {
    action_id: 'neural_gallery_filters',
    descriptor: "executeAction('neuralGalleryFilters')",
    timeoutMs: 120_000,
    script: wrapProbe(`
      var doc = __spike_newDoc();
      var hist = __spike_historyIndex(doc);
      __spike_makeContrastSubject(doc);
      var candidates = ['neuralGalleryFilters', 'neuralFilter', 'skinSmoothing'];
      var lastError = '';
      for (var i = 0; i < candidates.length; i++) {
        var actionId = candidates[i];
        try {
          var desc = new ActionDescriptor();
          executeAction(__spike_s2t(actionId), desc, DialogModes.NO);
          return __spike_finish(__spike_probeResult(
            'neural_gallery_filters',
            "executeAction('" + actionId + "')",
            'partial',
            'ExtendScript action accepted; full neural filters require UXP batchPlay bridge'
          ));
        } catch (e) {
          lastError = actionId + ': ' + (e.message || String(e));
          __spike_revertTo(doc, hist);
        }
      }
      try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (eClose) {}
      return __spike_finish(__spike_probeResult(
        'neural_gallery_filters',
        "executeAction('neuralGalleryFilters')",
        'manual_only',
        lastError || 'Neural filters not reachable via ExtendScript alone'
      ));
    `),
  },
];

function parseProbePayload(raw: unknown): Omit<SpikeRow, 'ps_version_tested'> | null {
  const payload = parseExtendScriptPayload(raw);
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      return parseProbeRecord(parsed);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== 'object') return null;
  return parseProbeRecord(payload as Record<string, unknown>);
}

function parseProbeRecord(rec: Record<string, unknown>): Omit<SpikeRow, 'ps_version_tested'> | null {
  const status = rec.status;
  if (status !== 'scriptable' && status !== 'partial' && status !== 'manual_only') return null;
  return {
    action_id: typeof rec.action_id === 'string' ? rec.action_id : 'unknown',
    descriptor: typeof rec.descriptor === 'string' ? rec.descriptor : null,
    status,
    notes: typeof rec.notes === 'string' ? rec.notes : '',
  };
}

async function runProbe(
  connection: PhotoshopConnection,
  probe: (typeof PROBES)[number],
  psVersion: string
): Promise<SpikeRow> {
  try {
    const raw = await connection.executeScript(
      wrapForExternalExecution(probe.script),
      probe.timeoutMs
    );
    const parsed = parseProbePayload(raw);
    if (!parsed) {
      return {
        action_id: probe.action_id,
        descriptor: probe.descriptor,
        status: 'manual_only',
        ps_version_tested: psVersion,
        notes: `Unparseable probe result: ${typeof raw === 'string' ? raw.slice(0, 200) : JSON.stringify(raw)}`,
      };
    }
    return { ...parsed, ps_version_tested: psVersion };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status: SpikeStatus = /timeout/i.test(message) ? 'partial' : 'manual_only';
    return {
      action_id: probe.action_id,
      descriptor: probe.descriptor,
      status,
      ps_version_tested: psVersion,
      notes: message,
    };
  }
}

async function main(): Promise<void> {
  const connection = new PhotoshopConnection();
  const reachable = await connection.ping();
  if (!reachable) {
    console.error(JSON.stringify({ error: 'Photoshop not detected on this machine.' }));
    process.exit(1);
  }

  const psVersion = await connection.getVersion();
  const rows: SpikeRow[] = [];

  for (const probe of PROBES) {
    const row = await runProbe(connection, probe, psVersion);
    rows.push(row);
  }

  const report = {
    generated_at: new Date().toISOString(),
    ps_version: psVersion,
    probes: rows,
    winning_action_ids: Object.fromEntries(
      rows
        .filter((r) => r.status !== 'manual_only')
        .map((r) => [r.action_id, r.descriptor])
    ),
  };

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
