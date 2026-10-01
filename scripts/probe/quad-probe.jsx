// Deep Artisan probe (20.09): does Trnf + quadrilateral distort a layer headlessly?
// Runs on a NEW temp document, closes it without saving. Prints JSON.
var out = {};
try {
  var d = app.documents.add(800, 600, 72, "da-quad-probe", NewDocumentMode.RGB, DocumentFill.WHITE);
  var L = d.artLayers.add(); L.name = "BOX";
  d.selection.select([[200,150],[600,150],[600,450],[200,450]]);
  var c = new SolidColor(); c.rgb.red = 200; c.rgb.green = 40; c.rgb.blue = 40;
  d.selection.fill(c); d.selection.deselect();
  var b0 = L.bounds; out.before = [b0[0].as('px'), b0[1].as('px'), b0[2].as('px'), b0[3].as('px')];
  // target corners: TL, TR, BR, BL (absolute document px) — "rotate" right edge away
  var VARIANT = (typeof DA_QUAD_VARIANT !== "undefined") ? DA_QUAD_VARIANT : "abs";
  var q;
  if (VARIANT === "abs") q = [200,150, 560,200, 560,400, 200,450];
  else if (VARIANT === "rel") q = [0,0, 360,50, 360,250, 0,300];            // relative to bounds top-left
  else if (VARIANT === "center") q = [-200,-150, 160,-100, 160,100, -200,150]; // relative to bounds center
  else q = [200,150, 560,200, 560,400, 200,450];
  out.variant = VARIANT;
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  desc.putReference(charIDToTypeID("null"), ref);
  desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
  var ofs = new ActionDescriptor();
  ofs.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
  ofs.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
  desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), ofs);
  var lst = new ActionList();
  for (var i = 0; i < 8; i++) lst.putUnitDouble(charIDToTypeID("#Pxl"), q[i]);
  var KEY = (typeof DA_QUAD_KEY !== "undefined") ? DA_QUAD_KEY : "str";
  out.key = KEY; out.sameId = (charIDToTypeID("Quad") === stringIDToTypeID("quadrilateral"));
  out.quadStr = typeIDToStringID(charIDToTypeID("Quad"));
  desc.putList(KEY === "char" ? charIDToTypeID("Quad") : stringIDToTypeID("quadrilateral"), lst);
  desc.putEnumerated(charIDToTypeID("Intr"), charIDToTypeID("Intp"), charIDToTypeID("Bcbc"));
  executeAction(charIDToTypeID("Trnf"), desc, DialogModes.NO);
  var b1 = L.bounds; out.after = [b1[0].as('px'), b1[1].as('px'), b1[2].as('px'), b1[3].as('px')];
  // sample a pixel that must have become transparent (top-right corner area of original box)
  out.wanted = q;
  d.close(SaveOptions.DONOTSAVECHANGES);
  out.ok = true;
} catch (e) { out.ok = false; out.error = String(e); try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
JSON_STRINGIFY(out);
function JSON_STRINGIFY(o){ var s=[]; for (var k in o){ var v=o[k]; s.push('"'+k+'":'+(v instanceof Array? '['+v.join(',')+']' : (typeof v==='string'? '"'+v.replace(/"/g,'\\"')+'"' : String(v)))); } return '{'+s.join(',')+'}'; }
