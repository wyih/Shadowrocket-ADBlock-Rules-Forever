const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { gzipSync, gunzipSync } = require('node:zlib');
const source = fs.readFileSync(path.join(__dirname, '../scripts/bilibili-startup-trace.js'), 'utf8');
const moduleText = fs.readFileSync(path.join(__dirname, '../modules/Bilibili.sgmodule'), 'utf8');
const url = 'https://grpc.biliapi.net/bilibili.app.coldstart.v1.ColdStart/GetColdStartDeferredData';
function frame(text, compressed = 0) {
  const payload = Buffer.from(text), header = Buffer.alloc(5);
  header[0] = compressed;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
function run(phase, body, requestUrl = url, headers = {}, utils = { ungzip: data => {
  // Shadowrocket's native bridge obtains the backing-store pointer without adding byteOffset.
  assert.equal(data.byteOffset, 0);
  return new Uint8Array(gunzipSync(data));
} }) {
  const logs = []; let result;
  const message = { body, headers };
  const env = { $argument: phase, $utils: utils, $request: { url: requestUrl, ...(phase === 'request' ? message : {}) },
    $response: message, console: { log: text => logs.push(text) },
    $done: value => { result = JSON.parse(JSON.stringify(value)); } };
  vm.runInNewContext(source, env);
  return { result, logs };
}
const fixture = frame('private-account-token https://i0.hdslb.com/bfs/sycp/img/test.webp?token=private-query ' +
  'https://shop.example/private-path /x/v2/splash/list?access_key=private-key');
const before = Buffer.from(fixture);
const response = run('response', fixture);
assert.deepEqual(response.result, {});
assert.deepEqual(fixture, before);
assert.match(response.logs[0], /frames=1 compressed=0 decoded=\d+ decode_failures=0 complete=true/);
assert.match(response.logs[0], /i0\.hdslb\.com\/bfs\/sycp\/img\/test\.webp/);
assert.match(response.logs[0], /apis=\["\/x\/v2\/splash\/list"\]/);
assert.doesNotMatch(response.logs.join(''), /private-|shop\.example|token=|access_key=/);
const headers = { 'Grpc-Accept-Encoding': 'gzip', authorization: 'keep-private', other: 'keep' };
const request = run('request', frame(''), url, headers);
assert.deepEqual(request.result, {});
assert.deepEqual(headers, { 'Grpc-Accept-Encoding': 'gzip', authorization: 'keep-private', other: 'keep' });
assert.doesNotMatch(request.logs.join(''), /keep-private/);
// The real phone sent compressed frames despite the prior identity negotiation.
const compressedPayload = gzipSync(fixture.subarray(5));
const compressedFrame = frame(compressedPayload, 1);
for (const phase of ['request', 'response']) {
  const traced = run(phase, compressedFrame, url, { 'grpc-encoding': 'gzip' });
  assert.deepEqual(traced.result, {});
  assert.match(traced.logs[0], /compressed=1 decoded=\d+ decode_failures=0/);
  assert.match(traced.logs[0], /encoding=gzip/);
  assert.match(traced.logs[0], /i0\.hdslb\.com\/bfs\/sycp\/img\/test\.webp/);
  assert.doesNotMatch(traced.logs.join(''), /private-|token=|access_key=/);
}
assert.deepEqual(compressedFrame.subarray(5), compressedPayload);
assert.match(run('response', frame('invalid-gzip-private', 1)).logs[0], /compressed=1 decoded=0 decode_failures=1/);
assert.doesNotMatch(run('response', frame('invalid-gzip-private', 1)).logs[0], /invalid-gzip-private/);
assert.match(run('response', compressedFrame, url, {}, {}).logs[0], /decode_failures=1/);
const escaped = frame('https:\\/\\/i0.hdslb.com\\/bfs\\/sycp_brand\\/img\\/test.webp?token=private');
assert.match(run('response', escaped).logs[0], /sycp_brand\/img\/test\.webp/);
assert.match(run('response', Buffer.from([0, 0, 0])).logs[0], /complete=false/);
assert.match(run('response', Buffer.concat([frame(''), frame('')])).logs[0], /frames=2/);
assert.match(run('response', undefined).logs[0], /bytes=0 frames=0/);
assert.deepEqual(run('response', fixture, url + 'Extra').result, {});
assert.equal(run('response', fixture, url + 'Extra').logs.length, 0);
assert.equal(run('other', fixture).logs.length, 0);
// A public URL crossing a scan block is captured once, with bounded samples.
const crossing = frame(' '.repeat(4080) + 'https://i0.hdslb.com/bfs/sycp_brand/img/test.webp?secret=private');
assert.match(run('response', crossing).logs[0], /sycp_brand\/img\/test\.webp/);
function bytesField(number, value) {
  const bytes = Buffer.from(value), length = []; let n = bytes.length;
  do { length.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while (n);
  return Buffer.concat([Buffer.from([number * 8 + 2, ...length]), bytes]);
}
const inner = bytesField(2, gzipSync(fixture.subarray(5)));
const envelope = bytesField(1, inner);
const nested = run('response', frame(gzipSync(envelope), 1));
assert.match(nested.logs[0], /fields=\["1:2:\d+","1.2:2:\d+"\]/);
assert.match(nested.logs[0], /formats=\["1.2:gzip:\d+"\]/);
assert.match(nested.logs[0], /nested_decoded=\d+ nested_failures=0 inspect_limit=false/);
assert.match(nested.logs[0], /i0\.hdslb\.com\/bfs\/sycp\/img\/test\.webp/);
assert.doesNotMatch(nested.logs.join(''), /private-|token=|access_key=/);
assert.match(run('response', frame(bytesField(1, Buffer.from([31, 139, 1])))).logs[0], /nested_failures=1/);
const json = frame('{"splash":"private-account","payload":"private-value","ad_info":{},"rpc":"bilibili.app.resource.v1.Module/List"}');
const jsonTrace = run('response', json).logs[0];
assert.match(jsonTrace, /rpcs=\["bilibili.app.resource.v1.Module\/List"\]/);
assert.match(jsonTrace, /markers=\["splash","ad_info"\]/);
assert.match(jsonTrace, /formats=\[":json-like:\d+"\]/);
assert.doesNotMatch(jsonTrace, /private-|payload/);
assert.match(run('response', frame('H4sIprivate-value')).logs[0], /base64-gzip-like:/);
assert.match(run('response', frame(Buffer.from([120, 156, 1, 2]))).logs[0], /zlib-like:/);
assert.match(run('response', frame(Buffer.from([10, 255, 255, 255, 255, 127]))).logs[0], /fields=\[\]/);
const many = frame(Buffer.concat(Array.from({ length: 65 }, () => bytesField(1, 'private-field'))));
assert.match(run('response', many).logs[0], /inspect_limit=true/);
assert.doesNotMatch(run('response', many).logs[0], /private-field/);
const rules = moduleText.split('\n').filter(line => line.includes('/bilibili-startup-trace.js?'));
assert.equal(rules.length, 2);
for (const rule of rules) {
  const pattern = new RegExp(rule.split('pattern=')[1].split(', script-path=')[0].replace(/^\(\?i\)/, ''), 'i');
  assert(pattern.test(url));
  assert(pattern.test(url.replace('grpc.biliapi.net', 'app.bilibili.com')));
  assert(!pattern.test(url + 'Extra'));
  assert(!pattern.test('https://app.bilibili.com/x/v2/feed/index'));
  assert.match(rule, /binary-body-mode=true/);
  assert.doesNotMatch(rule, /engine=webview/);
}
console.log('Bilibili startup trace checks passed');
