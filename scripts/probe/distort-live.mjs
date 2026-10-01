// Живая проба photoshop_distort_layer без MCP-клиента: временный документ, красный
// прямоугольник 200..600 × 150..450, корнер-пин, сэмплеры цвета — проверка
// ориентации сетки и перспективы. Ничего не сохраняет.
//   node scripts/probe/distort-live.mjs [perspective|bilinear]
import { writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { meshForQuad, distortLayerScript } from '../../dist/tools/da-distort-tools.js';

const mode = process.argv[2] === 'bilinear' ? 'bilinear' : 'perspective';
const Q = process.env.QUAD ? JSON.parse(process.env.QUAD) : [[200,150],[520,220],[520,380],[200,450]];
const [tl, tr, br, bl] = Q;
const mesh = meshForQuad(tl, tr, br, bl, mode);
const body = distortLayerScript(mesh, 'BOX', process.env.RASTERIZE === '1', 'bicubic');
const jsx = `
var out = {};
try {
  var d = app.documents.add(800, 600, 72, "da-distort-live", NewDocumentMode.RGB, DocumentFill.WHITE);
  var L = d.artLayers.add(); L.name = "BOX";
  d.selection.select([[200,150],[600,150],[600,450],[200,450]]);
  var c = new SolidColor(); c.rgb.red = 200; c.rgb.green = 40; c.rgb.blue = 40;
  d.selection.fill(c); d.selection.deselect();
  var r = (function(){ ${body} })();
  out.result = r.toSource();
  function probe(x, y) { var s = d.colorSamplers.add([x, y]); var col = s.color.rgb; var v = [Math.round(col.red), Math.round(col.green), Math.round(col.blue)]; s.remove(); return v.join('/'); }
  // внутри целевого четырёхугольника — красное; снаружи (бывшие углы) — белое
  out.inTL = probe(210, 165); out.inTR = probe(505, 235); out.inBR = probe(505, 365); out.inBL = probe(210, 435);
  out.outTR = probe(590, 160); out.outBR = probe(590, 440); out.midRightEdge = probe(515, 300);
  // перспектива: середина верхнего края ДОЛЖНА лежать выше прямой TL-TR? Нет — прямые остаются
  // прямыми в обоих режимах; различие — положение центра: центр гомографии смещён к дальнему краю.
  out.centerSample = probe(360, 300);
  d.close(SaveOptions.DONOTSAVECHANGES);
  out.ok = true;
} catch (e) { out.ok = false; out.error = String(e); try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
out.toSource();
`;
const jsxPath = '/tmp/da-distort-live.jsx';
writeFileSync(jsxPath, jsx);
const scpt = `tell application "Adobe Photoshop 2026"\nwith timeout of 60 seconds\ndo javascript "$.evalFile('${jsxPath}')"\nend timeout\nend tell`;
writeFileSync('/tmp/da-distort-live.scpt', scpt);
console.log('mode', mode, 'mesh', JSON.stringify(mesh.map(p => p.map(v => Math.round(v)))));
console.log(execFileSync('osascript', ['/tmp/da-distort-live.scpt'], { encoding: 'utf8' }));
unlinkSync(jsxPath);
