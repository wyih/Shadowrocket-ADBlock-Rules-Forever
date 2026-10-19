const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/bilibili-startup-trace.js'), 'utf8');
const moduleText = fs.readFileSync(path.join(__dirname, '../modules/Bilibili.sgmodule'), 'utf8');
const url = 'https://grpc.biliapi.net/bilibili.app.coldstart.v1.ColdStart/GetColdStartDeferredData';
function frame(text, compressed = 0) {
  const payload = Buffer.from(text), header = Buffer.alloc(5);
  header[0] = compressed;
  header.writeUInt32BE(payload.length, 1);
  return Buffer.concat([header, payload]);
}
function run(phase, body, requestUrl = url, headers = {}) {
  const logs = []; let result;
  const message = { body, headers };
  const env = { $argument: phase, $request: { url: requestUrl, ...(phase === 'request' ? message : {}) },
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
assert.match(response.logs[0], /frames=1 compressed=0 complete=true/);
assert.match(response.logs[0], /i0\.hdslb\.com\/bfs\/sycp\/img\/test\.webp/);
assert.match(response.logs[0], /apis=\["\/x\/v2\/splash\/list"\]/);
assert.doesNotMatch(response.logs.join(''), /private-|shop\.example|token=|access_key=/);
const request = run('request', frame(''), url, { 'Grpc-Accept-Encoding': 'gzip', authorization: 'keep-private', other: 'keep' });
assert.deepEqual(request.result, { headers: { authorization: 'keep-private', other: 'keep', 'grpc-accept-encoding': 'identity' } });
assert.doesNotMatch(request.logs.join(''), /keep-private/);
assert.match(run('response', frame('private-compressed', 1)).logs[0], /compressed=1/);
assert.doesNotMatch(run('response', frame('private-compressed', 1)).logs[0], /private-compressed/);
assert.match(run('response', Buffer.from([0, 0, 0])).logs[0], /complete=false/);
assert.match(run('response', Buffer.concat([frame(''), frame('')])).logs[0], /frames=2/);
assert.match(run('response', undefined).logs[0], /bytes=0 frames=0/);
assert.deepEqual(run('response', fixture, url + 'Extra').result, {});
assert.equal(run('response', fixture, url + 'Extra').logs.length, 0);
assert.equal(run('other', fixture).logs.length, 0);
// A public URL crossing a scan block is captured once, with bounded samples.
const crossing = frame(' '.repeat(4080) + 'https://i0.hdslb.com/bfs/sycp_brand/img/test.webp?secret=private');
assert.match(run('response', crossing).logs[0], /sycp_brand\/img\/test\.webp/);
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
