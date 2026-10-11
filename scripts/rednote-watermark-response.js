// Shadowrocket: use engine=webview so the binary response crosses the JSON bridge as Base64.
// Replaces only the static watermark asset; the PNG matches the verified HTTP/1.1 module.
if (/^https:\/\/ci\.xiaohongshu\.com\/system_config\/watermark\/tiny3_100\.jpg(?:\?|$)/i.test($request.url)) {
  $done({
    response: {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": "313"
      },
      body: "iVBORw0KGgoAAAANSUhEUgAAAIoAAABICAYAAAApp23bAAAAAXNSR0IArs4c6QAAAPNJREFUeJztzrEJADAQxLDL/ktnhe+MwYV6bdtLDvBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBAHPBABD5ZdSbRtmSyIgAAAABJRU5ErkJggg==",
      "body-base64": true
    }
  });
} else {
  $done({});
}
