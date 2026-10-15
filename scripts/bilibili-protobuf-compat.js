// Normalize Shadowrocket arguments before running kokoryh's existing protobuf scripts.
// Load the author's original bundles from a fixed GitHub revision and cache each version.
(function () {
  function parseArgument(raw) {
    raw = typeof raw === "string" ? raw.trim() : "";
    const candidates = [raw];
    if (raw.startsWith('"') && raw.endsWith('"')) candidates.push(raw.slice(1, -1));
    for (const candidate of candidates) {
      try {
        let parsed = JSON.parse(candidate);
        if (typeof parsed === "string") parsed = JSON.parse(parsed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch (_) {}
    }
    const parsed = {};
    for (const part of raw.split("&")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      const key = decodeURIComponent(part.slice(0, separator));
      let value = decodeURIComponent(part.slice(separator + 1));
      try { value = JSON.parse(value); } catch (_) {}
      parsed[key] = value;
    }
    return parsed;
  }

  const settings = parseArgument(typeof $argument === "string" ? $argument : "");
  if (settings.purifyComment === "true") settings.purifyComment = true;
  if (settings.purifyComment === "false") settings.purifyComment = false;
  const phase = settings._biliPhase;
  delete settings._biliPhase;
  if (phase !== "request" && phase !== "response") return $done({});

  function execute(source) {
    // Direct eval retains Shadowrocket's injected APIs and supplies valid JSON to upstream.
    const $argument = JSON.stringify(settings);
    try { eval(source); } catch (error) {
      console.log("[Bilibili compat] " + error.message);
      $done({});
    }
  }

  const revision = "290bcbdd2f158cdd8f7db9c996e90fe63490e16f";
  const cacheKey = "wyih.bilibili.protobuf." + revision + "." + phase;
  const cached = $persistentStore.read(cacheKey);
  if (typeof cached === "string" && cached) return execute(cached);
  const url = "https://raw.githubusercontent.com/kokoryh/Sparkle/" + revision + "/dist/bilibili.protobuf." + phase + ".js";
  $httpClient.get({ url, timeout: 3 }, (error, response, source) => {
    if (error || !response || response.status !== 200 || typeof source !== "string" || !source.trim()) {
      console.log("[Bilibili compat] upstream script download failed");
      return $done({});
    }
    $persistentStore.write(source, cacheKey);
    execute(source);
  });
})();
