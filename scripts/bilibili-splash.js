// Return a complete JSON response so cached splash ads are cleared over HTTP/1.1 and HTTP/2.
// Limit the response to the observed splash endpoints; all other requests pass through.
if (/^https:\/\/app\.bilibili\.com\/x\/v2\/splash\/(?:list|show|event\/list2|brand\/list)(?:\?|$)/i.test($request.url)) {
  const body = JSON.stringify({
    code: 0,
    message: "OK",
    ttl: 1,
    data: {
      max_time: 0,
      min_interval: 31536000,
      pull_interval: 31536000,
      keep_ids: [],
      list: [],
      show: [],
      event_list: [],
      splash_request_id: ""
    }
  });
  $done({
    response: {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(body.length),
        "Cache-Control": "no-store"
      },
      body
    }
  });
} else {
  $done({});
}
