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

  function __biliKeepPinnedReply(reply) {
    const commerceWords = /淘宝|某宝|天猫|京东|狗东|拼多多|饿了么|美团|转转|妙界|神气小鹿/;
    const links = Object.values(reply.content?.urls || {});
    if (!links.some(link => commerceWords.test(link.title) || commerceWords.test(link.appName))) return true;
    console.log("Bilibili comments: version=20261017.1 removed-pinned-commerce=1");
    return false;
  }

  function execute(source) {
    // Direct eval retains Shadowrocket's injected APIs and supplies valid JSON to upstream.
    const $argument = JSON.stringify(settings);
    // Both pinned bundles use this one predicate inside their purifyComment branch.
    source = source.replace(".topReplies.filter(", ".topReplies.filter(__biliKeepPinnedReply).filter(");
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
