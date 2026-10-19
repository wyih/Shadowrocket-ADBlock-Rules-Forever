// Inspect the observed startup RPC without changing its request or response body.
(function () {
  if (!/^https:\/\/(?:grpc\.biliapi\.net|app\.bilibili\.com)\/bilibili\.app\.coldstart\.v1\.ColdStart\/GetColdStartDeferredData$/i.test($request.url)) {
    $done({});
    return;
  }
  const phase = typeof $argument === "string" ? $argument : "";
  if (phase !== "request" && phase !== "response") return $done({});
  const message = phase === "request" ? $request : typeof $response === "object" ? $response : {};
  const raw = message.bodyBytes == null ? message.body : message.bodyBytes;
  let bytes;
  if (typeof raw === "string") bytes = Uint8Array.from(raw, char => char.charCodeAt(0) & 255);
  else if (ArrayBuffer.isView(raw)) bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  else bytes = new Uint8Array(raw || 0);

  const assets = new Set();
  const apis = new Set();
  let frames = 0, compressed = 0, complete = true;
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 5 > bytes.length) { complete = false; break; }
    const length = bytes[offset + 1] * 16777216 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 256 + bytes[offset + 4];
    const end = offset + 5 + length;
    if (end > bytes.length || bytes[offset] > 1) { complete = false; break; }
    frames++;
    if (bytes[offset] === 1) compressed++;
    else {
      // Keep temporary strings small; log only public API/asset paths, never metadata or queries.
      for (let start = offset + 5; start < end; start += 4096) {
        const text = String.fromCharCode.apply(null, bytes.subarray(start, Math.min(start + 4352, end)));
        for (const match of text.matchAll(/\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/(?:list|config))(?=[?\s"\\\x00-\x1f]|$)/g)) {
          if (apis.size < 8) apis.add(match[0]);
        }
        const urls = /https?:\/\/((?:i[012]\.hdslb\.com|upos-sz-static(?:cos)?\.bilivideo\.com))(?=\/)(\/[a-z0-9_./%~!@:+-]*)/gi;
        for (const match of text.matchAll(urls)) {
          if (!/^\/(?:bfs\/sycp(?:_brand)?\/|ssaxcode\/)/i.test(match[2])) continue;
          if (assets.size < 8) assets.add((match[1] + match[2]).slice(0, 200));
        }
      }
    }
    offset = end;
  }
  console.log("Bilibili startup trace: version=20261019.1 phase=" + phase +
    " bytes=" + bytes.length + " frames=" + frames + " compressed=" + compressed +
    " complete=" + complete + " apis=" + JSON.stringify([...apis]) + " assets=" + JSON.stringify([...assets]));
  if (phase === "request") {
    // Request uncompressed gRPC frames so the default JSCore engine can inspect the reply.
    const headers = {};
    for (const [name, value] of Object.entries(message.headers || {})) {
      if (name.toLowerCase() !== "grpc-accept-encoding") headers[name] = value;
    }
    headers["grpc-accept-encoding"] = "identity";
    $done({ headers });
  } else $done({});
})();
