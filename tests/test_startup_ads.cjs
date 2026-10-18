const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const compile = pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i');
const bili = read('modules/Bilibili.sgmodule');
const script = read('scripts/bilibili-splash-response.js');
const localReply = read('scripts/wechat-ad-response.js');
// Resolver interception belongs to the shared module, alongside the other apps.
assert.doesNotMatch(bili, /^(?:DOMAIN,httpdns\.bilivideo\.com|AND,.*191607)/m);
const rule = bili.split('\n').find(l => l.startsWith('开屏素材失效 ='));
const pattern = compile(rule.split('pattern=')[1].split(', script-path=')[0]);
function rewrite(url, body, withResponse = true) {
  let result;
  const logs = [];
  const env = {
    $request: { url }, console: { log: text => logs.push(text) },
    $done: value => { result = JSON.parse(JSON.stringify(value)); }
  };
  if (withResponse) env.$response = { body };
  vm.runInNewContext(script, env);
  return { result, logs };
}
const fixture = {
  code: 0, message: '成功', ttl: 1, keepRoot: true,
  data: {
    max_time: 5, min_interval: 30, pull_interval: 900,
    account: { ad: 1 }, preload: [{ ad: 2 }], show: [{ ad: 3 }], event_list: [{ ad: 4 }],
    keep_ids: ['cached-id'], splash_request_id: 'keep-request-id', other: { keep: true },
    list: [
      { id: '12345678901234567', duration: 5, begin_time: 1, end_time: 2, enable_pre_download: true, thumb: 'asset', keep: '中文' },
      { id: 2, duration: 10, begin_time: 3, end_time: 4, enable_pre_download: false },
      { id: 3, unknown: 'keep' }, null
    ]
  }
};
const input = JSON.stringify(fixture);
for (const endpoint of ['list', 'show', 'event/list2', 'brand/list']) {
  for (const query of ['', '?open_event=hot&access_key=private-fixture']) {
    const url = `https://app.bilibili.com/x/v2/splash/${endpoint}${query}`;
    assert(pattern.test(url));
    const { result, logs } = rewrite(url, input);
    const expected = JSON.parse(input);
    delete expected.data.account;
    for (const field of ['list', 'show', 'event_list', 'keep_ids', 'preload']) expected.data[field] = [];
    if (endpoint === 'brand/list') Object.assign(expected.data, { forcibly: false, rule: '', has_new_splash_set: 0 });
    Object.assign(expected.data, { max_time: 0, min_interval: 31536000, pull_interval: 31536000 });
    assert.deepEqual(JSON.parse(result.body), expected);
    assert.equal(logs.length, 2);
    assert.match(logs[1], /version=20261018\.2.*list=4->0 keep=1->0$/);
    assert(!logs.join('').includes('private-fixture'));
    assert(!logs.join('').includes('12345678901234567'));
    assert.deepEqual(rewrite(url, result.body).result, result);
  }
}
// The newly observed dedicated brand config is emptied without inventing its schema.
for (const query of ['', '?access_key=private-fixture']) {
  const url = `https://app.bilibili.com/x/v2/splash/brand/config${query}`;
  assert(pattern.test(url));
  const { result, logs } = rewrite(url, input);
  assert.deepEqual(JSON.parse(result.body), { ...fixture, data: {} });
  assert.match(logs[1], /version=20261018\.2 path=\/x\/v2\/splash\/brand\/config config=empty$/);
  assert(!logs.join('').includes('private-fixture'));
  assert.deepEqual(rewrite(url, result.body).result, result);
  assert.deepEqual(rewrite(url, '{"code":-400,"data":{}}').result, {});
}
for (const event of ['hot', 'cold', 'background']) {
  assert(rewrite(`https://app.bilibili.com/x/v2/splash/list?open_event=${event}`, input).logs.some(log => log.includes(`event=${event}`)));
}
for (const body of ['bad-json', 'null', '{}', '{"code":-400,"data":{}}', '{"code":0,"data":null}', '{"code":0,"data":[]}', undefined]) {
  assert.deepEqual(rewrite('https://app.bilibili.com/x/v2/splash/list', body).result, {});
}
assert.deepEqual(rewrite('https://app.bilibili.com/x/v2/splash/list', input, false).result, {});
for (const url of ['https://app.bilibili.com/x/v2/feed/index', 'https://app.bilibili.com/x/v2/splash/list2', 'https://app.bilibili.com/x/v2/splash/brand/configuration', 'https://example.com/x/v2/splash/list']) {
  assert(!pattern.test(url));
  assert.deepEqual(rewrite(url, input).result, {});
}
// Omitted ad arrays are explicitly empty; unrelated data stays untouched.
assert.deepEqual(JSON.parse(rewrite('https://app.bilibili.com/x/v2/splash/show', '{"code":0,"data":{"other":1}}').result.body), { code: 0, data: { other: 1, list: [], show: [], event_list: [], keep_ids: [], preload: [] } });
// Real brand fields use booleans/strings; some scripts also expect numeric controls.
for (const endpoint of ['list', 'brand/list']) {
  for (const controls of [
    { forcibly: true, rule: 'order', has_new_splash_set: 1 },
    { forcibly: 1, rule: 1, has_new_splash_set: true }
  ]) {
    const body = JSON.stringify({ code: 0, data: { ...controls, preload: [{ thumb: 'asset' }], other: { keep: true } } });
    const data = JSON.parse(rewrite(`https://app.bilibili.com/x/v2/splash/${endpoint}`, body).result.body).data;
    for (const [key, original] of Object.entries(controls)) {
      assert.equal(typeof data[key], typeof original);
      assert(!data[key]);
    }
    assert.deepEqual(data.preload, []);
    assert.deepEqual(data.other, { keep: true });
  }
}
// Capture only bounded asset samples, stripping credentials-bearing queries and fragments.
const assets = {
  code: 0, data: {
    account: { thumb: 'https://private.example/avatar.jpg' },
    list: Array.from({ length: 12 }, (_, index) => ({
      thumb: `https://i${index}.hdslb.com/bfs/sycp/creative_img/${index}.jpg?access_key=secret-query#secret-fragment`,
      extra: { topview_pic_url: 'https://i0.hdslb.com/bfs/sycp/creative_img/nested.jpg?token=secret-query' },
      uri: 'https://shop.example/secret-landing-path?token=secret-query',
      show_urls: ['https://tracking.example/secret-tracking-path?token=secret-query']
    }))
  }
};
const assetLogs = rewrite('https://app.bilibili.com/x/v2/splash/list?access_key=secret-query', JSON.stringify(assets)).logs;
const sourceLog = assetLogs.find(log => log.startsWith('Bilibili splash source:'));
assert(sourceLog.includes('list:12'));
assert(sourceLog.includes('/bfs/sycp/creative_img/'));
const [, hostList, sampleList] = sourceLog.match(/ hosts=(\[.*\]) samples=(\[.*\])$/);
assert.equal(JSON.parse(hostList).length, 8);
assert.equal(JSON.parse(sampleList).length, 3);
assert(assetLogs.every(log => !/secret-|private\.example|shop\.example|tracking\.example/.test(log)));
assert.doesNotMatch(rewrite('https://app.bilibili.com/x/v2/splash/list', '{"code":0,"data":{"thumb":"https://secret-user:secret-pass@cdn.example/a.jpg"}}').logs.join(''), /secret-user|secret-pass/);
// The live client's cached IDs have 17 digits; do not round JSON numeric IDs.
const largeIds = '{"code":0,"data":{"id":12345678901234567,"other_ids":[-12345678901234567],"text":"12345678901234567 \\"quoted\\" __bili_integer_"}}';
const largeResult = rewrite('https://app.bilibili.com/x/v2/splash/list', largeIds).result.body;
assert.match(largeResult, /"id":12345678901234567/);
assert.match(largeResult, /"other_ids":\[-12345678901234567\]/);
assert.equal(JSON.parse(largeResult).data.text, JSON.parse(largeIds).data.text);
const escapedPrefix = '{"code":0,"data":{"id":12345678901234567,"text":"\\u005f_bili_integer_0"}}';
assert.equal(JSON.parse(rewrite('https://app.bilibili.com/x/v2/splash/list', escapedPrefix).result.body).data.text, '__bili_integer_0');
// Prefix collisions may precede or follow the numbers being protected.
const collisions = '{"code":0,"root_id":12345678901234567,"data":{"text":"__bili_integer_0","escaped":"\\u005f_bili_integer__0","other_ids":[-12345678901234567,12345678901234569],"list":[{"id":12345678901234571}]}}';
const collisionResult = rewrite('https://app.bilibili.com/x/v2/splash/list', collisions).result.body;
assert.match(collisionResult, /"root_id":12345678901234567/);
assert.match(collisionResult, /"other_ids":\[-12345678901234567,12345678901234569\]/);
assert.equal(JSON.parse(collisionResult).data.text, '__bili_integer_0');
assert.equal(JSON.parse(collisionResult).data.escaped, '__bili_integer__0');
assert.deepEqual(JSON.parse(collisionResult).data.list, []);

// Intercept the separate resource APIs before downloading their real response.
const resourceRule = bili.split('\n').find(line => line.startsWith('开屏资源拦截 ='));
const resourcePattern = compile(resourceRule.split('pattern=')[1].split(', script-path=')[0]);
assert.match(resourceRule, /type=http-request/);
assert.match(resourceRule, /engine=webview/);
assert.match(resourceRule, /wechat-ad-response\.js\?v=20261017\.3,/);
const resourceMode = resourceRule.split('argument=')[1];
for (const endpoint of [
  'https://app.bilibili.com/x/resource/peak/download',
  'https://api.bilibili.com/x/mengqi/v1/resource'
]) {
  for (const query of ['', '?access_key=private-fixture&sign=private-sign']) {
    const url = endpoint + query;
    assert(resourcePattern.test(url));
    let reply;
    const logs = [];
    vm.runInNewContext(localReply, {
      $argument: resourceMode, $request: { url }, console: { log: value => logs.push(value) },
      $done: value => { reply = JSON.parse(JSON.stringify(value.response)); }
    });
    assert.equal(reply.status, 200);
    assert.equal(reply.body, '{}');
    assert.equal(Number(reply.headers['Content-Length']), Buffer.byteLength(reply.body));
    assert.equal(reply.headers['Content-Type'], 'application/json');
    assert.equal(reply.headers['Cache-Control'], 'no-store');
    assert.deepEqual(logs, ['Bilibili resource: version=20261017.3 returning-empty-response']);
  }
}
for (const url of [
  'https://app.bilibili.com/x/resource/peak/downloadExtra',
  'https://api.bilibili.com/x/mengqi/v1/resources',
  'https://api.bilibili.com/x/resource/peak/download',
  'https://app.bilibili.com/x/mengqi/v1/resource',
  'https://app.bilibili.com/x/v2/splash/list',
  'https://app.bilibili.com/x/resource/show/skin',
  'https://app.bilibili.com/x/v2/feed/index'
]) assert(!resourcePattern.test(url), url);

// The phone routed the old URL-REGEX matches DIRECT; use complete request-stage replies.
const assetRules = bili.split('\n').filter(line => line.endsWith('argument=bili-asset'));
const assetPatterns = assetRules.map(line => compile(line.split('pattern=')[1].split(', script-path=')[0]));
for (const line of assetRules) {
  assert.match(line, /type=http-request/);
  assert.match(line, /engine=webview/);
  assert.match(line, /wechat-ad-response\.js\?v=20261017\.5,/);
}
assert.equal(assetPatterns.length, 3);
const blockedAssets = [
  'https://i0.hdslb.com/bfs/sycp_brand/img/202610/2bb7ff5c3542c673e3c8cd5d3496cce8.webp',
  'https://i1.hdslb.com/bfs/sycp/creative_img/202402/374d96172a555415f2dcabbc437299fd.json',
  'http://i2.hdslb.com/bfs/sycp/creative_img/ad.jpg?width=1080',
  'https://i2.hdslb.com/bfs/sycp/mgk/material/png/202610/be1a76d2d2231851a0c3f215a4c8266c.png@360w_202h_1e_1c_85q.avif',
  'https://i2.hdslb.com/bfs/sycp/mng/202505/a00775285c61820792b15c377b90715e.png@48w_43h_1e_1c_85q.avif',
  'http://upos-sz-static.bilivideo.com/ssaxcode/ye/y9/n260930tx2p7jhtmdmxk15iwz4doy9ye-1-SPLASH.mp4',
  'https://upos-sz-static.bilivideo.com/ssaxcode/j9/7z/n261015tx1uj97y27ely4r1i5nzo7zj9-1-SiteTool_1080.mp4?token=fixture',
  'https://upos-sz-staticcos.bilivideo.com/ssaxcode/ye/y9/n260930tx2p7jhtmdmxk15iwz4doy9ye-1-SPLASH.mp4',
  'http://192.0.2.1:8000/v1/resource/n260930tx2p7jhtmdmxk15iwz4doy9ye-1-SPLASH.mp4?test=1'
];
const mitmHosts = bili.match(/^hostname = %APPEND% (.+)$/m)[1].split(', ');
for (const url of blockedAssets) {
  assert.equal(assetPatterns.filter(pattern => pattern.test(url)).length, 1, url);
  if (url.startsWith('https:')) assert(mitmHosts.includes(new URL(url).hostname), url);
  const selected = assetRules.find(line => compile(line.split('pattern=')[1].split(', script-path=')[0]).test(url));
  let response;
  const logs = [];
  vm.runInNewContext(localReply, {
    $argument: selected.split('argument=')[1], $request: { url },
    console: { log: value => logs.push(value) },
    $done: value => { response = JSON.parse(JSON.stringify(value.response)); }
  });
  assert.equal(response.status, 404);
  assert.equal(response.body, '');
  assert.equal(response.headers['Content-Length'], '0');
  assert.equal(response.headers['Content-Type'], 'text/plain');
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.deepEqual(logs, ['Bilibili asset: version=20261017.5 returning-empty-response']);
}
for (const url of [
  'https://i0.hdslb.com/bfs/archive/normal-cover.jpg',
  'https://i1.hdslb.com/bfs/face/avatar.jpg',
  'https://i2.hdslb.com/bfs/feed-admin/normal.webp',
  'https://i0.hdslb.com/bfs/sycp_brand_extra/normal.jpg',
  'https://i0.hdslb.com.example.com/bfs/sycp/ad.jpg',
  'https://upos-sz-static.bilivideo.com/ssaxcode/ye/y9/n260930tx2p7jhtmdmxk15iwz4doy9ye-1-100194.mp4',
  'https://upos-sz-static.bilivideo.com/ssaxcode/ye/y9/n260930tx2p7jhtmdmxk15iwz4doy9ye-1-SPLASH.mp4.extra',
  'http://192.0.2.1:8000/v1/resource/upgcxcode/88/46/42593224688/42593224688-1-100194.m4s'
]) assert(!assetPatterns.some(pattern => pattern.test(url)), url);

const flea = read('modules/FleaMarket.sgmodule');
assert.match(flea, /^#!url=https:\/\/raw\.githubusercontent\.com\/wyih\/Shadowrocket-ADBlock-Rules-Forever\/tailscale\/modules\/FleaMarket\.sgmodule/m);
assert.doesNotMatch(flea, /script\.hub|\[Map Local\]/);
const mocks = flea.split('\n').filter(l => l.includes('script-path=')).map(line => ({
  line, pattern: compile(line.split('pattern=')[1].split(', script-path=')[0]), mode: line.split('argument=')[1]
}));
assert.equal(mocks.length, 10);
for (const { line } of mocks) {
  assert.match(line, /type=http-request/);
  assert.match(line, /engine=webview/);
}
const mockUrls = [
  'mtop.taobao.idlecommerce.splash.ads', 'mtop.taobao.idle.user.strategy.list',
  'mtop.taobao.idle.item.recommend.list', 'mtop.taobao.idle.local.near.by.corner.info',
  'mtop.taobao.idle.item.buy.feeds', 'mtop.taobao.idlemtopsearch.search.shade',
  'mtop.taobao.idle.playboy.recommend'
].map(api => `https://acs.m.goofish.com/gw/${api}/1.0/?test=1`);
mockUrls.push('https://acs.m.taobao.com/gw/mtop.taobao.idlecommerce.splash.ads/1.0/?test=1');
mockUrls.push('https://rhdc-acs.m.taobao.com/gw/mtop.taobao.idlecommerce.splash.ads/1.0/?test=1');
for (const url of mockUrls) {
  const matches = mocks.filter(r => r.pattern.test(url));
  assert.equal(matches.length, 1);
  let reply;
  vm.runInNewContext(localReply, { $argument: matches[0].mode, $done: value => { reply = value.response; } });
  assert.equal(reply.status, 200);
  assert.equal(reply.body, '{}');
  assert.equal(Number(reply.headers['Content-Length']), Buffer.byteLength(reply.body));
}
assert.equal(mocks.filter(r => r.pattern.test('https://acs.m.taobao.com/gw/mtop.taobao.idle.home.welcome/1.0/'))[0].mode, 'reject');
for (const host of ['acs.m.goofish.com', 'acs.m.taobao.com', 'rhdc-acs.m.taobao.com']) {
  for (const [api, mode, data] of [
    ['mtop.idle.idleadv.scene.restore', 'idle-scene', { trackParams: { stageMatch: 'false' } }],
    ['mtop.taobao.idlecommerce.splash.async.ads', 'idle-splash', { adMap: {} }]
  ]) {
    const url = `https://${host}/gw/${api}/1.0?private=fixture`;
    const matching = mocks.filter(r => r.pattern.test(url));
    assert.equal(matching.length, 1);
    assert.equal(matching[0].mode, mode);
    let response;
    const logs = [];
    vm.runInNewContext(localReply, {
      $argument: mode, console: { log: text => logs.push(text) },
      $done: value => { response = JSON.parse(JSON.stringify(value.response)); }
    });
    assert.deepEqual(JSON.parse(response.body), { api, data, ret: ['SUCCESS::调用成功'], v: '1.0' });
    assert.equal(response.status, 200);
    assert.equal(Number(response.headers['Content-Length']), Buffer.byteLength(response.body));
    assert.deepEqual(logs, [`FleaMarket startup: version=20261016.2 mode=${mode}`]);
  }
}
for (const endpoint of ['mtop.taobao.idle.item.detail', 'mtop.taobao.idle.trade.create', 'mtop.taobao.idlecommerce.splash.ads.extra', 'mtop.idle.idleadv.scene.restore.extra', 'mtop.taobao.idlecommerce.splash.async.ads.extra']) {
  assert.equal(mocks.filter(r => r.pattern.test(`https://acs.m.goofish.com/gw/${endpoint}/1.0/`)).length, 0);
  assert.equal(mocks.filter(r => r.pattern.test(`https://rhdc-acs.m.taobao.com/gw/${endpoint}/1.0/`)).length, 0);
}
assert.match(flea, /^hostname = %APPEND% .*\brhdc-acs\.m\.taobao\.com$/m);
// Resolver interception belongs to the shared HTTPDNS module.
assert.doesNotMatch(flea, /mobileDispatch|^DOMAIN,.*httpdns/m);
// Compile all preserved native jq expressions and exercise the existing ad-card filter.
const jqLines = flea.split('\n').filter(l => l.startsWith('http-response-jq '));
assert.equal(jqLines.length, 17);
for (const line of jqLines) {
  const filter = line.match(/ '(.+)'$/)[1];
  execFileSync('jq', ['-n', `def filter: (${filter}); empty`]);
}
const homeFilter = jqLines.find(l => l.includes('idlehome\\.home\\.nextfresh')).match(/ '(.+)'$/)[1];
const cards = { data: { homeTopList: [{ sectionType: 'kingkongDo' }, { sectionType: 'ad' }], sections: [
  { data: { clickParam: { args: { cardType: 'mamaAD' } } }, template: { name: 'ad' } },
  { data: { clickParam: { args: { cardType: 'normal' } } }, template: { name: 'idlefish_home_new_commodity_card' } }
] } };
const filtered = JSON.parse(execFileSync('jq', ['-c', homeFilter], { input: JSON.stringify(cards) }));
assert.equal(filtered.data.sections.length, 1);
assert.equal(filtered.data.sections[0].template.name, 'idlefish_home_new_commodity_card');
const transport = read('modules/AdBlock-Transport.sgmodule');
assert.match(transport, /^\[General\]\nblock-quic = all$/m);
assert.doesNotMatch(transport, /\[Rule\]|\[MITM\]|ca-p12|dns-server/);
console.log('startup ad checks passed');
