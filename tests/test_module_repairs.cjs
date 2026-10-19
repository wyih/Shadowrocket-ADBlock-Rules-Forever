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
    if (module === 'Bilibili' && (line.startsWith('开屏素材失效 =') || line.includes('/bilibili-startup-trace.js?'))) continue;
    assert.match(line, /engine=webview/);
  }
}
// The calculated AQ scale must have its numeric version removed before Apple's lookup.
const weather = read('modules/AppleWeather.sgmodule');
const scaleRule = weather.split('\n').find(line => line.startsWith('天气空气质量标尺请求 ='));
assert.match(scaleRule, /type=http-request/);
assert.match(scaleRule, /\/v3\.3\.2\/request\.bundle\.js/);
const scalePattern = new RegExp(scaleRule.match(/pattern=\(\?i\)(.*?), script-path=/)[1], 'i');
assert(scalePattern.test('https://weatherkit.apple.com/api/v1/airQualityScale/zh-Hans-US/EU.EAQI.2414'));
assert(!scalePattern.test('https://weatherkit.apple.com/api/v2/weather/zh-Hans-CN/0/0'));
assert.doesNotMatch(weather, /\/v3\.1\.0\//);
// Rewrite-only weather modules also receive Apple's cached, versioned scale names.
const nativeScaleLine = weather.split('\n').find(line => line.startsWith('(?i)^(https?'));
const [nativeScalePattern, nativeScaleReplacement, nativeScaleType] = nativeScaleLine.split(' ');
const nativeScale = new RegExp(nativeScalePattern.slice(4), 'i');
assert.equal(nativeScaleType, 'header');
for (const [source, expected] of [
  ['EU.EAQI.2414', 'EU.EAQI'], ['EPA_NowCast.1', 'EPA_NowCast'],
  ['EU.EAQI.2414?test=1', 'EU.EAQI?test=1'], ['EU.EAQI', 'EU.EAQI']
]) {
  const prefix = 'https://weatherkit.apple.com/api/v1/airQualityScale/zh-Hans-US/';
  assert.equal((prefix + source).replace(nativeScale, nativeScaleReplacement), prefix + expected);
}
assert(!nativeScale.test('https://weatherkit.apple.com/api/v2/weather/zh-Hans-CN/31.368/121.453'));
const bili = read('modules/Bilibili.sgmodule');
// Reject the observed ad endpoint before TLS; do not block shared playback/image hosts.
const biliDomainRejects = bili.split('\n').filter(line => /^DOMAIN(?:-SUFFIX)?,.*?,REJECT$/.test(line));
assert(biliDomainRejects.includes('DOMAIN,cm.bilibili.com,REJECT'));
for (const host of ['app.bilibili.com', 'api.bilibili.com', 'grpc.biliapi.net', 'bilivideo.com', 'hdslb.com']) {
  assert(!biliDomainRejects.some(line => line.split(',')[1] === host));
}
// Preserve the published request-script contract for subscribers not yet updated.
const legacySplashScript = read('scripts/bilibili-splash.js');
function legacyReply(url) {
  let result;
  vm.runInNewContext(legacySplashScript, {
    $request: { url }, console: { log() {} },
    $done: value => { result = JSON.parse(JSON.stringify(value)); }
  });
  return result;
}
for (const endpoint of ['list', 'show', 'event/list2', 'brand/list']) {
  const { response } = legacyReply(`https://app.bilibili.com/x/v2/splash/${endpoint}?test=1`);
  assert.equal(response.status, 200);
  assert.equal(Number(response.headers['Content-Length']), Buffer.byteLength(response.body));
  assert.deepEqual(JSON.parse(response.body).data.list, []);
}
// New modules must let the real response reach the schedule filter.
const splashRule = bili.split('\n').find(l => l.startsWith('开屏素材失效 ='));
assert.match(splashRule, /type=http-response/);
assert.match(splashRule, /requires-body=true/);
assert.match(splashRule, /bilibili-splash-response\.js\?v=20261018\.2,/);
assert.doesNotMatch(splashRule, /engine=webview/);
assert(!bili.split('\n').some(l => l.includes('splash') && (l.includes('data-type=') || l.includes('type=http-request'))));
const compatScript = read('scripts/bilibili-protobuf-compat.js');
function runCompat(argument, cache = new Map(), status = 200) {
  let result;
  const downloads = [];
  vm.runInNewContext(compatScript, {
    $argument: argument,
    $persistentStore: {
      read: key => cache.get(key),
      write: (value, key) => cache.set(key, value)
    },
    $httpClient: {
      get: (options, callback) => {
        downloads.push(options.url);
        callback(null, { status }, '$done({parsed: JSON.parse($argument)});');
      }
    },
    console: { log() {} },
    $done: value => { result = JSON.parse(JSON.stringify(value)); }
  });
  return { result, downloads };
}
// Exercise the configured rules, including a disabled comment filter and quoted legacy values.
for (const line of bili.split('\n').filter(l => l.includes('bilibili-protobuf-compat.js') && l.includes('argument='))) {
  assert.match(line, /script-path=.*\/bilibili-protobuf-compat\.js\?v=20261017\.4,/);
  const raw = line.split('argument=')[1]
    .replace(/\{\{\{purifyComment\}\}\}/g, 'false')
    .replace(/\{\{\{displayUpList\}\}\}/g, '"hide"')
    .replace(/\{\{\{sponsorBlock\}\}\}/g, '#')
    .replace(/\{\{\{logLevel\}\}\}/g, '"error"');
  const { result, downloads } = runCompat(raw);
  assert.equal(result.parsed.logLevel, 'error');
  if (raw.includes('purifyComment=')) assert.equal(result.parsed.purifyComment, false);
  const phase = raw.split('_biliPhase=')[1];
  assert.equal(downloads[0], `https://raw.githubusercontent.com/kokoryh/Sparkle/290bcbdd2f158cdd8f7db9c996e90fe63490e16f/dist/bilibili.protobuf.${phase}.js`);
}
const options = { purifyComment: false, logLevel: 'debug', _biliPhase: 'request' };
const jsonOptions = JSON.stringify(options);
for (const raw of [jsonOptions, JSON.stringify(jsonOptions), '"' + jsonOptions + '"',
  'purifyComment="false"&logLevel=debug&_biliPhase=request',
  'purifyComment=%22false%22&logLevel=debug&_biliPhase=request']) {
  assert.deepEqual(runCompat(raw).result.parsed, { purifyComment: false, logLevel: 'debug' });
}
assert.equal(runCompat('purifyComment=true&_biliPhase=request').result.parsed.purifyComment, true);
const sourceCache = new Map();
assert.equal(runCompat(jsonOptions, sourceCache).downloads.length, 1);
assert.equal(runCompat(jsonOptions, sourceCache).downloads.length, 0);
assert.deepEqual(runCompat('purifyComment=true&_biliPhase=invalid').result, {});
const failedCache = new Map();
assert.deepEqual(runCompat(jsonOptions, failedCache, 404).result, {});
assert.equal(failedCache.size, 0);
for (const module of ['Bilibili', 'Amap', 'AppleWeather', 'NeteaseCloudMusic', 'TencentVideo', 'Iqiyi']) {
  const text = read(`modules/${module}.sgmodule`);
  assert.doesNotMatch(text, /script\.hub|192\.168\.|amap-probe|Bili probe/);
  assert.match(text, new RegExp(`^#!url=https://raw\\.githubusercontent\\.com/wyih/Shadowrocket-ADBlock-Rules-Forever/tailscale/modules/${module}\\.sgmodule`));
}
// Empty converted jq expressions are rejected by Shadowrocket's module parser.
const iqiyi = read('modules/Iqiyi.sgmodule');
assert.doesNotMatch(iqiyi, /^http-response-jq .+ ''$/m);
assert.match(iqiyi, /long_video_comments.+has\("alias_name"\)/);
// Certificate data is supplied through native module arguments, never public literals.
const mitm = read('modules/MITM-Keep-Enabled.sgmodule');
assert.deepEqual(mitm.split('\n').filter(line => line.trim() && !line.startsWith('#')),
  ['[MITM]', 'enable = {{{启用}}}', 'ca-passphrase = {{{证书密码}}}', 'ca-p12 = {{{证书内容}}}']);
const mitmDefaults = Object.fromEntries(mitm.match(/^#!arguments=(.+)$/m)[1].split(',').map(pair => {
  const separator = pair.indexOf(':');
  return [pair.slice(0, separator), pair.slice(separator + 1)];
}));
assert.equal(mitmDefaults['启用'], 'false');
for (const args of [mitmDefaults,
  { 启用: 'true', 证书密码: 'fixture-password-a', 证书内容: 'Zml4dHVyZS1jZXJ0LWE=' },
  { 启用: 'true', 证书密码: 'fixture-password-b', 证书内容: 'Zml4dHVyZS1jZXJ0LWI=' }]) {
  const expanded = mitm.replace(/\{\{\{([^{}]+)\}\}\}/g, (_, name) => args[name]);
  assert.doesNotMatch(expanded, /\{\{\{|undefined/);
  assert.equal(expanded.match(/^enable = (.+)$/m)[1], args['启用']);
  assert.equal(expanded.match(/^ca-passphrase = (.+)$/m)[1], args['证书密码']);
  assert.equal(expanded.match(/^ca-p12 = (.+)$/m)[1], args['证书内容']);
}
assert.equal(read('modules/MITM-Keep-Enabled.sgmodule.example'), mitm);
console.log('module repair checks passed');
