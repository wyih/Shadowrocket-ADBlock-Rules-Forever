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
    for (const field of ['account', 'preload']) delete expected.data[field];
    for (const field of ['list', 'show', 'event_list', 'keep_ids']) expected.data[field] = [];
    Object.assign(expected.data, { max_time: 0, min_interval: 31536000, pull_interval: 31536000 });
    assert.deepEqual(JSON.parse(result.body), expected);
    assert.equal(logs.length, 1);
    assert.match(logs[0], /version=20261016\.3.*list=4->0 keep=1->0$/);
    assert(!logs[0].includes('private-fixture'));
    assert(!logs[0].includes('12345678901234567'));
    assert.deepEqual(rewrite(url, result.body).result, result);
  }
}
for (const event of ['hot', 'cold', 'background']) {
  assert(rewrite(`https://app.bilibili.com/x/v2/splash/list?open_event=${event}`, input).logs[0].includes(`event=${event}`));
}
for (const body of ['bad-json', 'null', '{}', '{"code":-400,"data":{}}', '{"code":0,"data":null}', '{"code":0,"data":[]}', undefined]) {
  assert.deepEqual(rewrite('https://app.bilibili.com/x/v2/splash/list', body).result, {});
}
assert.deepEqual(rewrite('https://app.bilibili.com/x/v2/splash/list', input, false).result, {});
for (const url of ['https://app.bilibili.com/x/v2/feed/index', 'https://app.bilibili.com/x/v2/splash/list2', 'https://example.com/x/v2/splash/list']) {
  assert(!pattern.test(url));
  assert.deepEqual(rewrite(url, input).result, {});
}
// Omitted ad arrays are explicitly empty; unrelated data stays untouched.
assert.deepEqual(JSON.parse(rewrite('https://app.bilibili.com/x/v2/splash/show', '{"code":0,"data":{"other":1}}').result.body), { code: 0, data: { other: 1, list: [], show: [], event_list: [], keep_ids: [] } });
// The live client's cached IDs have 17 digits; do not round JSON numeric IDs.
const largeIds = '{"code":0,"data":{"id":12345678901234567,"other_ids":[-12345678901234567],"text":"12345678901234567 \\"quoted\\" __bili_integer_"}}';
const largeResult = rewrite('https://app.bilibili.com/x/v2/splash/list', largeIds).result.body;
assert.match(largeResult, /"id":12345678901234567/);
assert.match(largeResult, /"other_ids":\[-12345678901234567\]/);
assert.equal(JSON.parse(largeResult).data.text, JSON.parse(largeIds).data.text);
const escapedPrefix = '{"code":0,"data":{"id":12345678901234567,"text":"\\u005f_bili_integer_0"}}';
assert.equal(JSON.parse(rewrite('https://app.bilibili.com/x/v2/splash/list', escapedPrefix).result.body).data.text, '__bili_integer_0');

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
const localReply = read('scripts/wechat-ad-response.js');
const mockUrls = [
  'mtop.taobao.idlecommerce.splash.ads', 'mtop.taobao.idle.user.strategy.list',
  'mtop.taobao.idle.item.recommend.list', 'mtop.taobao.idle.local.near.by.corner.info',
  'mtop.taobao.idle.item.buy.feeds', 'mtop.taobao.idlemtopsearch.search.shade',
  'mtop.taobao.idle.playboy.recommend'
].map(api => `https://acs.m.goofish.com/gw/${api}/1.0/?test=1`);
mockUrls.push('https://acs.m.taobao.com/gw/mtop.taobao.idlecommerce.splash.ads/1.0/?test=1');
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
for (const host of ['goofish', 'taobao']) {
  for (const [api, mode, data] of [
    ['mtop.idle.idleadv.scene.restore', 'idle-scene', { trackParams: { stageMatch: 'false' } }],
    ['mtop.taobao.idlecommerce.splash.async.ads', 'idle-splash', { adMap: {} }]
  ]) {
    const url = `https://acs.m.${host}.com/gw/${api}/1.0?private=fixture`;
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
}
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
