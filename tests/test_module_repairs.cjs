const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

// Exercise the native jq filter against cached splash settings and unrelated map data.
const amap = read('modules/Amap.sgmodule');
const filter = amap.split('\n').find(l => l.startsWith('http-response-jq') && l.includes('frogserver')).match(/ '(.+)'$/)[1];
const clean = data => JSON.parse(execFileSync('jq', ['-c', filter], { input: JSON.stringify(data) }));
for (const data of [{}, { splashscreen: { value: 'cached-ad', version: 'old' } }]) {
  const result = clean({ data: { ...data, _user_profile_: { value: 'keep' } }, code: 1 });
  for (const key of ['SplashScreenControl', 'splashscreen', 'splashview_config']) {
    assert.deepEqual(result.data[key], { status: 1, version: '', value: '' });
  }
  assert.deepEqual(result.data._user_profile_, { value: 'keep' });
  assert.equal(result.code, 1);
}
assert.deepEqual(clean({ code: 0, data: null }), { code: 0, data: null });
const splashLine = amap.split('\n').find(l => l.includes('splash_screen') && l.includes('data='));
const literal = splashLine.match(/data=("(?:\\.|[^"\\])*")/)[1];
assert.deepEqual(JSON.parse(JSON.parse(literal)).data.ad, []);

// The replacement preserves the original form rewrite, including intervening parameters.
const script = read('scripts/tencent-video-request.js');
function rewrite(body) {
  let result;
  vm.runInNewContext(script, { $request: { body }, $done: value => { result = JSON.parse(JSON.stringify(value)); } });
  return result;
}
assert.equal(rewrite('a=1&sppreviewtype=3&vid=abc&spsrt=9&b=2').body,
  'a=1&sppreviewtype=0&vid=abc&spsrt=0&b=2');
assert.equal(rewrite('a=1&vid=abc').body, 'a=1&vid=abc');
assert.deepEqual(rewrite(undefined), {});

// Prevent the observed missing browser APIs and malformed Bilibili JSON arguments recurring.
for (const module of ['Bilibili', 'AppleWeather', 'NeteaseCloudMusic']) {
  const text = read(`modules/${module}.sgmodule`);
  for (const line of text.split('\n').filter(l => l.includes('script-path='))) {
    assert.match(line, /engine=webview/);
  }
}
const bili = read('modules/Bilibili.sgmodule');
// Splash replies must clear each advertised list and work without browser-only globals.
const splashScript = read('scripts/bilibili-splash.js');
const splashRule = bili.split('\n').find(l => l.startsWith('开屏空列表 ='));
assert.match(splashRule, /type=http-request/);
assert.match(splashRule, /script-path=https:\/\/raw\.githubusercontent\.com\/wyih\/Shadowrocket-ADBlock-Rules-Forever\/tailscale\/scripts\/bilibili-splash\.js/);
const splashPattern = new RegExp(splashRule.split('pattern=(?i)')[1].split(', script-path=')[0], 'i');
function splashReply(url) {
  let result;
  vm.runInNewContext(splashScript, {
    $request: { url },
    $done: value => { result = JSON.parse(JSON.stringify(value)); }
  });
  return result;
}
for (const endpoint of ['list', 'show', 'event/list2', 'brand/list']) {
  for (const query of ['', '?build=123&test=1']) {
    const url = `https://app.bilibili.com/x/v2/splash/${endpoint}${query}`;
    assert(splashPattern.test(url));
    const { response } = splashReply(url);
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'application/json');
    assert.equal(Number(response.headers['Content-Length']), Buffer.byteLength(response.body));
    const payload = JSON.parse(response.body);
    assert.equal(payload.code, 0);
    assert.equal(payload.data.max_time, 0);
    for (const field of ['list', 'show', 'event_list', 'keep_ids']) {
      assert.deepEqual(payload.data[field], []);
    }
  }
}
for (const url of [
  'https://app.bilibili.com/x/v2/feed/index?test=1',
  'https://app.bilibili.com/x/v2/splash/list2',
  'https://example.com/x/v2/splash/list'
]) {
  assert(!splashPattern.test(url));
  assert.deepEqual(splashReply(url), {});
}
assert(!bili.split('\n').some(l => l.includes('splash') && l.includes('data-type=')));
for (const line of bili.split('\n').filter(l => l.includes('argument='))) {
  const raw = line.split('argument=')[1].slice(1, -1)
    .replace(/\{\{\{purifyComment\}\}\}/g, 'true')
    .replace(/\{\{\{[^}]+\}\}\}/g, 'test');
  const args = JSON.parse(raw);
  if ('purifyComment' in args) assert.equal(typeof args.purifyComment, 'boolean');
}
for (const module of ['Bilibili', 'Amap', 'AppleWeather', 'NeteaseCloudMusic', 'TencentVideo', 'Iqiyi']) {
  const text = read(`modules/${module}.sgmodule`);
  assert.doesNotMatch(text, /script\.hub|192\.168\.|amap-probe|Bili probe/);
  assert.match(text, new RegExp(`^#!url=https://raw\\.githubusercontent\\.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/${module}\\.sgmodule`));
}
// Empty converted jq expressions are rejected by Shadowrocket's module parser.
const iqiyi = read('modules/Iqiyi.sgmodule');
assert.doesNotMatch(iqiyi, /^http-response-jq .+ ''$/m);
assert.match(iqiyi, /long_video_comments.+has\("alias_name"\)/);
console.log('module repair checks passed');
