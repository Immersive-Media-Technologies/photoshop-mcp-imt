/**
 * Deep Artisan: Photoshop UXP bridge (backup transport for ps-mcp, 2026-09-29).
 *
 * The panel polls the local ps-mcp HTTP server (127.0.0.1:38452, only with
 * PS_MCP_UXP=1) and runs commands inside Photoshop through the UXP API:
 *   ping · state · layers · batchplay · eval_js · export_png · save · neural_filter
 * Every document change goes through core.executeAsModal (required by Photoshop ≥ 22.5).
 * Install: dist/uxp/deepartisan-ps-bridge.ccx (double-click → Creative Cloud), or
 * UXP Developer Tools → Add Plugin → uxp-plugin/manifest.json → Load.
 */
const { entrypoints } = require('uxp');
const photoshop = require('photoshop');
const { action, app, core } = photoshop;
const uxpStorage = require('uxp').storage;

const BRIDGE_PORT = 38452;
const BRIDGE_BASE = `http://127.0.0.1:${BRIDGE_PORT}`;

// Panel text in the Photoshop UI language (host.uiLocale, e.g. "ru_RU"); English otherwise.
const STRINGS = {
  en: {
    starting: 'Deep Artisan: starting…',
    hint: 'Backup transport for ps-mcp (UXP). You can close this panel; the bridge keeps running.',
    noToken: 'Deep Artisan: no bridge token yet; ps-mcp has not started the bridge (waiting)',
    tokenRejected: 'Deep Artisan: token rejected, reading it again',
    idle: 'Deep Artisan: connected to ps-mcp, no commands',
    serverDown: 'Deep Artisan: ps-mcp is not running (waiting)',
    error: 'Deep Artisan: error: ',
  },
  ru: {
    starting: 'Deep Artisan: запуск…',
    hint: 'Запасной транспорт ps-mcp (UXP). Панель можно закрыть — мост продолжает работать.',
    noToken: 'Deep Artisan: нет токена моста — ps-mcp с мостом ещё не запускался (ждём)',
    tokenRejected: 'Deep Artisan: токен не принят — перечитываю',
    idle: 'Deep Artisan: связь с ps-mcp есть, команд нет',
    serverDown: 'Deep Artisan: ps-mcp не запущен (ждём)',
    error: 'Deep Artisan: ошибка — ',
  },
};

function hostUiLocale() {
  try {
    return String((require('uxp').host || {}).uiLocale || '');
  } catch (e) {
    return '';
  }
}

function pickLanguage(locale) {
  const lang = String(locale || '').toLowerCase().split(/[-_]/)[0];
  return Object.prototype.hasOwnProperty.call(STRINGS, lang) ? lang : 'en';
}

const LANG = pickLanguage(hostUiLocale());
const T = STRINGS[LANG];

let polling = false;
let status = null;

// Bridge token (09-29): ~/.deepartisan/state/uxp-bridge.token, written by ps-mcp the first
// time it starts the bridge; without it the server answers 401. Read at startup and on 401.
let bridgeToken = '';
let tokenWarned = false;
function tokenPath() {
  const home = (() => { try { return require('os').homedir(); } catch (e) { return ''; } })();
  // Windows: homedir "C:\Users\x" → file:///C:/Users/x (macOS unchanged: file:///Users/x).
  const h = home.replace(/\\/g, '/');
  return `file://${h.startsWith('/') ? '' : '/'}${h}/.deepartisan/state/uxp-bridge.token`;
}
async function loadToken() {
  try {
    const entry = await uxpStorage.localFileSystem.getEntryWithUrl(tokenPath());
    const text = String(await entry.read({ format: uxpStorage.formats.utf8 }) || '').trim();
    if (/^[a-f0-9]{32,}$/i.test(text)) { bridgeToken = text; tokenWarned = false; return true; }
  } catch (e) {
    /* no file yet: the bridge server has not started */
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
    /* panel not shown */
  }
}

function applyStaticText() {
  try {
    if (document.documentElement) document.documentElement.lang = LANG;
    const hint = document.getElementById('hint');
    if (hint) hint.textContent = T.hint;
  } catch {
    /* panel not shown */
  }
  setStatus(T.starting);
}

/**
 * Error text for ps-mcp. Photoshop writes messages in its UI language; the
 * error number is the same in every language, so it travels with the message.
 */
function errorText(error) {
  const message = (error && error.message) || String(error);
  let number = null;
  if (error && typeof error.number === 'number') number = error.number;
  else if (error && typeof error.result === 'number') number = error.result;
  if (number === null || /\(number:\s*-?\d+\)/.test(message)) return message;
  return `${message} (number: ${number})`;
}

async function postResult(payload) {
  await fetch(`${BRIDGE_BASE}/result`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
}

/** Document changes only inside a modal scope (otherwise Photoshop rejects batchPlay). */
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
    /* a group without bounds */
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
    /* no active layer */
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
        // Arbitrary JS in the UXP context (photoshop and uxp are passed as parameters).
        // The body runs inside a modal scope; `return` hands the data back.
        // An async function, so the body can `await` (closeWithoutSaving, saveAs, batchPlay …).
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
    await postResult({ id, ok: false, error: errorText(error) });
  }
}

async function pollOnce() {
  try {
    if (!bridgeToken && !(await loadToken())) {
      if (!tokenWarned) { tokenWarned = true; }
      setStatus(T.noToken);
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }
    const res = await fetch(`${BRIDGE_BASE}/poll`, { headers: headers() });
    if (res.status === 401) {
      // the token changed (a restart wrote a new file): read it again
      bridgeToken = '';
      setStatus(T.tokenRejected);
      return;
    }
    if (res.status === 204) {
      setStatus(T.idle);
      return;
    }
    if (!res.ok) return;
    const cmd = await res.json();
    if (cmd && cmd.id) {
      setStatus(`Deep Artisan: ${cmd.action}`);
      await handleCommand(cmd);
    }
  } catch (e) {
    // the server is not running (ECONNREFUSED) or the manifest blocks the network: the panel shows why
    const msg = (e && e.message) || String(e);
    setStatus(/refused|Failed to fetch|ECONN|network error/i.test(msg) ? T.serverDown : T.error + msg.slice(0, 160));
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
        /* polling continues while the panel is hidden: the bridge lives as long as Photoshop */
      },
    },
  },
});

applyStaticText();
pollLoop();
