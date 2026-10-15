// Run Keywos's EAPI filter with Shadowrocket-compatible UTF-8 decoding and arguments.
(function () {
  const raw = typeof $argument === "string" ? $argument.trim() : "";
  let settings;
  try { settings = JSON.parse(raw); } catch (_) {}
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    settings = {};
    for (const part of raw.split("&")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      let value = decodeURIComponent(part.slice(separator + 1));
      try { value = JSON.parse(value); } catch (_) {}
      settings[decodeURIComponent(part.slice(0, separator))] = value;
    }
  }
  for (const key of Object.keys(settings)) {
    if (settings[key] === "true") settings[key] = true;
    if (settings[key] === "false") settings[key] = false;
  }

  function execute(source) {
    const $argument = raw ? JSON.stringify(settings) : "";
    // JSCore can lack TextDecoder even when the converted rule requests WebView.
    const TextDecoder = typeof globalThis.TextDecoder === "function" ? globalThis.TextDecoder : class {
      decode(input) {
        const bytes = ArrayBuffer.isView(input)
          ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
          : new Uint8Array(input);
        let encoded = "";
        for (const byte of bytes) encoded += "%" + byte.toString(16).padStart(2, "0");
        return decodeURIComponent(encoded).replace(/^\uFEFF/, "");
      }
    };
    // The pinned upstream has a missing route slash and assigns forEach's void result.
    source = source.replace('case"homepage/block/page":', 'case"/homepage/block/page":');
    for (const list of [
      "s.data.blocks[i].dslData[y].commonResourceList",
      "s.data[i].block.dslData[y].commonResourceList"
    ]) source = source.replace(list + "=" + list + ".forEach", list + ".forEach");
    try { eval(source); } catch (error) {
      console.log("[Netease compat] " + error.message);
      $done({});
    }
  }

  const revision = "a06d921d370ad6fca9e972a3f76e64d90bc8cfae";
  const cacheKey = "wyih.netease.response." + revision;
  const cached = $persistentStore.read(cacheKey);
  if (typeof cached === "string" && cached) return execute(cached);
  const url = "https://raw.githubusercontent.com/Keywos/rule/" + revision + "/script/wy/js/wyres.js";
  $httpClient.get({ url, timeout: 3 }, (error, response, source) => {
    if (error || !response || response.status !== 200 || typeof source !== "string" || !source.trim()) {
      console.log("[Netease compat] upstream script download failed");
      return $done({});
    }
    $persistentStore.write(source, cacheKey);
    execute(source);
  });
})();
