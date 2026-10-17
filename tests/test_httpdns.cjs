const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isIP } = require('node:net');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const moduleText = read('modules/HTTPDNS.sgmodule');
const script = read('scripts/httpdns-response.js');
const rules = moduleText.split('\n').filter(line => line.includes('script-path=') && line.includes('/httpdns-response.js'));
const patterns = rules.map(line => {
  assert.match(line, /engine=webview, timeout=5$/);
  assert.match(line, /script-path=https:\/\/raw\.githubusercontent\.com\/wyih\/Shadowrocket-ADBlock-Rules-Forever\/tailscale\/scripts\/httpdns-response\.js\?v=20261017\.1,/);
  const pattern = line.match(/pattern=(.*?), script-path=/)[1];
  return new RegExp(pattern.replace(/^\(\?i\)/, ''), pattern.startsWith('(?i)') ? 'i' : '');
});
function reply(url, headers = {}) {
  if (!patterns.some(pattern => pattern.test(url))) return {};
  let result;
  const logs = [];
  vm.runInNewContext(script, {
    $request: { url, headers }, console: { log: text => logs.push(text) },
    $done: value => { result = JSON.parse(JSON.stringify(value)); }
  });
  assert(logs.every(text => !text.includes('host=') && !text.includes('private=') && !text.includes('http:')));
  return result;
}
function blocked(url) {
  const { response } = reply(url);
  assert(response, url);
  assert.equal(response.status, 404);
  assert.equal(response.body, '');
  assert.equal(response.headers['Content-Length'], '0');
  assert.equal(response.headers['Cache-Control'], 'no-store');
}
// The verified FleaMarket native rejection moves here unchanged; generic AMDC stays covered.
const dispatchLine = moduleText.split('\n').find(line => line.includes('(USER-AGENT,%E9%97%B2%E9%B1%BC*'));
assert.match(dispatchLine, /,\(USER-AGENT,%E9%97%B2%E9%B1%BC\*\)\),REJECT$/);
const dispatchPattern = new RegExp(dispatchLine.match(/^AND,\(\(URL-REGEX,(.*)\),\(USER-AGENT,/)[1]);
for (const host of ['59.82.113.219', '59.82.14.1:80', '59.82.113.10', 'amdc.m.taobao.com', '47.246.103.9', '59.82.14.161:80', '59.82.14.162:80']) {
  for (const query of ['', '?private=fixture']) {
    const url = `http://${host}/amdc/mobileDispatch${query}`;
    assert(dispatchPattern.test(url));
    blocked(url);
  }
}
for (const url of ['http://59.82.113.219/amdc/mobileDispatch.extra', 'http://59.82.113.219/item/detail', 'http://example.com/amdc/mobileDispatch', 'https://acs.m.goofish.com/gw/mtop.taobao.idle.item.detail/1.0']) {
  assert(!dispatchPattern.test(url), url);
  assert.deepEqual(reply(url), {}, url);
}
// Actual Bilibili resolver pools, rotating addresses, query order and all accounts.
for (const address of ['203.119.238.240', '203.119.206.8', '203.119.204.80', '203.119.206.9', '203.119.238.194', '203.107.1.65:80', '[2400:3200::1]', '[::ffff:203.119.206.8]:80']) {
  for (const host of ['app.bilibili.com', 'api.bilibili.com', 'i1.hdslb.com', 'upos-sz-static.bilivideo.com', 'example.com']) {
    blocked(`http://${address}/191607/resolve?host=${host}&query=4,6`);
    blocked(`http://${address}/191608/resolve?query=4,6&host=${host}`);
  }
  for (const endpoint of ['d', 'd4', 'd6', 'ss', 'ss4', 'ss6', 'sign_d', 'sign_d6', 'sign_ss4', 'sign_resolve']) {
    blocked(`http://${address}/${endpoint}?private=fixture`);
  }
  blocked(`http://${address}/v4/resolve?host=example.com`);
  blocked(`http://${address}/amdc/mobileDispatch?private=fixture`);
}
for (const url of [
  'http://amdc.m.taobao.com/amdc/mobileDispatch',
  'http://59.82.14.161/amdc/mobileDispatch?private=fixture',
  'http://103.44.58.64/md?private=fixture',
  'http://cdn.wup.huya.com/launch/queryHttpDns?private=fixture',
  'http://xmc.ximalaya.com/xmlymain-login-web/login/example',
  'http://103.37.155.60/fetch?private=fixture',
  'http://103.41.167.237/v2/resolv?private=fixture',
  'http://api.weibo.cn/2/httpdns/config?private=fixture',
  'http://api.weibo.cn/httpdns/config?private=fixture',
  'http://a.zijieapi.com/get_domains/v1/',
  'http://short.weixin.qq.com/cgi-bin/micromsg-bin/getcdndns?private=fixture',
  'http://hkextshort.weixin.qq.com/cgi-bin/micromsg-bin/getcdndns?private=fixture',
  'http://110.76.8.150/squery?private=fixture',
  'http://203.209.250.114/squery?private=fixture',
  'http://[2400:B200:1005:3000::1D3]/squery?private=fixture'
]) blocked(url);
// Existing Dida exceptions depend on both endpoint and app, including header casing.
for (const address of ['119.29.29.90', '119.28.28.90:80']) {
  for (const agent of ['%E5%98%80%E5%97%92%E5%87%BA%E8%A1%8C/CFNetwork', '嘀嗒出行/CFNetwork']) {
    assert.deepEqual(reply(`http://${address}/d?dn=fixture`, { 'USER-AGENT': agent }), {});
    assert.equal(reply(`http://${address}/191607/resolve?host=example.com`, { 'User-Agent': agent }).response.status, 404);
  }
  blocked(`http://${address}/d?dn=fixture`);
}
for (const url of [
  'http://203.119.206.8/item/detail?host=app.bilibili.com',
  'http://203.119.206.8/191607/resolve.extra?host=app.bilibili.com',
  'http://203.119.206.8/amdc/mobileDispatch.extra',
  'http://example.com/191607/resolve?host=app.bilibili.com',
  'http://256.119.206.8/191607/resolve?host=app.bilibili.com',
  'https://app.bilibili.com/x/v2/splash/list?private=fixture',
  'https://upos-sz-static.bilivideo.com/ssaxcode/example.mp4',
  'https://dns.google/dns-query', 'https://8.8.8.8/dns-query',
  'https://cloudflare-dns.com/dns-query', 'http://223.5.5.5/dns-query',
  'http://api.weibo.cn/2/statuses/home_timeline',
  'http://short.weixin.qq.com/cgi-bin/micromsg-bin/normal'
]) assert.deepEqual(reply(url), {}, url);
for (const line of moduleText.split('\n').filter(line => /^IP-CIDR6?,/.test(line))) {
  const [type, cidr] = line.split(',');
  const [address, prefix] = cidr.split('/');
  assert.equal(isIP(address), type === 'IP-CIDR6' ? 6 : 4, line);
  assert(Number(prefix) <= (type === 'IP-CIDR6' ? 128 : 32), line);
}
assert.match(moduleText, /^#!author=wyih$/m);
assert.match(moduleText, /^#!url=https:\/\/raw\.githubusercontent\.com\/wyih\//m);
assert.doesNotMatch(moduleText, /^(?:URL-REGEX,|.*USER-AGENT,")/m);
assert.doesNotMatch(moduleText, /^\[General\]|^(?:enable|h2|ca-p12|ca-passphrase)\s*=/m);
assert.match(moduleText, /^hostname = %APPEND% /m);
assert.doesNotMatch(read('modules/Bilibili.sgmodule'), /^.*191607.*$/m);
console.log(`HTTPDNS checks passed (${rules.length} interfaces, IPv4/IPv6, Dida exceptions, normal traffic).`);
