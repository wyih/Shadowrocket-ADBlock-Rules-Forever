// Return an empty download list and expired schedules for the app's existing ad IDs.
(function () {
  const url = $request.url;
  const match = /^https:\/\/app\.bilibili\.com(\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/(?:list|config)))(?:\?|$)/i.exec(url);
  const phase = typeof $argument === "string" ? $argument : "";
  if (!match || !["request", "response"].includes(phase)) return $done({});
  const ids = new Set();
  let limited = false;
  const params = url.slice(url.indexOf("?") + 1).split("&");
  // TopView is the currently selected creative; retire it before adding the loaded inventory.
  for (const name of ["topview_ids", "loaded_creative_list"]) {
    for (const param of params) {
      const equals = param.indexOf("=");
      if (param.slice(0, equals) !== name) continue;
      let value;
      try { value = decodeURIComponent(param.slice(equals + 1).replace(/\+/g, " ")); }
      catch (_) { continue; }
      for (const id of value.split(",")) {
        if (!/^[1-9]\d{0,19}$/.test(id)) continue;
        if (id.length === 20 && id > "18446744073709551615") continue;
        if (ids.size < 256) ids.add(id);
        else if (!ids.has(id)) limited = true;
      }
    }
  }
  const data = {
    max_time: 0,
    min_interval: 31536000,
    pull_interval: 31536000,
    keep_ids: [], list: [], event_list: [], preload: [],
    show: [...ids].map(id => ({ id: "bili-expired-id:" + id, stime: 1, etime: 2, ad_cb: "" })),
    splash_request_id: ""
  };
  if (match[1].toLowerCase() === "/x/v2/splash/brand/list") {
    Object.assign(data, {
      forcibly: false, rule: "", has_new_splash_set: false, new_splash_hash: "",
      force_show_times: 0, show_hash: "0", badge_from: "", query_list: null
    });
  }
  const message = { code: 0, message: "OK", ttl: 1, data: /\/brand\/config$/i.test(match[1]) ? {} : data };
  // Serialize numeric IDs from validated wire literals without rounding 64-bit values.
  const body = JSON.stringify(message).replace(/"bili-expired-id:(\d+)"/g, "$1");
  const headers = phase === "response" && typeof $response === "object" ? { ...$response.headers } : {};
  for (const name of Object.keys(headers)) {
    if (/^(?:content-(?:type|length|encoding)|transfer-encoding|cache-control|etag)$/i.test(name)) delete headers[name];
  }
  Object.assign(headers, { "Content-Type": "application/json", "Content-Length": String(body.length), "Cache-Control": "no-store" });
  console.log("Bilibili splash expiry: version=20261020.3 phase=" + phase + " path=" + match[1] +
    " schedules=" + (message.data.show ? message.data.show.length : 0) + " id_limit=" + limited + " bytes=" + body.length);
  $done(phase === "request" ? { response: { status: 200, headers, body } } : { headers, body });
})();
