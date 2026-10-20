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
      for (const key of ['list', 'keep_ids', 'preload', 'event_list']) assert.deepEqual(parsed.data[key], []);
      assert.equal(parsed.data.show.length, 3);
      for (const schedule of parsed.data.show) assert(schedule.stime > 0 && schedule.etime < 1000000000 && schedule.stime < schedule.etime);
      assert.match(reply.body, /"id":9223372036854775807,/);
      assert.doesNotMatch(reply.body, /123456|private-token|bili-expired-id/);
    }
    assert.doesNotMatch(logs.join(''), /5380|5381|922337|123456|private-token|access_key/);
    assert.match(logs[0], endpoint === 'brand/config' ? /schedules=0 id_limit=false/ : /schedules=3 id_limit=false/);
  }
}
for (const url of ['https://app.bilibili.com/x/v2/feed/index', 'https://app.bilibili.com/x/v2/splash/list2', 'https://app.bilibili.com/x/v2/splash/brand/configuration', 'https://example.com/x/v2/splash/list']) {
  assert.deepEqual(run(url).result, {});
}
assert.deepEqual(run('https://app.bilibili.com/x/v2/splash/list', 'other').result, {});
assert.deepEqual(JSON.parse(run('https://app.bilibili.com/x/v2/splash/list').reply.body).data.show, []);
const invalid = run('https://app.bilibili.com/x/v2/splash/list?loaded_creative_list=%22%7D%5D%7D%2C0001%2C-2%2C1.2%2C0%2C99999999999999999999');
assert.deepEqual(JSON.parse(invalid.reply.body).data.show, []);
assert.deepEqual(JSON.parse(run('https://app.bilibili.com/x/v2/splash/list?loaded_creative_list=%zz&topview_ids=5380').reply.body).data.show.map(x => x.id), [5380]);
const many = run('https://app.bilibili.com/x/v2/splash/list?loaded_creative_list=' + Array.from({ length: 300 }, (_, i) => i + 1).join(',') + '&topview_ids=9999');
assert.equal(JSON.parse(many.reply.body).data.show.length, 256);
assert.equal(JSON.parse(many.reply.body).data.show[0].id, 9999);
assert.match(many.logs[0], /id_limit=true/);
const rules = moduleText.split('\n').filter(line => line.includes('/bilibili-splash-expire.js?'));
assert.equal(rules.length, 2);
for (const rule of rules) {
  assert.doesNotMatch(rule, /engine=webview|binary-body-mode=true/);
  if (rule.includes('type=http-request,')) assert.doesNotMatch(rule, /requires-body=true/);
  else assert.match(rule, /requires-body=true, max-size=-1/);
  const regex = new RegExp(rule.split('pattern=')[1].split(', script-path=')[0].replace(/^\(\?i\)/, ''), 'i');
  assert(regex.test('https://app.bilibili.com/x/v2/splash/list' + query));
  assert(!regex.test('https://app.bilibili.com/x/v2/feed/index'));
}
console.log('Bilibili splash expiry checks passed');
