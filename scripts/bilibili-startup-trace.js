// Inspect the observed startup RPC without changing its request or response body.
(function () {
  if (!/^https:\/\/(?:grpc\.biliapi\.net|app\.bilibili\.com)\/bilibili\.app\.coldstart\.v1\.ColdStart\/GetColdStartDeferredData$/i.test($request.url)) {
    $done({});
    return;
  }
  const phase = typeof $argument === "string" ? $argument : "";
  if (phase !== "request" && phase !== "response") return $done({});
  const message = phase === "request" ? $request : typeof $response === "object" ? $response : {};
  const encodingHeader = Object.entries(message.headers || {}).find(([name]) => name.toLowerCase() === "grpc-encoding");
  const encodingValue = encodingHeader && String(encodingHeader[1]).toLowerCase();
  const encoding = ["gzip", "deflate", "identity"].includes(encodingValue) ? encodingValue : encodingValue ? "other" : "unspecified";
  const raw = message.bodyBytes == null ? message.body : message.bodyBytes;
  let bytes;
  if (typeof raw === "string") bytes = Uint8Array.from(raw, char => char.charCodeAt(0) & 255);
  else if (ArrayBuffer.isView(raw)) bytes = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
  else bytes = new Uint8Array(raw || 0);

  const assets = new Set();
  const apis = new Set();
  let frames = 0, compressed = 0, decodedBytes = 0, decodeFailures = 0, complete = true;
  for (let offset = 0; offset < bytes.length;) {
    if (offset + 5 > bytes.length) { complete = false; break; }
    const length = bytes[offset + 1] * 16777216 + bytes[offset + 2] * 65536 + bytes[offset + 3] * 256 + bytes[offset + 4];
    const end = offset + 5 + length;
    if (end > bytes.length || bytes[offset] > 1) { complete = false; break; }
    frames++;
    let payload = bytes.subarray(offset + 5, end);
    if (bytes[offset] === 1) {
      compressed++;
      try {
        // Native ungzip reads the backing buffer from zero; copy the frame payload first.
        payload = $utils.ungzip(payload.slice());
        if (!payload) throw new Error("gzip decoding failed");
      } catch (_) {
        decodeFailures++;
        payload = null;
      }
    }
    if (payload) {
      decodedBytes += payload.length;
      // Keep temporary strings small; log only public API/asset paths, never metadata or queries.
      for (let start = 0; start < payload.length; start += 4096) {
        const text = String.fromCharCode.apply(null, payload.subarray(start, Math.min(start + 4352, payload.length))).replace(/\\\//g, "/");
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
  console.log("Bilibili startup trace: version=20261020.1 phase=" + phase +
    " bytes=" + bytes.length + " frames=" + frames + " compressed=" + compressed +
    " decoded=" + decodedBytes + " decode_failures=" + decodeFailures +
    " complete=" + complete + " encoding=" + encoding +
    " apis=" + JSON.stringify([...apis]) + " assets=" + JSON.stringify([...assets]));
  $done({});
})();
