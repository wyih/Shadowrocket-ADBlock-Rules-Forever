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

  // Read only the commerce fields missing from upstream's minimal DynamicItem schema.
  // Field numbers: bilibili/app/dynamic/v2/dynamic.proto in bilibili-API-collect.
  function __biliFields(bytes) {
    let offset = 0;
    const fields = [];
    function varint() {
      let value = 0, scale = 1;
      for (let i = 0; i < 10 && offset < bytes.length; i++, scale *= 128) {
        const byte = bytes[offset++];
        value += (byte & 127) * scale;
        if (!(byte & 128)) return value;
      }
      throw new Error("truncated dynamic field");
    }
    while (offset < bytes.length) {
      const tag = varint(), wire = tag % 8;
      let data;
      if (wire === 0) data = varint();
      else if (wire === 2) {
        const length = varint();
        const end = offset + length;
        if (!Number.isSafeInteger(end) || end > bytes.length) throw new Error("truncated dynamic message");
        data = bytes.subarray(offset, end);
        offset = end;
      } else if (wire === 1 || wire === 5) offset += wire === 1 ? 8 : 4;
      else throw new Error("unsupported dynamic field");
      if (offset > bytes.length) throw new Error("truncated dynamic field");
      fields.push({ no: Math.floor(tag / 8), wire, data });
    }
    return fields;
  }

  function __biliCommerceModules(modules) {
    return modules.some(bytes => __biliFields(bytes).some(module => {
      if (module.wire !== 2) return false;
      if (module.no === 8) { // ModuleAdditional: goods type or goods payload.
        return __biliFields(module.data).some(f =>
          (f.no === 1 && f.wire === 0 && f.data === 2) || (f.no === 3 && f.wire === 2));
      }
      if (module.no === 4) { // ModuleDesc: a structured goods/Taobao link, not plain text.
        return __biliFields(module.data).some(f => f.no === 1 && f.wire === 2 &&
          __biliFields(f.data).some(desc =>
            (desc.no === 2 && desc.wire === 0 && [6, 14].includes(desc.data)) ||
            (desc.no === 9 && desc.wire === 2)));
      }
      if (module.no === 5) { // ModuleDynamic -> MdlDynForward -> original DynamicItem.
        return __biliFields(module.data).some(f => f.no === 6 && f.wire === 2 &&
          __biliFields(f.data).some(forward => forward.no === 1 && forward.wire === 2 &&
            __biliCommerceModules(__biliFields(forward.data)
              .filter(item => item.no === 3 && item.wire === 2).map(item => item.data))));
      }
      return false;
    }));
  }

  function __biliKeepDynamicItem(item) {
    try {
      const modules = (item[Symbol.for("protobuf-ts/unknown")] || [])
        .filter(field => field.no === 3 && field.wireType === 2).map(field => {
          // Unknown length-delimited fields retain their length prefix after decoding.
          let offset = 0;
          while (field.data[offset++] & 128) {}
          return field.data.subarray(offset);
        });
      if (!__biliCommerceModules(modules)) return true;
      console.log("Bilibili dynamic: version=20261017.4 removed-commerce=1");
      return false;
    } catch (_) { return true; }
  }

  function execute(source) {
    // Direct eval retains Shadowrocket's injected APIs and supplies valid JSON to upstream.
    const $argument = JSON.stringify(settings);
    // Both pinned bundles use this one predicate inside their purifyComment branch.
    source = source.replace(".topReplies.filter(", ".topReplies.filter(__biliKeepPinnedReply).filter(");
    source = source.replace(".dynamicList.list.filter(", ".dynamicList.list.filter(__biliKeepDynamicItem).filter(");
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
