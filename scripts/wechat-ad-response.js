// Complete local replies shared by the WeChat, FleaMarket and Bilibili modules. The WebView request
// bridge avoids Shadowrocket build 3445 dropping Map Local bodies over HTTP/2.
// Only module rules select these replies; this is not a filter for arbitrary JSON.
// FCBox's no-ad schemas: qDonl/loon-plugin, c8d3a63653fb2163e6b811eb2f262eb08d071ec4.
const replies = {
  dict: [200, {}],
  "bili-resource": [200, {}],
  "bili-asset": [404, null],
  reject: [404, null],
  "idle-scene": [200, {
    api: "mtop.idle.idleadv.scene.restore",
    data: { trackParams: { stageMatch: "false" } },
    ret: ["SUCCESS::调用成功"],
    v: "1.0"
  }],
  "idle-splash": [200, {
    api: "mtop.taobao.idlecommerce.splash.async.ads",
    data: { adMap: {} },
    ret: ["SUCCESS::调用成功"],
    v: "1.0"
  }],
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
  if (mode === "idle-scene" || mode === "idle-splash") {
    console.log("FleaMarket startup: version=20261016.2 mode=" + mode);
  }
  if (mode === "bili-resource") {
    console.log("Bilibili resource: version=20261017.3 returning-empty-response");
  }
  if (mode === "bili-asset") {
    console.log("Bilibili asset: version=20261017.5 returning-empty-response");
  }
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
