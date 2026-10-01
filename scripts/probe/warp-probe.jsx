// Custom envelope warp: move 4 corners of a 4x4 mesh — does it distort headlessly?
function sID(s){ return stringIDToTypeID(s); }
var out = {};
try {
  var d = app.documents.add(800, 600, 72, "da-warp", NewDocumentMode.RGB, DocumentFill.WHITE);
  var L = d.artLayers.add(); L.name = "BOX";
  d.selection.select([[200,150],[600,150],[600,450],[200,450]]);
  var c = new SolidColor(); c.rgb.red = 200; c.rgb.green = 40; c.rgb.blue = 40;
  d.selection.fill(c); d.selection.deselect();
  var x0=200,y0=150,x1=600,y1=450;
  // target corners TL,TR,BR,BL
  var TL=[200,150], TR=[560,200], BR=[560,400], BL=[200,450];
  // bilinear interpolation of 4x4 control grid from the 4 target corners
  function lerp(a,b,t){ return a+(b-a)*t; }
  var mesh = new ActionList();
  for (var r=0;r<4;r++){ for (var cc=0;cc<4;cc++){
    var u=cc/3, v=r/3;
    var px = lerp(lerp(TL[0],TR[0],u), lerp(BL[0],BR[0],u), v);
    var py = lerp(lerp(TL[1],TR[1],u), lerp(BL[1],BR[1],u), v);
    var p = new ActionDescriptor();
    p.putUnitDouble(sID("horizontal"), charIDToTypeID("#Pxl"), px);
    p.putUnitDouble(sID("vertical"), charIDToTypeID("#Pxl"), py);
    mesh.putObject(sID("rationalPoint"), p);
  }}
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  desc.putReference(charIDToTypeID("null"), ref);
  desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
  var ofs = new ActionDescriptor();
  ofs.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
  ofs.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
  desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), ofs);
  var warp = new ActionDescriptor();
  warp.putEnumerated(sID("warpStyle"), sID("warpStyle"), sID("warpCustom"));
  warp.putDouble(sID("warpValue"), 0);
  warp.putDouble(sID("warpPerspective"), 0);
  warp.putDouble(sID("warpPerspectiveOther"), 0);
  warp.putEnumerated(sID("warpRotate"), sID("orientation"), sID("horizontal"));
  var bnd = new ActionDescriptor();
  bnd.putUnitDouble(sID("top"), charIDToTypeID("#Pxl"), y0);
  bnd.putUnitDouble(sID("left"), charIDToTypeID("#Pxl"), x0);
  bnd.putUnitDouble(sID("bottom"), charIDToTypeID("#Pxl"), y1);
  bnd.putUnitDouble(sID("right"), charIDToTypeID("#Pxl"), x1);
  warp.putObject(sID("bounds"), sID("classFloatRect"), bnd);
  warp.putInteger(sID("uOrder"), 4);
  warp.putInteger(sID("vOrder"), 4);
  var env = new ActionDescriptor();
  env.putList(sID("meshPoints"), mesh);
  warp.putObject(sID("customEnvelopeWarp"), sID("customEnvelopeWarp"), env);
  desc.putObject(sID("warp"), sID("warp"), warp);
  desc.putEnumerated(charIDToTypeID("Intr"), charIDToTypeID("Intp"), charIDToTypeID("Bcbc"));
  var err="";
  try { executeAction(charIDToTypeID("Trnf"), desc, DialogModes.NO); } catch(e) { err=String(e); }
  var b = L.bounds; out.after = [b[0].as('px'), b[1].as('px'), b[2].as('px'), b[3].as('px')];
  // probe pixel: (590,160) should be transparent now (top-right corner moved in/down); (210,160) still red
  out.err = err;
  d.close(SaveOptions.DONOTSAVECHANGES);
  out.ok = true;
} catch (e) { out.ok = false; out.error = String(e); try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {} }
JSON_STRINGIFY(out);
function JSON_STRINGIFY(o){ var s=[]; for (var k in o){ var v=o[k]; s.push('"'+k+'":'+(v instanceof Array? '['+v.join(',')+']' : (typeof v==='string'? '"'+v.replace(/"/g,'\\"')+'"' : String(v)))); } return '{'+s.join(',')+'}'; }
