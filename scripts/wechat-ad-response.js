// Complete local replies for the existing WeChat modules. The WebView request
// bridge avoids Shadowrocket build 3445 dropping Map Local bodies over HTTP/2.
// Only module rules select these replies; this is not a filter for arbitrary JSON.
// FCBox's no-ad schemas: qDonl/loon-plugin, c8d3a63653fb2163e6b811eb2f262eb08d071ec4.
const replies = {
  dict: [200, {}],
  reject: [404, null],
  "fcbox-dsp": [200, {
    code: "370100000",
    msg: "操作成功",
    data: null,
    extendsMap: {
      wxAdsFlag: "false",
      fcDspFlag: "true",
      interstitialErrSwitch: "true"
    },
    extendsData: null
  }],
  "fcbox-positions": [200, {
    success: true,
    code: 200100000,
    msg: "操作成功",
    data: []
  }]
};
const mode = typeof $argument === "string" ? $argument : "";
if (Object.prototype.hasOwnProperty.call(replies, mode)) {
  const [status, value] = replies[mode];
  // Keep the wire body ASCII, including Chinese success text, for byte-accurate
  // Content-Length without requiring TextEncoder in the proxy's script engine.
  const body = value === null ? "" : JSON.stringify(value).replace(/[\u007f-\uffff]/g,
    char => "\\u" + char.charCodeAt(0).toString(16).padStart(4, "0"));
  $done({response: {
    status,
    headers: {
      "Content-Type": value === null ? "text/plain" : "application/json",
      "Content-Length": String(body.length),
      "Cache-Control": "no-store"
    },
    body
  }});
} else {
  $done({});
}
