const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const moduleText = fs.readFileSync(path.join(__dirname, '../modules/MiHome.sgmodule'), 'utf8');
const rules = moduleText.split('\n').filter(line => line.startsWith('http-response-jq ')).map(line => {
  const [, pattern, filter] = line.match(/^http-response-jq (\S+) '(.+)'$/);
  return { pattern: new RegExp(pattern), filter };
});
function rewrite(url, value) {
  return rules.filter(rule => rule.pattern.test(url)).reduce((body, rule) =>
    JSON.parse(execFileSync('jq', ['-c', rule.filter], { input: JSON.stringify(body) })), value);
}

const prefix = 'https://home.mi.com/cgi-op/api/v1/';
const endpoints = [
  'recommendation/openingBanner',
  'resource/realtime/openingBanner',
  'recommendation/carousel/banners',
  'recommendation/model/banner',
  'recommendation/myTab'
];
for (const endpoint of endpoints) {
  const field = endpoint.endsWith('myTab') ? 'banners' : 'list';
  const input = { code: 0, message: '成功', data: { [field]: [{ id: 1 }], keep: { devices: [1, 2] } }, extra: true };
  const expected = { ...input, data: { ...input.data, [field]: [] } };
  for (const suffix of ['', '?test=1', '/', '/?test=1']) {
    const url = prefix + endpoint + suffix;
    assert.equal(rules.filter(rule => rule.pattern.test(url)).length, 1);
    assert.deepEqual(rewrite(url, input), expected);
  }
  assert.deepEqual(rewrite(prefix + endpoint, expected), expected);
  for (const value of [null, [], {}, { code: -1 }, { data: null }, { data: [] }, { data: 'error' }, { data: { [field]: null } }]) {
    assert.deepEqual(rewrite(prefix + endpoint, value), value);
  }
}
// Keep device control, tab configuration and other operations outside the filter.
for (const url of [
  prefix + 'recommendation/openingBannerExtra',
  prefix + 'recommendation/openingBanner/extra',
  prefix + 'resource/realtime/manage',
  prefix + 'common/findTabConfig',
  prefix + 'recommendation/mihome/bottom/tab',
  'https://api.io.mi.com/app/home/device_list',
  'https://home.mi.com.example.org/cgi-op/api/v1/recommendation/openingBanner'
]) {
  assert(!rules.some(rule => rule.pattern.test(url)));
}
assert.match(moduleText, /hostname = %APPEND% home\.mi\.com\s*$/);
assert.doesNotMatch(moduleText, /^DOMAIN|^enable\s*=|^ca-p12\s*=|\[Map Local\]/m);
console.log('MiHome: five ad endpoints, query boundaries, JSON preservation and device operations passed');
