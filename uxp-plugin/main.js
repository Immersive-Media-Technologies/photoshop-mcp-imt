/**
 * Deep Artisan — UXP-мост Photoshop (запасной транспорт ps-mcp, 29.09.2026).
 *
 * Панель опрашивает локальный HTTP-сервер ps-mcp (127.0.0.1:38452, только при
 * PS_MCP_UXP=1) и исполняет команды внутри Photoshop через UXP API:
 *   ping · state · layers · batchplay · eval_js · export_png · save · neural_filter
 * Все изменения документа идут через core.executeAsModal (требование Photoshop ≥ 22.5).
 * Установка: dist/uxp/deepartisan-ps-bridge.ccx (двойной клик → Creative Cloud) или
 * UXP Developer Tools → Add Plugin → uxp-plugin/manifest.json → Load.
 */
const { entrypoints } = require('uxp');
const photoshop = require('photoshop');
const { action, app, core } = photoshop;
const uxpStorage = require('uxp').storage;

const BRIDGE_PORT = 38452;
const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`;

let polling = false;
let status = null;

// Токен моста (29.09): ~/.deepartisan/state/uxp-bridge.token — пишет ps-mcp при первом
// старте моста; без него сервер отвечает 401. Перечитываем при старте и при 401.
let bridgeToken = '';
let tokenWarned = false;
function tokenPath() {
  const home = (() => { try { return require('os').homedir(); } catch (e) { return ''; } })();
  return `file://${home}/.deepartisan/state/uxp-bridge.token`;
}
async function loadToken() {
  try {
    const entry = await uxpStorage.localFileSystem.getEntryWithUrl(tokenPath());
    const text = String(await entry.read({ format: uxpStorage.formats.utf8 }) || '').trim();
    if (/^[a-f0-9]{32,}$/i.test(text)) { bridgeToken = text; tokenWarned = false; return true; }
  } catch (e) {
    /* файла ещё нет — сервер моста не запускался */
  }
  return false;
}
function headers(extra) {
  return Object.assign({ 'X-DA-Bridge-Token': bridgeToken }, extra || {});
}

function setStatus(text) {
  try {
    if (!status) status = document.getElementById('status');
    if (status) status.textContent = text;
  } catch {
    /* панель не показана */
  }
}

async function postResult(payload) {
  await fetch(`${BRIDGE_BASE}/result`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

/** Изменения документа — только в модальном скоупе (иначе Photoshop отвергает batchPlay). */
function modal(name, fn) {
  return core.executeAsModal(fn, { commandName: name });
}

function neuralDescriptors(filter, params) {
  const smoothness = params.smoothness ?? 50;
  const blur = params.blur ?? 50;
  const kinds = {
    skin_smoothing: { _obj: 'skinSmoothing', smoothness, blur },
    harmonize: { _obj: 'harmonization' },
    depth_blur: { _obj: 'depthBlur' },
    super_zoom: { _obj: 'superZoom' },
    colorize: { _obj: 'colorize' },
  };
  const inner = kinds[filter];
  if (!inner) throw new Error(`Unknown neural filter: ${filter}`);
  return [{ _obj: 'neuralGalleryFilters', neuralGalleryFilters: inner }];
}

function layerInfo(l, depth) {
  const out = {
    id: l.id,
    name: l.name,
    kind: String(l.kind),
    visible: l.visible,
    opacity: l.opacity,
    blendMode: String(l.blendMode),
    locked: l.locked,
    depth,
  };
  try {
    const b = l.bounds;
    if (b) out.bounds = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  } catch {
    /* группа без границ */
  }
  if (l.layers && l.layers.length) out.children = l.layers.map((c) => layerInfo(c, depth + 1));
  return out;
}

function docState() {
  const d = app.activeDocument;
  if (!d) return { hasDocument: false, documents: app.documents.length, version: app.version };
  let active = null;
  try {
    active = d.activeLayers.map((l) => ({ id: l.id, name: l.name }));
  } catch {
    /* нет активного слоя */
  }
  return {
    hasDocument: true,
    version: app.version,
    name: d.name,
    id: d.id,
    path: d.path || null,
    width: d.width,
    height: d.height,
    resolution: d.resolution,
    mode: String(d.mode),
    layers: d.layers.length,
    activeLayers: active,
    saved: d.saved,
    documents: app.documents.length,
  };
}

async function fileEntry(path) {
  const url = path.startsWith('file://') ? path : 'file://' + path;
  return uxpStorage.localFileSystem.createEntryWithUrl(url, { overwrite: true });
}

async function handleCommand(cmd) {
  const { id, action: cmdAction, params = {} } = cmd;
  try {
    let data;
    switch (cmdAction) {
      case 'ping': {
        const host = require('uxp').host || {};
        data = { ok: true, version: app.version || host.version || null, uxp: (require('uxp').versions || {}).uxp || null, documents: app.documents.length };
        break;
      }
      case 'state':
        data = docState();
        break;
      case 'layers': {
        const d = app.activeDocument;
        if (!d) throw new Error('no active document');
        data = { name: d.name, layers: d.layers.map((l) => layerInfo(l, 0)) };
        break;
      }
      case 'batchplay': {
        const descriptors = params.descriptors;
        if (!Array.isArray(descriptors) || descriptors.length === 0) throw new Error('descriptors: non-empty array required');
        const options = Object.assign({ synchronousExecution: true, modalBehavior: 'execute' }, params.options || {});
        data = await modal('Deep Artisan batchPlay', () => action.batchPlay(descriptors, options));
        break;
      }
      case 'eval_js': {
        // Произвольный JS в контексте UXP (photoshop, uxp доступны как параметры).
        // Тело исполняется в модальном скоупе; `return` отдаёт данные.
        // async-функция: в теле можно `await` (closeWithoutSaving, saveAs, batchPlay …)
        const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
        const fn = new AsyncFunction('photoshop', 'uxp', 'params', params.code || '');
        data = await modal('Deep Artisan script', () => fn(photoshop, require('uxp'), params.args || {}));
        break;
      }
      case 'export_png': {
        const d = app.activeDocument;
        if (!d) throw new Error('no active document');
        const entry = await fileEntry(params.path);
        await modal('Deep Artisan export', () => d.saveAs.png(entry, { compression: 6 }, true));
        data = { path: params.path };
        break;
      }
      case 'save': {
        const d = app.activeDocument;
        if (!d) throw new Error('no active document');
        if (params.path) {
          const entry = await fileEntry(params.path);
          await modal('Deep Artisan save', () => d.saveAs.psd(entry, {}, true));
        } else {
          await modal('Deep Artisan save', () => d.save());
        }
        data = { path: params.path || d.path || null };
        break;
      }
      case 'neural_filter': {
        const descriptors = neuralDescriptors(params.filter, params);
        data = await modal('Deep Artisan neural filter', () =>
          action.batchPlay(descriptors, { synchronousExecution: true, modalBehavior: 'execute' }),
        );
        break;
      }
      default:
        await postResult({ id, ok: false, error: `unknown_action:${cmdAction}` });
        return;
    }
    await postResult({ id, ok: true, data });
  } catch (error) {
    await postResult({ id, ok: false, error: (error && error.message) || String(error) });
  }
}

async function pollOnce() {
  try {
    if (!bridgeToken && !(await loadToken())) {
      if (!tokenWarned) { tokenWarned = true; }
      setStatus('Deep Artisan: нет токена моста — ps-mcp с мостом ещё не запускался (ждём)');
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }
    const res = await fetch(`${BRIDGE_BASE}/poll`, { headers: headers() });
    if (res.status === 401) {
      // токен сменился (перезапуск с новым файлом) — перечитать
      bridgeToken = '';
      setStatus('Deep Artisan: токен не принят — перечитываю');
      return;
    }
    if (res.status === 204) {
      setStatus('Deep Artisan: связь с ps-mcp есть, команд нет');
      return;
    }
    if (!res.ok) return;
    const cmd = await res.json();
    if (cmd && cmd.id) {
      setStatus(`Deep Artisan: ${cmd.action}`);
      await handleCommand(cmd);
    }
  } catch (e) {
    // сервер не запущен (ECONNREFUSED) или запрет сети манифеста — причину видно в панели
    const msg = (e && e.message) || String(e);
    setStatus(/refused|Failed to fetch|ECONN|network error/i.test(msg) ? 'Deep Artisan: ps-mcp не запущен (ждём)' : 'Deep Artisan: ошибка — ' + msg.slice(0, 160));
  }
}

async function pollLoop() {
  if (polling) return;
  polling = true;
  while (polling) {
    await pollOnce();
    await new Promise((r) => setTimeout(r, 400));
  }
}

entrypoints.setup({
  panels: {
    bridgePanel: {
      show() {
        pollLoop();
      },
      hide() {
        /* опрос продолжается и при скрытой панели — мост живёт с Photoshop */
      },
    },
  },
});

pollLoop();
