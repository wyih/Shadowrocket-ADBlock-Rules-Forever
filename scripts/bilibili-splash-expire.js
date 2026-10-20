// Replace persisted splash inventory with an expired entry that has no media or links.
(function () {
  const url = $request.url;
  const match = /^https:\/\/app\.bilibili\.com(\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/(?:list|config)))(?:\?|$)/i.exec(url);
  const phase = typeof $argument === "string" ? $argument : "";
  if (!match || !["request", "response"].includes(phase)) return $done({});
  const isList = match[1].toLowerCase() === "/x/v2/splash/list";
  // iOS 8.89 skips persistence for an empty list; an inert entry enters replacement.
  const retired = {
    id: 1, type: 0, splash_type: 0, duration: 0, begin_time: 1, end_time: 2,
    thumb: "", hash: "", video_url: "", video_hash: "", logo_url: "", logo_hash: "",
    uri: "", schema: "", ad_cb: "", is_ad: false, is_topview: false,
    enable_pre_download: false, enable_background_download: false
  };
  const data = {
    max_time: 0,
    min_interval: 31536000,
    pull_interval: 31536000,
    keep_ids: [], list: isList ? [retired] : [], resources: [], event_list: [], preload: [],
    show: [],
    splash_request_id: ""
  };
  if (match[1].toLowerCase() === "/x/v2/splash/brand/list") {
    Object.assign(data, {
      forcibly: false, rule: "", has_new_splash_set: false, new_splash_hash: "",
      force_show_times: 0, show_hash: "0", badge_from: "", query_list: null
    });
  }
  const message = { code: 0, message: "OK", ttl: 1, data: /\/brand\/config$/i.test(match[1]) ? {} : data };
  const body = JSON.stringify(message);
  const headers = phase === "response" && typeof $response === "object" ? { ...$response.headers } : {};
  for (const name of Object.keys(headers)) {
    if (/^(?:content-(?:type|length|encoding)|transfer-encoding|cache-control|etag)$/i.test(name)) delete headers[name];
  }
  Object.assign(headers, { "Content-Type": "application/json", "Content-Length": String(body.length), "Cache-Control": "no-store" });
  console.log("Bilibili splash reset: version=20261020.4 phase=" + phase + " path=" + match[1] +
    " list=" + (message.data.list ? message.data.list.length : 0) + " schedules=0 bytes=" + body.length);
  $done(phase === "request" ? { response: { status: 200, headers, body } } : { headers, body });
})();
