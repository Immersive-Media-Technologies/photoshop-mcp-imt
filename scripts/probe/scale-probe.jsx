var out = {};
try {
  var d = app.documents.add(800, 600, 72, "da-scale-probe", NewDocumentMode.RGB, DocumentFill.WHITE);
  var L = d.artLayers.add(); L.name = "BOX";
  d.selection.select([[200,150],[600,150],[600,450],[200,450]]);
  var c = new SolidColor(); c.rgb.red = 200; c.rgb.green = 40; c.rgb.blue = 40;
  d.selection.fill(c); d.selection.deselect();
  var b0 = L.bounds; out.before = [b0[0].as('px'), b0[1].as('px'), b0[2].as('px'), b0[3].as('px')];
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  desc.putReference(charIDToTypeID("null"), ref);
  desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
  var ofs = new ActionDescriptor();
  ofs.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
  ofs.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
  desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), ofs);
  desc.putUnitDouble(charIDToTypeID("Wdth"), charIDToTypeID("#Prc"), 50);
  desc.putUnitDouble(charIDToTypeID("Hght"), charIDToTypeID("#Prc"), 50);
  desc.putEnumerated(charIDToTypeID("Intr"), charIDToTypeID("Intp"), charIDToTypeID("Bcbc"));
  executeAction(charIDToTypeID("Trnf"), desc, DialogModes.NO);
  var b1 = L.bounds; out.afterScale = [b1[0].as('px'), b1[1].as('px'), b1[2].as('px'), b1[3].as('px')];
  // warp probe: Trnf with warp descriptor, warpStyle warpArc 30%
  var desc2 = new ActionDescriptor();
  var ref2 = new ActionReference();
  ref2.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  desc2.putReference(charIDToTypeID("null"), ref2);
  desc2.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
  var ofs2 = new ActionDescriptor();
  ofs2.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
  ofs2.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
  desc2.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), ofs2);
  var warp = new ActionDescriptor();
  warp.putEnumerated(stringIDToTypeID("warpStyle"), stringIDToTypeID("warpStyle"), stringIDToTypeID("warpArc"));
  warp.putDouble(stringIDToTypeID("warpValue"), 30);
  warp.putDouble(stringIDToTypeID("warpPerspective"), 0);
  warp.putDouble(stringIDToTypeID("warpPerspectiveOther"), 0);
  warp.putEnumerated(stringIDToTypeID("warpRotate"), stringIDToTypeID("orientation"), stringIDToTypeID("horizontal"));
  desc2.putObject(stringIDToTypeID("warp"), stringIDToTypeID("warp"), warp);
  desc2.putEnumerated(charIDToTypeID("Intr"), charIDToTypeID("Intp"), charIDToTypeID("Bcbc"));
  executeAction(charIDToTypeID("Trnf"), desc2, DialogModes.NO);
  var b2 = L.bounds; out.afterWarp = [b2[0].as('px'), b2[1].as('px'), b2[2].as('px'), b2[3].as('px')];
  d.close(SaveOptions.DONOTSAVECHANGES);
  out.ok = true;
} catch (e) { out.ok = false; out.error = String(e); try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
JSON_STRINGIFY(out);
function JSON_STRINGIFY(o){ var s=[]; for (var k in o){ var v=o[k]; s.push('"'+k+'":'+(v instanceof Array? '['+v.join(',')+']' : (typeof v==='string'? '"'+v.replace(/"/g,'\\"')+'"' : String(v)))); } return '{'+s.join(',')+'}'; }
