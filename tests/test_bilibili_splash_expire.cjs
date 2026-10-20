const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../scripts/bilibili-splash-expire.js'), 'utf8');
const moduleText = fs.readFileSync(path.join(__dirname, '../modules/Bilibili.sgmodule'), 'utf8');
function run(url, phase = 'request') {
  let result; const logs = [];
  const response = { headers: { 'content-encoding': 'gzip', 'Content-length': '2000000', ETag: 'old-body', 'X-Keep': 'keep' } };
  Object.defineProperty(response, 'body', { get() { throw new Error('must not read the origin body'); } });
  vm.runInNewContext(source, { $request: { url }, $argument: phase,
    ...(phase === 'response' ? { $response: response } : {}),
    console: { log: s => logs.push(s) }, $done: value => { result = JSON.parse(JSON.stringify(value)); } });
  return { result, logs, reply: phase === 'request' ? result.response : result };
}
const query = '?topview_ids=5380&loaded_creative_list=5380%2C5381%2C9223372036854775807&access_key=private-token&client_keep_ids=123456';
for (const endpoint of ['list', 'show', 'event/list2', 'brand/list', 'brand/config']) {
  for (const phase of ['request', 'response']) {
    const { reply, logs } = run('https://app.bilibili.com/x/v2/splash/' + endpoint + query, phase);
    const parsed = JSON.parse(reply.body);
    assert.equal(parsed.code, 0);
    assert.equal(Number(reply.headers['Content-Length']), Buffer.byteLength(reply.body));
    assert.equal(reply.headers['Cache-Control'], 'no-store');
    if (phase === 'request') assert.equal(reply.status, 200);
    if (phase === 'response') {
      assert.equal(reply.headers['X-Keep'], 'keep');
      assert(!('content-encoding' in reply.headers)); assert(!('ETag' in reply.headers));
    }
    if (endpoint === 'brand/config') assert.deepEqual(parsed.data, {});
    else {
      for (const key of ['show', 'resources', 'keep_ids', 'preload', 'event_list']) assert.deepEqual(parsed.data[key], []);
      assert.equal(parsed.data.max_time, 0);
      assert.equal(parsed.data.list.length, endpoint === 'list' ? 1 : 0);
      if (endpoint === 'list') {
        const retired = parsed.data.list[0];
        assert.equal(retired.id, 1);
        assert.equal(retired.duration, 0);
        assert(retired.begin_time > 0 && retired.begin_time < retired.end_time && retired.end_time < 1000000000);
        for (const key of ['thumb', 'hash', 'video_url', 'video_hash', 'logo_url', 'logo_hash', 'uri', 'schema', 'ad_cb']) assert.equal(retired[key], '');
        for (const key of ['is_ad', 'is_topview', 'enable_pre_download', 'enable_background_download']) assert.equal(retired[key], false);
      }
      assert.doesNotMatch(reply.body, /5380|5381|922337|123456|private-token|bili-expired-id/);
    }
    assert.doesNotMatch(logs.join(''), /5380|5381|922337|123456|private-token|access_key/);
    assert.match(logs[0], /version=20261020\.4/);
    assert.match(logs[0], endpoint === 'list' ? /list=1 schedules=0/ : /list=0 schedules=0/);
  }
}
for (const url of ['https://app.bilibili.com/x/v2/feed/index', 'https://app.bilibili.com/x/v2/splash/list2', 'https://app.bilibili.com/x/v2/splash/brand/configuration', 'https://example.com/x/v2/splash/list']) {
  assert.deepEqual(run(url).result, {});
}
assert.deepEqual(run('https://app.bilibili.com/x/v2/splash/list', 'other').result, {});
// Neither malformed, secret-bearing nor very large ID inventories can become new schedules.
const canonical = run('https://app.bilibili.com/x/v2/splash/list').reply.body;
for (const suffix of [query, '?loaded_creative_list=%zz&topview_ids=5380',
  '?loaded_creative_list=%22%7D%5D%7D%2C0001%2C-2%2C1.2%2C0%2C99999999999999999999',
  '?loaded_creative_list=' + Array.from({ length: 300 }, (_, i) => i + 1).join(',')]) {
  assert.equal(run('https://app.bilibili.com/x/v2/splash/list' + suffix).reply.body, canonical);
}
const rules = moduleText.split('\n').filter(line => line.includes('/bilibili-splash-expire.js?'));
assert.equal(rules.length, 2);
for (const rule of rules) {
  assert.doesNotMatch(rule, /engine=webview|binary-body-mode=true/);
  assert.match(rule, /v=20261020\.4/);
  if (rule.includes('type=http-request,')) assert.doesNotMatch(rule, /requires-body=true/);
  else assert.match(rule, /requires-body=true, max-size=-1/);
  const regex = new RegExp(rule.split('pattern=')[1].split(', script-path=')[0].replace(/^\(\?i\)/, ''), 'i');
  assert(regex.test('https://app.bilibili.com/x/v2/splash/list' + query));
  assert(!regex.test('https://app.bilibili.com/x/v2/feed/index'));
}
console.log('Bilibili splash inventory replacement checks passed');
