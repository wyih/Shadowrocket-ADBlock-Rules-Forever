const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const moduleText = fs.readFileSync(path.join(root, 'modules/HTTPDNS.sgmodule'), 'utf8');
const helper = fs.readFileSync(path.join(root, 'scripts/wechat-ad-response.js'), 'utf8');
const compile = pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'i' : '');
const rules = moduleText.split('\n').filter(line => line.includes('/wechat-ad-response.js')).map(line => ({
  pattern: compile(line.match(/pattern=(.*?), script-path=/)[1]),
  mode: line.match(/argument=(\S+)$/)[1]
}));
function reply(mode) {
  let result;
  vm.runInNewContext(helper, { $argument: mode, console: { log() {} },
    $done(value) { result = JSON.parse(JSON.stringify(value)); } });
  return result.response;
}
function route(url) {
  const rule = rules.find(rule => rule.pattern.test(url));
  return rule && reply(rule.mode);
}
// Retain both platform-specific rejects and the general fallback's different response shapes.
for (const [url, status, body] of [
  ['https://video-dsp.pddpic.com/market-dsp-video/example.mp4', 404, ''],
  ['https://t-dsp.pinduoduo.com/dspcb/i/mrk_example', 404, ''],
  ['https://t-dsp.pinduoduo.com/other', 200, ''],
  ['https://api.m.mi.com/v1/app/start', 200, ''],
  ['https://dict.youdao.com/homepage/tile', 200, '{}'],
  ['http://p.kuaidi100.com/mobile/mobileapi.do?method=ad', 200, '{}'],
  ['http://p.kuaidi100.com/advertisement/example', 200, '{}'],
  ['http://sfo.mddcloud.com.cn/api/v2/sfo/popup_display', 200, '{}'],
  ['https://sfo.mddcloud.com.cn/api/v2/sfo/popup_displays', 200, '{}']
]) {
  const response = route(url);
  assert(response, url);
  assert.equal(response.status, status, url);
  assert.equal(response.body, body, url);
}
const unicom = route('https://m.client.10010.com/mobileService/customer/accountListData.htm');
assert.deepEqual(JSON.parse(unicom.body), {
  imgIndex: '0', adv: { startup_adv: { advCntList: [], buttonList: [] } }, respCode: '0000'
});
for (const mode of new Set(rules.map(rule => rule.mode))) {
  const response = reply(mode);
  assert(response, mode);
  const bytes = Buffer.from(response.body, response['body-base64'] ? 'base64' : 'utf8');
  assert.equal(response.headers['Content-Length'], String(bytes.length), mode);
  assert.equal(response.headers['Cache-Control'], 'no-store', mode);
  if (mode === 'tiny-gif') {
    assert.equal(bytes.subarray(0, 6).toString(), 'GIF89a');
    assert.equal(bytes.readUInt16LE(6), 1);
    assert.equal(bytes.readUInt16LE(8), 1);
    assert.equal(response.headers['Content-Type'], 'image/gif');
  }
}
// Advertising rules must leave Bilibili's normal APIs/CDN and the dedicated MiHome rewrite alone.
for (const url of [
  'https://app.bilibili.com/x/v2/splash/list',
  'https://api.bilibili.com/x/v2/feed/index',
  'https://upos-sz-static.bilivideo.com/ssaxcode/example.mp4',
  'https://i0.hdslb.com/bfs/archive/example.jpg',
  'https://home.mi.com/cgi-op/api/v1/recommendation/openingBanner',
  'https://acs.m.goofish.com/gw/mtop.taobao.idle.item.detail/1.0',
  'https://m.client.10010.com/mobileService/customer/login',
  'https://dns.google/dns-query'
]) assert.equal(route(url), undefined, url);
const nativeRules = moduleText.split('[Rule]')[1].split('\n[')[0].split('\n').filter(line => line && !line.startsWith('#'));
assert.equal(new Set(nativeRules).size, nativeRules.length);
for (const [host, suffix] of [
  ['init.sms.mob.com', 'mob.com'], ['sdkapi.sms.mob.com', 'mob.com'],
  ['code.sms.mob.com', 'mob.com'], ['smartop-sdkapi.jiguang.cn', 'jiguang.cn'],
  ['sdk.verification.jiguang.cn', 'jiguang.cn']
]) {
  const allow = nativeRules.indexOf(`DOMAIN,${host},DIRECT`);
  assert(allow >= 0 && allow < nativeRules.indexOf(`DOMAIN-SUFFIX,${suffix},REJECT`), host);
}
for (const ip of ['203.119.238.194', '203.119.238.240']) {
  assert(nativeRules.includes(`IP-CIDR,${ip}/32,REJECT,no-resolve`));
}
for (const ip of ['112.83.140.11', '112.86.135.139']) assert(!nativeRules.some(line => line.includes(ip)));
assert.doesNotMatch(moduleText, /^\[(?:General|Map Local)\]|^(?:enable|h2|ca-p12|ca-passphrase)\s*=|^URL-REGEX,/m);
assert.match(moduleText, /^hostname = %APPEND% /m);
// The converted XML wildcard must match an actual response, including line breaks.
const xmlLine = moduleText.split('\n').find(line => line.startsWith('http-response '));
const quoted = xmlLine.match(/"(?:\\.|[^"\\])*"/g).map(value => JSON.parse(value));
const xml = '<Envelope><GetADResult>\n{"ad":[1]}\n</GetADResult><Keep>yes</Keep></Envelope>';
assert.equal(xml.replace(new RegExp(quoted[0], 'g'), quoted[1]),
  '<Envelope><GetADResult>{"ret":0,"msg":"正常","err_code":0,"data":{"ad":[]}}</GetADResult><Keep>yes</Keep></Envelope>');
const jqLine = moduleText.split('\n').find(line => line.startsWith('http-response-jq '));
const filter = jqLine.match(/ '(.+)'$/)[1];
assert.deepEqual(JSON.parse(execFileSync('jq', ['-c', filter], {
  input: JSON.stringify({ code: 0, data: { list: [{ ad: 1 }], keep: 2 } })
})), { code: 0, data: { list: [], keep: 2 } });
console.log('Common ad blocker checks passed: response bodies, binary bridge, precedence, exceptions and normal traffic.');
