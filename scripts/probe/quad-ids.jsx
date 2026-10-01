var names = ["quadrilateral","warp","customEnvelopeWarp","meshPoints","offset","freeTransformCenterState","transform","perspectiveWarp","puppetWarp","distort","perspective","bounds","warpQuad"];
var o = [];
for (var i=0;i<names.length;i++){ var id = stringIDToTypeID(names[i]); var ch=""; try { ch = typeIDToCharID(id); } catch(e) { ch = "ERR"; } o.push(names[i]+"="+id+"/"+ch); }
o.join(" | ");
