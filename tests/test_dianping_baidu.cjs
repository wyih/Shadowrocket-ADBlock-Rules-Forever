const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const regex = pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'i' : '');
const dianping = read('modules/Dianping.sgmodule');
const source = read('scripts/dianping-splash-request.js');
const imagePattern = regex(dianping.match(/pattern=(\S+), script-path=/)[1]);
const configPattern = regex(dianping.split('\n').find(line => line.endsWith(' - reject')).split(' ')[0]);
const imageUrl = 'https://img.meituan.net/dpmobile/creative.jpg';

function image(url, headers = {}) {
  let result;
  let calls = 0;
  const logs = [];
  vm.runInNewContext(source, {
    $request: { url, headers },
    $done: value => { result = value; calls++; },
    console: { log: value => logs.push(value) }
  });
  assert.equal(calls, 1);
  assert(logs.every(log => !log.includes(url) && !log.includes('private-token')));
  return JSON.parse(JSON.stringify(result));
}

for (const header of ['m-traceid', 'M-Shark-TraceId']) {
  const result = image(imageUrl + '?token=private-token', { [header]: 'trace' }).response;
  assert.equal(result.status, 404);
  assert.equal(result.body, '');
  assert.equal(result.headers['Content-Length'], '0');
  for (const business of ['ai', 'DT', 'Al', 'u']) {
    assert.deepEqual(image(imageUrl, { [header]: 'trace', [business]: 'ordinary-image' }), {});
  }
}
for (const url of [
  imageUrl.replace('.jpg', '.gif'),
  imageUrl.replace('.jpg', '.gif@750w'),
  imageUrl + '?lossless=1&width=750',
  imageUrl + '?width=750&lossless=1'
]) {
  assert(imagePattern.test(url));
  const response = image(url).response;
  assert.equal(response.status, 200);
  assert.equal(response['body-base64'], true);
  const bytes = Buffer.from(response.body, 'base64');
  assert.equal(bytes.length, Number(response.headers['Content-Length']));
  assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
  assert.equal(bytes.readUInt16LE(6), 1);
  assert.equal(bytes.readUInt16LE(8), 1);
}
for (const url of [imageUrl, imageUrl + '?lossless=10', imageUrl + '?redirect=creative.gif', imageUrl + '?redirect=creative.gif.extra']) {
  assert.deepEqual(image(url), {});
}
for (const url of [
  'https://img.meituan.net/food/photo.gif',
  'https://img.meituan.net/dpmobile-extra/photo.gif',
  'https://img.meituan.net.example.org/dpmobile/photo.gif'
]) {
  assert(!imagePattern.test(url));
  assert.deepEqual(image(url, { 'M-TraceId': 'trace' }), {});
}
for (const suffix of ['', '?version=1', '.bin?version=1', '/?version=1']) {
  assert(configPattern.test('https://mapi.dianping.com/mapi/operating/loadsplashconfig' + suffix));
}
for (const suffix of ['Extra', '/business', '.bin.extra']) {
  assert(!configPattern.test('https://mapi.dianping.com/mapi/operating/loadsplashconfig' + suffix));
}
assert.doesNotMatch(dianping, /requires-body|DOMAIN-SUFFIX|ca-p12|^enable\s*=/m);

const baidu = read('modules/BaiduNetDisk.sgmodule');
const mappings = baidu.split('\n').filter(line => line.includes(' data-type=text ')).map(line => {
  const match = line.match(/^(\S+) data-type=text data=("(?:\\.|[^"\\])*") status-code=200 header="Content-Type:application\/json"$/);
  assert(match, line);
  return { pattern: regex(match[1]), body: JSON.parse(JSON.parse(match[2])) };
});
const matched = url => mappings.filter(rule => rule.pattern.test(url));
const prefix = 'https://pan.baidu.com';
for (const endpoint of [
  '/api/getconfig', '/api/getsyscfg', '/api/taskscore/tasklist',
  '/act/api/activityentry', '/rest/2.0/pcs/adv', '/api/plugin/get', '/recommend/query/list'
]) {
  assert.deepEqual(matched(prefix + endpoint + '?clienttype=1').map(rule => rule.body), [{}]);
}
for (const query of ['type=splashMode', 'clienttype=1&type=splashMode', 'type=splashMode&version=13.34.0']) {
  assert.deepEqual(matched(prefix + '/buy/ad/conf?' + query).map(rule => rule.body), [{ errno: 0, data: {} }]);
}
assert.deepEqual(matched(prefix + '/buy/ad/get?pathname=%2F8001%2FhomeHeaderIOS').map(rule => rule.body), [{ errno: 0, data: {} }]);
for (const endpoint of [
  '/buy/ad/conf?type=other', '/buy/ad/conf?type=splashModeExtra', '/buy/ad/conf?prototype=splashMode',
  '/buy/ad/getExtra?test=1', '/buy/ad/get/file', '/buy/ad/analytics?test=1',
  '/api/list?dir=/', '/api/download?test=1', '/rest/2.0/pcs/file?method=upload',
  '/rest/2.0/membership/user?method=query', '/rest/2.0/xpan/file?method=list'
]) assert.equal(matched(prefix + endpoint).length, 0, endpoint);
assert.equal(matched('https://pan.baidu.com.example.org/buy/ad/get?test=1').length, 0);
const [, filter] = baidu.match(/^http-response-jq \S+ '(.+)'$/m);
const value = { errno: 0, data: { data: ['novel', 'shortplay', 'print', 'job_hunt', 'file', 'photo'].map(type => ({ type })) }, keep: true };
const rewritten = JSON.parse(execFileSync('jq', ['-c', filter], { input: JSON.stringify(value) }));
assert.deepEqual(rewritten, { ...value, data: { data: [{ type: 'file' }, { type: 'photo' }] } });
assert.doesNotMatch(baidu, /^DOMAIN|\[Script\]|ca-p12|^enable\s*=/m);
assert.match(baidu, /hostname = %APPEND% pan\.baidu\.com\s*$/);
console.log('Dianping/BaiduNetDisk: splash matching, image replies, original filters and file-operation boundaries passed');
