// HTTPDNS interface selection is maintained in modules/HTTPDNS.sgmodule.
// Preserve the original module's two Dida Chuxing resolver exceptions.
const headers = $request.headers || {};
const agentKey = Object.keys(headers).find(key => key.toLowerCase() === "user-agent");
const agent = agentKey ? String(headers[agentKey]) : "";
const dida = /^http:\/\/119\.(?:29\.29|28\.28)\.90(?::80)?\/d\?/.test($request.url) &&
  /^(?:%E5%98%80%E5%97%92%E5%87%BA%E8%A1%8C|嘀嗒出行)/i.test(agent);
if (dida) {
  console.log("HTTPDNS: version=20261017.1 action=allow-dida");
  $done({});
} else {
  console.log("HTTPDNS: version=20261017.1 action=block");
  $done({response: {
    status: 404,
    headers: {
      "Content-Type": "text/plain",
      "Content-Length": "0",
      "Cache-Control": "no-store"
    },
    body: ""
  }});
}
