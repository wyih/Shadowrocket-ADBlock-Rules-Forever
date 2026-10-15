const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const mini = read('modules/WeChatMiniPrograms.sgmodule');
const official = read('modules/WeChatOfficialAccounts.sgmodule');
const responseScript = read('scripts/wechat-ad-response.js');
const compile = pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i');
const rules = (mini + '\n' + official).split('\n').filter(l => l.startsWith('http-response-jq '))
  .map(line => {
    const [, pattern, filter] = line.match(/^http-response-jq (\S+) '(.+)'$/);
    return { pattern: compile(pattern), filter };
  });
const scripts = (mini + '\n' + official).split('\n').filter(l => l.includes('script-path='))
  .map(line => ({ line, name: line.split(' = ')[0],
    pattern: compile(line.split('pattern=')[1].split(', script-path=')[0]),
    mode: line.split('argument=')[1] }));
function rewrite(url, data) {
  const matched = rules.filter(r => r.pattern.test(url));
  assert.equal(matched.length, 1, url);
  return JSON.parse(execFileSync('jq', ['-c', matched[0].filter], { input: JSON.stringify(data) }));
}
function reply(mode) {
  let result;
  vm.runInNewContext(responseScript, { $argument: mode, $done: v => { result = JSON.parse(JSON.stringify(v)); } });
  return result;
}
function request(url) {
  const matched = scripts.filter(r => r.pattern.test(url));
  assert.equal(matched.length, 1, url);
  return reply(matched[0].mode).response;
}
assert.equal(new Set(scripts.map(s => s.name)).size, scripts.length);
for (const { line } of scripts) {
  assert.match(line, /type=http-request/);
  assert.match(line, /engine=webview/);
  assert.match(line, /script-path=https:\/\/raw\.githubusercontent\.com\/wyih\/Shadowrocket-ADBlock-Rules-Forever\/tailscale\/scripts\/wechat-ad-response\.js,/);
}
assert.doesNotMatch(mini + official, /\[Map Local\]|script-path=https:\/\/kelee\.one/);

// A complete reply has an actual body and byte-correct length, including Chinese.
for (const mode of ['dict', 'reject', 'fcbox-dsp', 'fcbox-positions']) {
  const { response } = reply(mode);
  assert.equal(Number(response.headers['Content-Length']), Buffer.byteLength(response.body));
  assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(response.status, mode === 'reject' ? 404 : 200);
}
assert.deepEqual(reply(undefined), {});
assert.deepEqual(reply('constructor'), {});
assert.deepEqual(reply('unknown'), {});
assert.equal(reply('dict').response.body, '{}');
assert.equal(reply('reject').response.body, '');
for (const endpoint of ['get', 'getMulti']) {
  for (const query of ['', '?adSlotCode=fixture']) {
    const body = JSON.parse(request('https://dsp.fcbox.com/adSearch/' + endpoint + query).body);
    assert.equal(body.data, null);
    assert.equal(body.code, '370100000');
    assert.equal(body.msg, '操作成功');
    assert.equal(body.extendsMap.wxAdsFlag, 'false');
  }
}
assert.deepEqual(JSON.parse(request('https://webchatapp.fcbox.com/commerce/mobile/appConfig/getPositions').body).data, []);
assert.equal(request('https://webapi.qmai.cn/web/catering/advertising/list').body, '{}');
assert.equal(request('https://webapi.qmai.cn/web/cmk-center/marketing/canvas/advert-reach').status, 404);
assert.equal(request('https://webchatapp.fcbox.com/fcboxactivityweb/api/v2/clientPage/getHomeLiveInfo?client=1').body, '{}');
for (const url of [
  'https://webchatapp.fcbox.com/base/wechatFunc/login',
  'https://webchatapp.fcbox.com/commerce/mobile/appConfig/getPositionsExtra',
  'https://webchatapp.fcbox.com/fcboxactivityweb/api/v2/clientPage/jinGangFirst?client=1',
  'https://mp.weixin.qq.com/mp/appmsg_comment?action=getcomment',
  'https://mp.weixin.qq.com/s/example',
  'https://minorshort.weixin.qq.com/mmtls/test',
  'https://mobile.12306.cn/wxxcx/openplatform-inner/miniprogram/wifiapps/tourism/tourismBase/api/scenic/getThemeProduc'
]) assert.equal(scripts.filter(r => r.pattern.test(url)).length, 0, url);
const article = { advertisement_num: 2, advertisement_info: [{ ad: 1 }, { ad: 2 }], appid: 'ad-app', base_resp: { ret: 0 }, other: 'keep' };
for (const query of ['', '?__biz=fixture']) {
  const url = 'https://mp.weixin.qq.com/mp/getappmsgad' + query;
  assert.equal(scripts.filter(r => r.pattern.test(url)).length, 0);
  assert.deepEqual(rewrite(url, article), { advertisement_num: 0, advertisement_info: [], base_resp: { ret: 0 }, other: 'keep' });
}

// The original splice(0, 3) removes original indices together, not shifted ones.
const huifu = 'https://saas-ad.cloudpnr.com/huifuad-base-api/api/tactics/ad';
for (const query of ['', '?client=mini']) {
  assert.deepEqual(rewrite(huifu + query, { data: ['ad0', 'ad1', 'ad2', 'keep'], code: 0 }), { data: ['keep'], code: 0 });
  assert.deepEqual(rewrite(huifu + query, { data: ['ad0'], code: 0 }), { data: [], code: 0 });
}
assert.deepEqual(rewrite('https://chong.qq.com/tws/usernumberinfo/GetUserInfo?test=1', {
  data: { request: { number: { servicehallOperList: [1], servicehallFuncList: [2], markSeat: { servicehallOperList: [3], servicehallFuncList: [4], keep: 5 }, keep: 6 } } }
}), { data: { request: { number: { markSeat: { keep: 5 }, keep: 6 } } } });

// Nested JSON contains whole component definitions; remove only original ad IDs.
const qmai = 'https://webapi.qmai.cn/web/catering/design/homePage-Config';
const qmaiInput = { data: { config: JSON.stringify([{ id: '13502ede-f5fd-4d5c-90f5-f2454a30fda0', type: 'ad' }, { id: 'order-menu', type: 'menu' }]), shop: 1 } };
const qmaiResult = rewrite(qmai, qmaiInput);
assert.deepEqual(JSON.parse(qmaiResult.data.config), [{ id: 'order-menu', type: 'menu' }]);
assert.equal(qmaiResult.data.shop, 1);
const ems = 'https://ump.ems.com.cn/new-generation-extend/redis/pageInfoByChannel';
assert.deepEqual(JSON.parse(rewrite(ems, { info: { moduleJson: JSON.stringify([{ moduleName: '首页广告' }, { moduleName: '寄件' }]) } }).info.moduleJson), [{ moduleName: '寄件' }]);
for (const [url, field] of [[qmai, { data: { config: 'invalid' } }], [ems, { info: { moduleJson: 'invalid' } }]]) {
  assert.deepEqual(rewrite(url, field), field);
  assert.deepEqual(rewrite(url, {}), {});
}
const fieldCases = [
  ['https://mapi.xiaotucc.com/main_page/index/getActivity', { p3: 'ad', keep: 1 }, { keep: 1 }],
  ['https://minifm.maxxipoint.com/banner/list', { topBanner: ['ad'], keep: 1 }, { keep: 1 }],
  ['https://lawsonapi.yorentown.com/area/sh-lawson/app/v1/home/getConfigInfo/', { homeButtonList: [], dysmorphismPictureList: ['ad'], keep: 1 }, { keep: 1 }],
  ['https://miniapp.sexytea2013.com/cms/slot/queryByCodes?codes=INDEX_TOP_BANNER', { INDEX_SLOT_01: {}, INDEX_SLOT_02: {}, INDEX_TOP_BANNER: { contents: [{ value: 'ad.jpg' }] }, order: {} }, { order: {} }],
  ['https://coco-com.e.verystar.net/v1/home/info', { top_background_url: 'ad.jpg', bottom_banner_list: ['ad'], keep: 1 }, { keep: 1 }],
  ['https://htwkop.xiaojukeji.com/gateway?api=hm.fa.homeConfig', { bannerInfoConfig: {}, keep: 1 }, { keep: 1 }],
  ['https://api.prod.dj.mstand.cn/scrm/mini/app/index/info', { homeNewsAdv: { jumpValue: 'ad', image: 'ad.jpg' }, homeBannerAdv: {}, keep: 1 }, { keep: 1 }],
  ['https://newton.gumingnc.com/newton-buyer/newton/buyer/ump', [1, 2], []]
];
for (const [url, data, expected] of fieldCases) {
  assert.deepEqual(rewrite(url, { code: 0, data }), { code: 0, data: expected });
}
for (const url of [
  'https://mapi.xiaotucc.com/mall/main',
  'https://cappapi.alittle-tea.com/open?method=catering.set.ad',
  'https://passenger.t3go.cn/passenger-activity-api/notoken/api/v1/ad/getNegativescreen'
]) assert.deepEqual(rewrite(url, { code: 0, data: { ad: 1 } }), { code: 0 });
console.log('WeChat module checks passed: URL routing, complete replies, source deletion semantics, and non-ad data preservation');
