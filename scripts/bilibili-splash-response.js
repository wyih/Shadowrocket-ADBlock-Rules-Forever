// SPDX-License-Identifier: GPL-3.0-only
// Adapted from kokoryh/Sparkle's handleSplash; see bilibili-splash-response.LICENSE.
// Empty the real response's ad lists and retention list, not just creative schedules.
(function () {
  const url = $request.url;
  const path = url.split("?")[0].replace(/^https:\/\/[^/]+/i, "");
  if (!/^https:\/\/app\.bilibili\.com\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/(?:list|config))(?:\?|$)/i.test(url) ||
      typeof $response === "undefined" || typeof $response.body !== "string") {
    $done({});
    return;
  }
  // Creative IDs can exceed JS's exact integer range. Keep their wire literals.
  const source = $response.body;
  let prefix = "__bili_integer_";
  const integers = [];
  let message;
  try {
    const tokens = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
    const strings = (source.match(tokens) || []).filter(token => token[0] === '"').map(token => JSON.parse(token));
    while (strings.some(text => text.includes(prefix))) prefix += "_";
    const protectedBody = source.replace(tokens, token => {
      if (!/^-?\d+$/.test(token) || Number.isSafeInteger(Number(token))) return token;
      integers.push(token);
      return JSON.stringify(prefix + (integers.length - 1));
    });
    message = JSON.parse(protectedBody);
  } catch (_) {
    console.log("Bilibili splash: version=20261017.3 path=" + path + " invalid-json");
    $done({});
    return;
  }
  const data = message && message.data;
  if (!message || message.code !== 0 || !data || typeof data !== "object" || Array.isArray(data)) {
    $done({});
    return;
  }
  // Inspect only asset fields before removing them; never log tracking URLs or query values.
  const hosts = new Set();
  const samples = new Set();
  const pending = [data];
  while (pending.length) {
    for (const [key, value] of Object.entries(pending.pop())) {
      if (key === "account") continue;
      if (value && typeof value === "object") pending.push(value);
      if (typeof value !== "string" || !/^(?:thumb|(?:logo|video|image|pic|topview_pic|topview_video|guide_image|jump_image|schema_image)_url)$/.test(key)) continue;
      const asset = /^https?:\/\/([a-z0-9.-]+)(?::\d+)?(?=\/|[?#]|$)(?:\/[^?#\s]*)?/i.exec(value);
      if (!asset) continue;
      if (hosts.size < 8) hosts.add(asset[1].toLowerCase());
      if (samples.size < 3) samples.add(asset[0].slice(0, 200));
    }
  }
  const fields = Object.keys(data).filter(key => /^[a-z][a-z0-9_]{0,63}$/i.test(key)).slice(0, 24)
    .map(key => key + ":" + (Array.isArray(data[key]) ? data[key].length : typeof data[key]));
  console.log("Bilibili splash source: version=20261017.3 path=" + path +
    " fields=" + JSON.stringify(fields) + " hosts=" + JSON.stringify([...hosts]) +
    " samples=" + JSON.stringify([...samples]));
  if (path.toLowerCase() === "/x/v2/splash/brand/config") {
    // This dedicated splash endpoint's live schema is unknown; return an empty config.
    message.data = {};
    console.log("Bilibili splash: version=20261017.3 path=" + path + " config=empty");
  } else {
    const beforeList = Array.isArray(data.list) ? data.list.length : data.list == null ? 0 : -1;
    const beforeKeep = Array.isArray(data.keep_ids) ? data.keep_ids.length : data.keep_ids == null ? 0 : -1;
    delete data.account;
    // Send explicit empty arrays, including the server's cache-retention directive.
    for (const field of ["list", "show", "event_list", "keep_ids", "preload"]) data[field] = [];
    // Brand responses need explicit controls as well as empty lists; preserve scalar types.
    const brand = path.toLowerCase() === "/x/v2/splash/brand/list";
    for (const [field, fallback] of Object.entries({ forcibly: false, rule: "", has_new_splash_set: 0 })) {
      if (!brand && !Object.prototype.hasOwnProperty.call(data, field)) continue;
      const type = typeof data[field];
      data[field] = type === "boolean" ? false : type === "string" ? "" : type === "number" ? 0 : fallback;
    }
    for (const [field, value] of Object.entries({ max_time: 0, min_interval: 31536000, pull_interval: 31536000 })) {
      if (Object.prototype.hasOwnProperty.call(data, field)) data[field] = value;
    }
    const event = /[?&]open_event=(hot|cold|background)(?:&|$)/i.exec(url);
    console.log("Bilibili splash: version=20261017.3 path=" + path +
      " event=" + (event ? event[1].toLowerCase() : "other") +
      " list=" + beforeList + "->0 keep=" + beforeKeep + "->0");
  }
  let body = JSON.stringify(message);
  integers.forEach((literal, index) => {
    body = body.split(JSON.stringify(prefix + index)).join(literal);
  });
  $done({ body });
})();
