// Bilibili 8.89: dismissSplashNotify -> clearResource -> autoClearWithType.
// A zero byte budget deletes indexed commercial splash media on that cleanup.
// Rewrite the live Fawkes bundle and its index together; retain all other settings.
(function () {
  const version = "20261105.1";
  const indexPattern = /^https:\/\/i[012]\.hdslb\.com\/bfs\/fawkes\/dd\/prod\/(?:\d+\/)?iphone\.zip(?:\?|$)/i;
  const bundlePattern = /^https:\/\/i[012]\.hdslb\.com\/bfs\/fawkes\/dd\/iphone\/prod\/default\/\d+\/iphone_default_\d+\.zip$/i;
  const marker = "bili_splash_cache=0";
  const url = $request.url;
  const isIndex = indexPattern.test(url);
  const originUrl = url.endsWith("?" + marker) ? url.slice(0, -marker.length - 1) : "";
  if (!isIndex && !bundlePattern.test(originUrl)) return $done({});
  if (typeof $argument === "string" && $argument === "request") {
    const headers = Object.fromEntries(Object.entries($request.headers || {}).filter(([key]) => !/^(if-none-match|if-modified-since)$/i.test(key)));
    return $done({ headers });
  }
  if (typeof $response !== "object" || Number($response.status || $response.statusCode) !== 200) return $done({});

  function bytes(value) {
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (value instanceof ArrayBuffer || Array.isArray(value)) return new Uint8Array(value);
    throw new Error("binary body unavailable");
  }
  function crc32(data) {
    let crc = -1;
    for (const byte of data) {
      crc ^= byte;
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  }
  function md5(data) {
    const padded = new Uint8Array(Math.ceil((data.length + 9) / 64) * 64);
    padded.set(data); padded[data.length] = 128;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, data.length * 8, true);
    const shift = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
    const table = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296));
    const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
    for (let offset = 0; offset < padded.length; offset += 64) {
      let [a, b, c, d] = state;
      for (let i = 0; i < 64; i++) {
        const round = i >> 4;
        const f = round === 0 ? (b & c) | (~b & d) : round === 1 ? (d & b) | (~d & c) : round === 2 ? b ^ c ^ d : c ^ (b | ~d);
        const g = round === 0 ? i : round === 1 ? (5 * i + 1) % 16 : round === 2 ? (3 * i + 5) % 16 : (7 * i) % 16;
        const sum = (a + f + table[i] + view.getUint32(offset + g * 4, true)) | 0;
        const n = shift[round * 4 + i % 4];
        [a, b, c, d] = [d, (b + ((sum << n) | (sum >>> (32 - n)))) | 0, b, c];
      }
      [a, b, c, d].forEach((n, i) => { state[i] = (state[i] + n) | 0; });
    }
    return state.map(n => [0, 8, 16, 24].map(s => ((n >>> s) & 255).toString(16).padStart(2, "0")).join("")).join("");
  }
  // The observed index and full bundle each contain one JSON file with an iphone name.
  function unzip(data) {
    if (data.length < 22 || data.length > 4 * 1024 * 1024) throw new Error("zip size");
    const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let end = data.length - 22;
    while (end >= Math.max(0, data.length - 65557) && v.getUint32(end, true) !== 0x06054b50) end--;
    if (end < 0 || v.getUint16(end + 10, true) !== 1 || v.getUint16(end + 4, true) !== 0) throw new Error("zip entries");
    const central = v.getUint32(end + 16, true);
    if (central + 46 > end || v.getUint32(central, true) !== 0x02014b50) throw new Error("zip directory");
    const method = v.getUint16(central + 10, true), crc = v.getUint32(central + 16, true);
    const compressed = v.getUint32(central + 20, true), size = v.getUint32(central + 24, true);
    const nameLength = v.getUint16(central + 28, true), local = v.getUint32(central + 42, true);
    const name = new TextDecoder().decode(data.subarray(central + 46, central + 46 + nameLength));
    if (!/^iphone(?:_default_\d+)?$/.test(name) || size > 4 * 1024 * 1024 || (v.getUint16(central + 8, true) & 1)) throw new Error("zip format");
    if (local + 30 > central || v.getUint32(local, true) !== 0x04034b50) throw new Error("zip header");
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (start + compressed > central) throw new Error("zip truncated");
    let raw = data.slice(start, start + compressed);
    if (method === 8) {
      // ZIP uses raw DEFLATE; add a valid gzip wrapper for Shadowrocket's native decoder.
      const gzip = new Uint8Array(raw.length + 18);
      gzip.set([31, 139, 8, 0, 0, 0, 0, 0, 0, 3]); gzip.set(raw, 10);
      const tail = new DataView(gzip.buffer);
      tail.setUint32(gzip.length - 8, crc, true); tail.setUint32(gzip.length - 4, size, true);
      raw = bytes($utils.ungzip(gzip));
    } else if (method !== 0) throw new Error("zip compression");
    if (raw.length !== size || crc32(raw) !== crc) throw new Error("zip checksum");
    return { name, data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) };
  }
  function zip(json, filename = "iphone") {
    const raw = new TextEncoder().encode(JSON.stringify(json)), name = new TextEncoder().encode(filename);
    const central = 30 + name.length + raw.length, end = central + 46 + name.length;
    const out = new Uint8Array(end + 22), v = new DataView(out.buffer), crc = crc32(raw);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true);
    v.setUint32(14, crc, true); v.setUint32(18, raw.length, true); v.setUint32(22, raw.length, true);
    v.setUint16(26, name.length, true); out.set(name, 30); out.set(raw, 30 + name.length);
    v.setUint32(central, 0x02014b50, true); v.setUint16(central + 4, 20, true); v.setUint16(central + 6, 20, true);
    v.setUint32(central + 16, crc, true); v.setUint32(central + 20, raw.length, true); v.setUint32(central + 24, raw.length, true);
    v.setUint16(central + 28, name.length, true); out.set(name, central + 46);
    v.setUint32(end, 0x06054b50, true); v.setUint16(end + 8, 1, true); v.setUint16(end + 10, 1, true);
    v.setUint32(end + 12, 46 + name.length, true); v.setUint32(end + 16, central, true);
    return out;
  }
  function nextVersion(value) {
    if (!/^\d{1,9}$/.test(String(value))) throw new Error("config version");
    return String(Number(value) + 1);
  }
  function patchBundle(data) {
    const archive = unzip(data), config = archive.data;
    if (archive.name !== "iphone_default_" + config.v) throw new Error("bundle filename");
    if (config.p !== "ios" || !Array.isArray(config.list)) throw new Error("config schema");
    const key = "splash.splashcache.max_size";
    const entries = config.list.filter(entry => entry.n === key);
    if (entries.length !== 1 || typeof entries[0].v !== "string") throw new Error("cache setting");
    // Replace the whole decision only for these two cache budgets, preserving all other entries.
    const budgets = [key, "splash.effect_splashcache.max_size"];
    config.list = config.list.map(entry => budgets.includes(entry.n) ? { n: entry.n, v: "0" } : entry);
    for (const n of budgets) if (!config.list.some(entry => entry.n === n)) config.list.push({ n, v: "0" });
    config.v = nextVersion(config.v);
    return zip(config, "iphone_default_" + config.v);
  }
  function deliver(body, kind) {
    const headers = {};
    for (const [key, value] of Object.entries($response.headers || {})) {
      if (!/^(content-(encoding|length|md5|range|type)|transfer-encoding|accept-ranges|etag|last-modified|cache-control)$/i.test(key)) headers[key] = value;
    }
    headers["Content-Type"] = "application/zip";
    headers["Content-Length"] = String(body.length);
    headers["Cache-Control"] = "no-store";
    console.log("Bilibili splash cache: version=" + version + " kind=" + kind + " budgets=0 bytes=" + body.length);
    $done({ body, headers });
  }
  function unchanged() {
    console.log("Bilibili splash cache: version=" + version + " unchanged=1");
    $done({});
  }
  try {
    const data = bytes($response.bodyBytes == null ? $response.body : $response.bodyBytes);
    if (!isIndex) return deliver(patchBundle(data), "bundle");
    const archive = unzip(data), index = archive.data, entry = index.version && index.version.default;
    if (archive.name !== "iphone") throw new Error("index filename");
    if (index.p !== "ios" || !entry || !bundlePattern.test(entry.u) || !/^[a-f0-9]{32}$/.test(entry.m)) throw new Error("index schema");
    const cacheKey = "bili-splash-cache-" + version;
    let cached;
    try { cached = JSON.parse($persistentStore.read(cacheKey) || "null"); } catch (_) {}
    function finish(hash) {
      index.v = nextVersion(index.v);
      entry.v = nextVersion(entry.v);
      entry.m = hash;
      entry.u += "?" + marker;
      entry.d = {}; // The modified full ZIP cannot use the origin's binary patches.
      deliver(zip(index), "index");
    }
    if (cached && cached.original === entry.m && /^[a-f0-9]{32}$/.test(cached.modified)) return finish(cached.modified);
    // This is a public config URL, with no app request headers, tokens or query copied.
    $httpClient.get({ url: entry.u, timeout: 6, "binary-mode": true }, (error, response, body) => {
      try {
        if (error || !response || Number(response.status) !== 200) throw new Error("bundle fetch");
        const original = bytes(body);
        if (md5(original) !== entry.m) throw new Error("origin checksum");
        const hash = md5(patchBundle(original));
        $persistentStore.write(JSON.stringify({ original: entry.m, modified: hash }), cacheKey);
        finish(hash);
      } catch (_) { unchanged(); }
    });
  } catch (_) { unchanged(); }
})();
