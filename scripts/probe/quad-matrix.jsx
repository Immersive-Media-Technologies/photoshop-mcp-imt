// Matrix probe: which quadrilateral form actually distorts? Fresh doc per case, nothing saved.
function run(kind, variant, ftcs) {
  var d = app.documents.add(800, 600, 72, "da-q", NewDocumentMode.RGB, DocumentFill.WHITE);
  var L = d.artLayers.add(); L.name = "BOX";
  d.selection.select([[200,150],[600,150],[600,450],[200,450]]);
  var c = new SolidColor(); c.rgb.red = 200; c.rgb.green = 40; c.rgb.blue = 40;
  d.selection.fill(c); d.selection.deselect();
  if (kind === "smart") executeAction(stringIDToTypeID("newPlacedLayer"), undefined, DialogModes.NO);
  var q;
  if (variant === "abs") q = [200,150, 560,200, 560,400, 200,450];
  else if (variant === "rel") q = [0,0, 360,50, 360,250, 0,300];
  else if (variant === "center") q = [-200,-150, 160,-100, 160,100, -200,150];
  else q = [-200,-150, 160,-100, 160,100, -200,150]; // docCenter: doc center 400,300 → same as center here
  var desc = new ActionDescriptor();
  var ref = new ActionReference();
  ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
  desc.putReference(charIDToTypeID("null"), ref);
  desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID(ftcs));
  var ofs = new ActionDescriptor();
  ofs.putUnitDouble(charIDToTypeID("Hrzn"), charIDToTypeID("#Pxl"), 0);
  ofs.putUnitDouble(charIDToTypeID("Vrtc"), charIDToTypeID("#Pxl"), 0);
  desc.putObject(charIDToTypeID("Ofst"), charIDToTypeID("Ofst"), ofs);
  var lst = new ActionList();
  for (var i = 0; i < 8; i++) lst.putUnitDouble(charIDToTypeID("#Pxl"), q[i]);
  desc.putList(stringIDToTypeID("quadrilateral"), lst);
  desc.putEnumerated(charIDToTypeID("Intr"), charIDToTypeID("Intp"), charIDToTypeID("Bcbc"));
  var err = "";
  try { executeAction(charIDToTypeID("Trnf"), desc, DialogModes.NO); } catch (e) { err = String(e); }
  var b = d.activeLayer.bounds;
  var r = kind+"/"+variant+"/"+ftcs+" -> ["+b[0].as('px')+","+b[1].as('px')+","+b[2].as('px')+","+b[3].as('px')+"]"+(err?" ERR "+err:"");
  d.close(SaveOptions.DONOTSAVECHANGES);
  return r;
}
var lines = [];
var kinds = ["pixel","smart"], vars = ["abs","rel","center"], fts = ["Qcsa","Qcs0"];
for (var a=0;a<kinds.length;a++) for (var b=0;b<vars.length;b++) for (var c=0;c<fts.length;c++) {
  try { lines.push(run(kinds[a], vars[b], fts[c])); } catch(e) { lines.push(kinds[a]+"/"+vars[b]+"/"+fts[c]+" EXC "+e); try{app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);}catch(e2){} }
}
lines.join("\n");
