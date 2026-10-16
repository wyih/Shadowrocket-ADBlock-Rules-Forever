// SPDX-License-Identifier: GPL-3.0-only
// Adapted from kokoryh/Sparkle's handleSplash; see bilibili-splash-response.LICENSE.
// Preserve the real response and creative IDs so the app receives updated schedules.
(function () {
  const url = $request.url;
  const path = url.split("?")[0].replace(/^https:\/\/[^/]+/i, "");
  if (!/^https:\/\/app\.bilibili\.com\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/list)(?:\?|$)/i.test(url) ||
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
    console.log("Bilibili splash: version=20261016.2 path=" + path + " invalid-json");
    $done({});
    return;
  }
  const data = message && message.data;
  if (!message || message.code !== 0 || !data || typeof data !== "object" || Array.isArray(data)) {
    $done({});
    return;
  }
  for (const field of ["account", "event_list", "preload", "show"]) delete data[field];
  for (const [field, value] of Object.entries({ max_time: 0, min_interval: 31536000, pull_interval: 31536000 })) {
    if (Object.prototype.hasOwnProperty.call(data, field)) data[field] = value;
  }
  let creatives = 0;
  for (const item of Array.isArray(data.list) ? data.list : []) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    let patched = false;
    for (const [field, value] of Object.entries({
      duration: 0, begin_time: 2524579200, end_time: 2524665599, enable_pre_download: false
    })) {
      if (Object.prototype.hasOwnProperty.call(item, field)) {
        item[field] = value;
        patched = true;
      }
    }
    if (patched) creatives++;
  }
  const event = /[?&]open_event=(hot|cold|background)(?:&|$)/i.exec(url);
  console.log("Bilibili splash: version=20261016.2 path=" + path +
    " event=" + (event ? event[1].toLowerCase() : "other") + " creatives=" + creatives);
  let body = JSON.stringify(message);
  integers.forEach((literal, index) => {
    body = body.split(JSON.stringify(prefix + index)).join(literal);
  });
  $done({ body });
})();
