const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const source = fs.readFileSync(require('node:path').join(__dirname, '../scripts/bilibili-splash-cache.js'), 'utf8');
const md5 = b => crypto.createHash('md5').update(b).digest('hex');
function pack(json, name = "iphone") {
  return execFileSync('python3', ['-c', 'import sys,io,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w",zipfile.ZIP_DEFLATED); z.writestr(sys.argv[1],sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())', name], { input: JSON.stringify(json) });
}
function unpack(bytes) {
  return JSON.parse(execFileSync('python3', ['-c', 'import sys,io,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; sys.stdout.buffer.write(z.read(z.namelist()[0]))'], { input: Buffer.from(bytes), maxBuffer: 5 * 1024 * 1024 }));
}
const bundleUrl = 'https://i0.hdslb.com/bfs/fawkes/dd/iphone/prod/default/40326/iphone_default_40326.zip';
const indexUrl = 'https://i2.hdslb.com/bfs/fawkes/dd/prod/iphone.zip';
const config = { p: 'ios', v: '40326', list: [
  { n: 'splash.splashcache.max_size', v: '128' },
  { n: 'normal.video', v: 'private-test-value', o: { l: 'unchanged' } },
  { n: 'splash.brand_splashcache.max_size', v: '20' }
], tracks: { x: [1, 2] }, props: ['keep'] };
const bundle = pack(config, "iphone_default_40326");
const index = { p: 'ios', v: '40326', version: { default: { v: '40326', u: bundleUrl, m: md5(bundle), d: { 40323: 'diff-url' } }, special: { v: '1', u: 'untouched' } } };
const cache = new Map();
function run(url, body, options = {}) {
  let result, done = 0; const logs = [], requests = [];
  vm.runInNewContext(source, {
    ArrayBuffer, Uint8Array, DataView, TextEncoder, TextDecoder,
    $request: { url, headers: { Authorization: 'private-token', Cookie: 'private-cookie' } },
    $response: { status: options.status || 200, bodyBytes: body, headers: { 'Content-Encoding': 'gzip', ETag: 'old', 'Content-Length': 123, 'X-Keep': 'yes' } },
    $persistentStore: { read: key => cache.get(key), write: (value, key) => { cache.set(key, value); return true; } },
    $utils: { ungzip: data => new Uint8Array(zlib.gunzipSync(data)) },
    $httpClient: { get: (request, callback) => { requests.push(request); callback(options.error, { status: 200 }, options.fetched || bundle); } },
    console: { log: message => logs.push(message) },
    $done: value => { result = value; done++; }
  });
  assert.equal(done, 1);
  assert.doesNotMatch(logs.join(''), /private-token|private-cookie|private-test-value|40323|diff-url/);
  return { result, logs, requests };
}
const first = run(indexUrl, pack(index));
assert.equal(first.requests.length, 1);
assert.deepEqual(JSON.parse(JSON.stringify(first.requests[0])), { url: bundleUrl, timeout: 6, 'binary-mode': true });
const patchedIndex = unpack(first.result.body);
assert.equal(patchedIndex.v, '40327');
assert.deepEqual(patchedIndex.version.special, index.version.special);
assert.equal(patchedIndex.version.default.v, '40327');
assert.deepEqual(patchedIndex.version.default.d, {});
assert.equal(patchedIndex.version.default.u, bundleUrl + '?bili_splash_cache=0');
const second = run(patchedIndex.version.default.u, bundle);
assert.equal(second.requests.length, 0);
assert.equal(md5(Buffer.from(second.result.body)), patchedIndex.version.default.m);
const patched = unpack(second.result.body);
assert.equal(patched.v, '40327');
assert.equal(patched.list.find(e => e.n === 'splash.splashcache.max_size').v, '0');
assert.equal(patched.list.find(e => e.n === 'splash.effect_splashcache.max_size').v, '0');
assert.deepEqual(patched.list.filter(e => !['splash.splashcache.max_size', 'splash.effect_splashcache.max_size'].includes(e.n)), config.list.slice(1));
assert.deepEqual(patched.tracks, config.tracks); assert.deepEqual(patched.props, config.props);
for (const reply of [first.result, second.result]) {
  assert.equal(Number(reply.headers['Content-Length']), reply.body.byteLength);
  assert.equal(reply.headers['X-Keep'], 'yes');
  assert(!('Content-Encoding' in reply.headers)); assert(!('ETag' in reply.headers));
}
const cached = run(indexUrl, pack(index));
assert.equal(cached.requests.length, 0);
assert.deepEqual(Buffer.from(cached.result.body), Buffer.from(first.result.body));
for (const url of [bundleUrl, bundleUrl + '?other=1', indexUrl.replace('i2.hdslb.com', 'example.com'), 'https://app.bilibili.com/x/v2/feed/index']) {
  assert.equal(Object.keys(run(url, bundle).result).length, 0);
}
for (const body of [new Uint8Array(0), bundle.subarray(0, 50), pack({ p: 'ios', list: [] })]) {
  assert.equal(Object.keys(run(patchedIndex.version.default.u, body).result).length, 0);
}
cache.clear();
assert.equal(Object.keys(run(indexUrl, pack(index), { error: 'offline' }).result).length, 0);
assert.equal(Object.keys(run(indexUrl, pack(index), { fetched: pack({ broken: true }) }).result).length, 0);
assert.equal(Object.keys(run(indexUrl, pack(index), { status: 304 }).result).length, 0);
assert.equal(cache.size, 0);
let requestResult;
vm.runInNewContext(source, {
  $argument: 'request', $request: { url: indexUrl, headers: { 'If-None-Match': 'old', 'if-modified-since': 'old', 'X-Keep': 'yes' } },
  $done: value => { requestResult = JSON.parse(JSON.stringify(value)); }
});
assert.deepEqual(requestResult, { headers: { 'X-Keep': 'yes' } });
const moduleText = fs.readFileSync(require('node:path').join(__dirname, '../modules/Bilibili.sgmodule'), 'utf8');
const rules = moduleText.split('\n').filter(line => line.includes('/bilibili-splash-cache.js?'));
assert.equal(rules.length, 2);
const responseRule = rules.find(line => line.includes('type=http-response'));
assert.match(responseRule, /requires-body=true, binary-body-mode=true, engine=webview/);
const pattern = new RegExp(responseRule.split('pattern=')[1].split(', script-path=')[0].replace(/^\(\?i\)/, ''), 'i');
assert(pattern.test(indexUrl)); assert(pattern.test(indexUrl.replace('/prod/', '/prod/40326/')));
assert(pattern.test(patchedIndex.version.default.u));
for (const url of [bundleUrl, bundleUrl + '?other=1', 'https://i0.hdslb.com/bfs/archive/cover.jpg', 'https://i0.hdslb.com/bfs/fawkes/ff/prod/iphone.zip']) assert(!pattern.test(url));
console.log('Bilibili splash cache: ZIP/MD5 pair, setting preservation, cached index, failures and privacy passed');

// Optional live public pair; content is never emitted or added to the repository.
if (process.argv[2] && process.argv[3]) {
  const liveIndex = fs.readFileSync(process.argv[2]), liveBundle = fs.readFileSync(process.argv[3]);
  const originalConfig = unpack(liveBundle);
  const live = run(indexUrl, liveIndex, { fetched: liveBundle });
  const next = unpack(live.result.body);
  const rewritten = run(next.version.default.u, liveBundle);
  assert.equal(md5(Buffer.from(rewritten.result.body)), next.version.default.m);
  const actual = unpack(rewritten.result.body);
  const omit = c => c.list.filter(e => !['splash.splashcache.max_size', 'splash.effect_splashcache.max_size'].includes(e.n));
  assert.deepEqual(omit(actual), omit(originalConfig));
  assert.deepEqual(actual.tracks, originalConfig.tracks); assert.deepEqual(actual.props, originalConfig.props);
  console.log('Live Fawkes pair passed; preserved entries=' + omit(actual).length + ', rewritten bytes=' + rewritten.result.body.byteLength);
}
