// SPDX-License-Identifier: GPL-3.0-only
// Adapted from zirawell/R-Store cb61657d11df96473c8cf6188e695fe867357349;
// see dianping-splash-request.LICENSE. Classify before downloading the image body.
(function () {
  const url = $request.url || "";
  if (!/^https?:\/\/img\.meituan\.net\/dpmobile\//i.test(url)) {
    $done({});
    return;
  }
  const headers = $request.headers || {};
  const keys = Object.keys(headers).filter(key => headers[key]);
  const tracedAd = keys.some(key => /^m-(shark-)?traceid$/i.test(key)) &&
    !keys.some(key => /^(ai|dt|al|u)$/i.test(key));
  const assetPath = url.split(/[?#]/)[0];
  const animatedAd = /\.gif(?:@|$)/i.test(assetPath) || /[?&]lossless=1(?:[&#]|$)/i.test(url);
  if (!tracedAd && !animatedAd) {
    $done({});
    return;
  }
  console.log("Dianping splash: version=20261024.1 reason=" + (tracedAd ? "trace" : "animated"));
  const response = {
    status: tracedAd ? 404 : 200,
    headers: {
      "Content-Type": tracedAd ? "text/plain" : "image/gif",
      "Content-Length": tracedAd ? "0" : "42",
      "Cache-Control": "no-store"
    },
    body: tracedAd ? "" : "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
  };
  if (!tracedAd) response["body-base64"] = true;
  $done({ response });
})();
