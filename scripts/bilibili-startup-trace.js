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
  const rpcs = new Set();
  const markers = new Set();
  const fields = [];
  const formats = [];
  let inspected = 0, nestedDecoded = 0, nestedFailures = 0, limited = false;
  function inspect(payload, path = "", depth = 0) {
    if (++inspected > 64 || depth > 4) { limited = true; return; }
    // Field numbers and lengths expose the envelope without logging any field values.
    if (payload[0] === 31 && payload[1] === 139) {
      formats.push(path + ":gzip:" + payload.length);
      try {
        const unpacked = $utils.ungzip(payload.slice());
        if (!unpacked) throw new Error("nested gzip decoding failed");
        nestedDecoded += unpacked.length;
        inspect(unpacked, path + ".gzip", depth + 1);
      } catch (_) { nestedFailures++; }
      return;
    }
    if (payload[0] === 123 || payload[0] === 91) formats.push(path + ":json-like:" + payload.length);
    if (payload[0] === 72 && payload[1] === 52 && payload[2] === 115 && payload[3] === 73) formats.push(path + ":base64-gzip-like:" + payload.length);
    if (payload[0] === 120 && (payload[0] * 256 + payload[1]) % 31 === 0) formats.push(path + ":zlib-like:" + payload.length);
    for (let start = 0; start < payload.length; start += 4096) {
      const text = String.fromCharCode.apply(null, payload.subarray(start, Math.min(start + 4352, payload.length))).replace(/\\\//g, "/");
      for (const match of text.matchAll(/splash|topview|creative_id|ad_info|base64|gzip|encrypt/gi)) markers.add(match[0].toLowerCase());
      for (const match of text.matchAll(/bilibili\.(?:[a-z][a-z0-9_]*\.){2,8}[A-Z][A-Za-z0-9_]{0,63}\/[A-Z][A-Za-z0-9_]{0,63}/g)) {
        if (rpcs.size < 8) rpcs.add(match[0]);
      }
      for (const match of text.matchAll(/\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/(?:list|config))(?=[?\s"\\\x00-\x1f]|$)/g)) {
        if (apis.size < 8) apis.add(match[0]);
      }
      const urls = /https?:\/\/((?:i[012]\.hdslb\.com|upos-sz-static(?:cos)?\.bilivideo\.com))(?=\/)(\/[a-z0-9_./%~!@:+-]*)/gi;
      for (const match of text.matchAll(urls)) {
        if (!/^\/(?:bfs\/sycp(?:_brand)?\/|ssaxcode\/)/i.test(match[2])) continue;
        if (assets.size < 8) assets.add((match[1] + match[2]).slice(0, 200));
      }
    }
    let offset = 0;
    function varint(limit) {
      let value = 0, factor = 1;
      for (let n = 0; n < limit && offset < payload.length; n++) {
        const byte = payload[offset++];
        value += (byte & 127) * factor;
        if (!(byte & 128)) return value;
        factor *= 128;
      }
      throw new Error("invalid protobuf varint");
    }
    const parsed = [];
    try {
      while (offset < payload.length) {
        const tag = varint(5), number = Math.floor(tag / 8), wire = tag % 8;
        if (!number || number > 536870911) return;
        if (parsed.length >= 64) { limited = true; break; }
        let start = offset, length;
        if (wire === 0) { varint(10); length = offset - start; }
        else if (wire === 1 || wire === 5) { length = wire === 1 ? 8 : 4; offset += length; }
        else if (wire === 2) { length = varint(5); start = offset; offset += length; }
        else return;
        if (offset > payload.length) return;
        parsed.push({ number, wire, start, length });
      }
    } catch (_) { return; }
    for (const field of parsed) {
      const name = path ? path + "." + field.number : String(field.number);
      if (fields.length < 48) fields.push(name + ":" + field.wire + ":" + field.length);
      else limited = true;
      if (field.wire === 2 && field.length) inspect(payload.subarray(field.start, field.start + field.length), name, depth + 1);
    }
  }
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
      inspect(payload);
    }
    offset = end;
  }
  console.log("Bilibili startup trace: version=20261020.2 phase=" + phase +
    " bytes=" + bytes.length + " frames=" + frames + " compressed=" + compressed +
    " decoded=" + decodedBytes + " decode_failures=" + decodeFailures +
    " complete=" + complete + " encoding=" + encoding +
    " apis=" + JSON.stringify([...apis]) + " assets=" + JSON.stringify([...assets]) +
    " rpcs=" + JSON.stringify([...rpcs]) + " markers=" + JSON.stringify([...markers]) + " fields=" + JSON.stringify(fields) +
    " formats=" + JSON.stringify(formats) + " nested_decoded=" + nestedDecoded +
    " nested_failures=" + nestedFailures + " inspect_limit=" + limited);
  $done({});
})();
