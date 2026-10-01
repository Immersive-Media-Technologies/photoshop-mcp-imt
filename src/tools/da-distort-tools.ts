// Deep Artisan (20.09.2026): корнер-пин / перспективное искажение слоя headless.
//
// Живой факт (Photoshop 2026, 27.9): `Trnf` с ключом `quadrilateral` (классический
// ScriptListener-рецепт Free Transform → Distort) молча игнорируется — проверено
// 12 комбинаций (pixel/smart × abs/rel/center × Qcsa/Qcs0), границы слоя не меняются
// (scripts/probe/quad-matrix.jsx). А `Trnf` + `warp: warpCustom` с сеткой 4×4
// (customEnvelopeWarp/meshPoints) исполняется без диалога и реально искажает слой
// (scripts/probe/warp-probe.jsx). Поэтому корнер-пин строится как custom warp:
// 16 контрольных точек бикубической Безье-поверхности подбираются так, чтобы
// поверхность ИНТЕРПОЛИРОВАЛА гомографию (unit square → целевой четырёхугольник)
// в 16 узлах (u,v ∈ {0,⅓,⅔,1}): P = B⁻¹ · S · B⁻ᵀ, B — матрица Бернштейна в узлах.
// Режим `bilinear` — контрольные точки прямо по билинейной сетке (прямые остаются
// прямыми, интерьер без схождения перспективы).
//
// Модальные Perspective Warp / Vanishing Point через скрипт не запускаются в принципе
// (UI-инструменты); эта операция покрывает их геометрию для одной плоскости; две
// фасады = два слоя × две операции.
//
// ⚠️ Smart Object: тот же warp на смарт-объекте даёт ДРУГУЮ геометрию (проба 20.09:
// сжатие правого края 600→520 — границы 520, но точки (505,235)/(505,365)/(515,300)
// пустые; identity-сетка — без изменений). Точная форма гарантирована только на
// пиксельном слое, поэтому смарт-объект без `rasterize:true` — ошибка, не тихая порча.
import { ToolDefinition, ToolResult } from '../core/tool-registry.js';
import { PhotoshopConnection } from '../platform/connection.js';
import { PhotoshopAPIFactory } from '../api/photoshop-api.js';

type Pt = [number, number];

/** Гомография unit square (0,0)-(1,1) → четырёхугольник TL,TR,BR,BL (8 неизвестных). */
export function homographyFromUnitSquare(tl: Pt, tr: Pt, br: Pt, bl: Pt): number[] {
  const src: Pt[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const dst: Pt[] = [tl, tr, br, bl];
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i];
    const [X, Y] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -X * x, -X * y]); b.push(X);
    A.push([0, 0, 0, x, y, 1, -Y * x, -Y * y]); b.push(Y);
  }
  // Gaussian elimination with partial pivoting
  const n = 8;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
    const d = A[c][c];
    if (Math.abs(d) < 1e-12) throw new Error('degenerate quadrilateral');
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
      b[r] -= f * b[c];
    }
  }
  const h = b.map((v, i) => v / A[i][i]);
  return [...h, 1];
}

export function applyHomography(h: number[], u: number, v: number): Pt {
  const w = h[6] * u + h[7] * v + h[8];
  return [(h[0] * u + h[1] * v + h[2]) / w, (h[3] * u + h[4] * v + h[5]) / w];
}

// B⁻¹ для узлов t = 0, ⅓, ⅔, 1 (кубический Бернштейн)
const BINV = [
  [1, 0, 0, 0],
  [-5 / 6, 3, -3 / 2, 1 / 3],
  [1 / 3, -3 / 2, 3, -5 / 6],
  [0, 0, 0, 1],
];

/**
 * 16 контрольных точек (row-major: строки v сверху вниз, столбцы u слева направо)
 * бикубической Безье-поверхности, интерполирующей отображение f в узлах {0,⅓,⅔,1}².
 */
export function bezierControlPoints(f: (u: number, v: number) => Pt): Pt[] {
  const ts = [0, 1 / 3, 2 / 3, 1];
  // S[i][j] = f(u_j, v_i)
  const S: Pt[][] = ts.map((v) => ts.map((u) => f(u, v)));
  // P = Binv · S · Binvᵀ  (по каждой координате)
  const P: Pt[][] = [];
  for (let i = 0; i < 4; i++) {
    P.push([]);
    for (let j = 0; j < 4; j++) {
      let x = 0, y = 0;
      for (let a = 0; a < 4; a++) for (let c = 0; c < 4; c++) {
        const w = BINV[i][a] * BINV[j][c];
        if (!w) continue;
        x += w * S[a][c][0];
        y += w * S[a][c][1];
      }
      P[i].push([x, y]);
    }
  }
  return P.flat();
}

export function meshForQuad(tl: Pt, tr: Pt, br: Pt, bl: Pt, mode: 'perspective' | 'bilinear'): Pt[] {
  if (mode === 'bilinear') {
    const f = (u: number, v: number): Pt => {
      const l = (a: number, b: number, t: number): number => a + (b - a) * t;
      return [l(l(tl[0], tr[0], u), l(bl[0], br[0], u), v), l(l(tl[1], tr[1], u), l(bl[1], br[1], u), v)];
    };
    const ts = [0, 1 / 3, 2 / 3, 1];
    return ts.flatMap((v) => ts.map((u) => f(u, v)));
  }
  const h = homographyFromUnitSquare(tl, tr, br, bl);
  return bezierControlPoints((u, v) => applyHomography(h, u, v));
}

function num(v: unknown, name: string): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`invalid ${name}`);
  return n;
}

function parseCorners(args: Record<string, unknown>): { tl: Pt; tr: Pt; br: Pt; bl: Pt } {
  const c = args.corners as unknown;
  if (Array.isArray(c) && c.length === 8) {
    const a = c.map((v, i) => num(v, `corners[${i}]`));
    return { tl: [a[0], a[1]], tr: [a[2], a[3]], br: [a[4], a[5]], bl: [a[6], a[7]] };
  }
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    const pt = (k: string): Pt => {
      const p = o[k];
      if (!Array.isArray(p) || p.length !== 2) throw new Error(`corners.${k} must be [x, y]`);
      return [num(p[0], `${k}.x`), num(p[1], `${k}.y`)];
    };
    return { tl: pt('tl'), tr: pt('tr'), br: pt('br'), bl: pt('bl') };
  }
  throw new Error('corners: {tl:[x,y], tr:[x,y], br:[x,y], bl:[x,y]} or [x1,y1,…,x4,y4] (absolute document pixels, clockwise from top-left)');
}

export function distortLayerScript(
  mesh: Pt[],
  layerName: string | null,
  rasterize: boolean,
  interpolation: string,
): string {
  const interp = { nearest: 'Nrst', bilinear: 'Blnr', bicubic: 'Bcbc', bicubicSmoother: 'bicubicSmoother', bicubicSharper: 'bicubicSharper' }[interpolation] ?? 'Bcbc';
  const interpExpr = interp.length === 4 ? `charIDToTypeID("${interp}")` : `stringIDToTypeID("${interp}")`;
  const meshLit = JSON.stringify(mesh.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]));
  const nameLit = layerName === null ? 'null' : JSON.stringify(layerName);
  return `
    if (app.documents.length === 0) throw new Error('No active document');
    var doc = app.activeDocument;
    var name = ${nameLit};
    var layer = doc.activeLayer;
    if (name !== null) {
      function findLayer(set) {
        for (var i = 0; i < set.layers.length; i++) {
          var l = set.layers[i];
          if (l.name === name) return l;
          if (l.typename === 'LayerSet') { var f = findLayer(l); if (f) return f; }
        }
        return null;
      }
      layer = findLayer(doc);
      if (!layer) throw new Error('layer not found: ' + name);
      doc.activeLayer = layer;
    }
    if (layer.typename === 'LayerSet') throw new Error('distort_layer works on a single layer, not a group: ' + layer.name);
    if (layer.isBackgroundLayer) throw new Error('Cannot transform background layer');
    function sID(s) { return stringIDToTypeID(s); }
    function cID(s) { return charIDToTypeID(s); }
    var rasterized = false;
    if (layer.kind === LayerKind.SMARTOBJECT) {
      if (!${rasterize ? 'true' : 'false'}) throw new Error('layer "' + layer.name + '" is a Smart Object: the warp mesh is not exact on Smart Objects in this Photoshop version. Duplicate the layer if you need the original, then call distort_layer with rasterize:true (destructive).');
      layer.rasterize(RasterizeType.ENTIRELAYER);
      rasterized = true;
    }
    var b = layer.bounds;
    var x0 = b[0].as('px'), y0 = b[1].as('px'), x1 = b[2].as('px'), y1 = b[3].as('px');
    var mesh = ${meshLit};
    var list = new ActionList();
    for (var i = 0; i < 16; i++) {
      var p = new ActionDescriptor();
      p.putUnitDouble(sID('horizontal'), cID('#Pxl'), mesh[i][0]);
      p.putUnitDouble(sID('vertical'), cID('#Pxl'), mesh[i][1]);
      list.putObject(sID('rationalPoint'), p);
    }
    var desc = new ActionDescriptor();
    var ref = new ActionReference();
    ref.putEnumerated(cID('Lyr '), cID('Ordn'), cID('Trgt'));
    desc.putReference(cID('null'), ref);
    desc.putEnumerated(cID('FTcs'), cID('QCSt'), cID('Qcsa'));
    var ofs = new ActionDescriptor();
    ofs.putUnitDouble(cID('Hrzn'), cID('#Pxl'), 0);
    ofs.putUnitDouble(cID('Vrtc'), cID('#Pxl'), 0);
    desc.putObject(cID('Ofst'), cID('Ofst'), ofs);
    var warp = new ActionDescriptor();
    warp.putEnumerated(sID('warpStyle'), sID('warpStyle'), sID('warpCustom'));
    warp.putDouble(sID('warpValue'), 0);
    warp.putDouble(sID('warpPerspective'), 0);
    warp.putDouble(sID('warpPerspectiveOther'), 0);
    warp.putEnumerated(sID('warpRotate'), sID('orientation'), sID('horizontal'));
    var bnd = new ActionDescriptor();
    bnd.putUnitDouble(sID('top'), cID('#Pxl'), y0);
    bnd.putUnitDouble(sID('left'), cID('#Pxl'), x0);
    bnd.putUnitDouble(sID('bottom'), cID('#Pxl'), y1);
    bnd.putUnitDouble(sID('right'), cID('#Pxl'), x1);
    warp.putObject(sID('bounds'), sID('classFloatRect'), bnd);
    warp.putInteger(sID('uOrder'), 4);
    warp.putInteger(sID('vOrder'), 4);
    var env = new ActionDescriptor();
    env.putList(sID('meshPoints'), list);
    warp.putObject(sID('customEnvelopeWarp'), sID('customEnvelopeWarp'), env);
    desc.putObject(sID('warp'), sID('warp'), warp);
    desc.putEnumerated(cID('Intr'), cID('Intp'), ${interpExpr});
    executeAction(cID('Trnf'), desc, DialogModes.NO);
    var a = layer.bounds;
    return {
      distorted: true,
      layer: layer.name,
      rasterized: rasterized,
      boundsBefore: [x0, y0, x1, y1],
      boundsAfter: [a[0].as('px'), a[1].as('px'), a[2].as('px'), a[3].as('px')]
    };
  `;
}

export function createDaDistortTools(connection: PhotoshopConnection): ToolDefinition[] {
  return [
    {
      tool: {
        name: 'photoshop_distort_layer',
        description:
          'Corner-pin / perspective distort of a layer: map its bounding box to four target corners (absolute document pixels, clockwise from top-left). ' +
          'Headless replacement for Free Transform → Distort / Perspective Warp (which are modal and cannot be scripted). ' +
          'Implemented as a custom warp mesh fitted to the homography — exact on pixel layers; a Smart Object must be rasterized first (rasterize:true, destructive — duplicate it before if the original matters). ' +
          'Read the current bounds with get_layers / get_state, then compute the target corners. Save a copy of the document before (save_document).',
        inputSchema: {
          type: 'object',
          properties: {
            corners: {
              description: 'Target corners in absolute document px: {"tl":[x,y],"tr":[x,y],"br":[x,y],"bl":[x,y]} or a flat array [x1,y1,x2,y2,x3,y3,x4,y4] (tl,tr,br,bl)',
            },
            layer: { type: 'string', description: 'layer name (searched recursively); default — active layer' },
            mode: { type: 'string', enum: ['perspective', 'bilinear'], default: 'perspective', description: 'perspective — true projective mapping (parallel lines converge); bilinear — straight edges, no convergence' },
            rasterize: { type: 'boolean', default: false, description: 'rasterize a Smart Object layer before warping (destructive; required for Smart Objects)' },
            interpolation: { type: 'string', enum: ['bicubic', 'bicubicSmoother', 'bicubicSharper', 'bilinear', 'nearest'], default: 'bicubic' },
          },
          required: ['corners'],
        },
      },
      handler: async (args) => distortLayer(connection, args),
    },
  ];
}

async function distortLayer(connection: PhotoshopConnection, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    const { tl, tr, br, bl } = parseCorners(args);
    const mode = args.mode === 'bilinear' ? 'bilinear' : 'perspective';
    const mesh = meshForQuad(tl, tr, br, bl, mode);
    const layer = typeof args.layer === 'string' && args.layer.trim() ? args.layer.trim() : null;
    const rasterize = args.rasterize === true;
    const interpolation = typeof args.interpolation === 'string' ? args.interpolation : 'bicubic';
    const api = await new PhotoshopAPIFactory(connection).createAPI();
    const result = await api.executeScript(distortLayerScript(mesh, layer, rasterize, interpolation));
    return { content: [{ type: 'text' as const, text: `Layer distorted (${mode})\nResult: ${JSON.stringify(result)}` }] };
  } catch (error) {
    return {
      content: [{ type: 'text' as const, text: `Error distorting layer: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
}
