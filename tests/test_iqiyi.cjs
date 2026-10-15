const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const moduleText = fs.readFileSync(path.join(root, 'modules/Iqiyi.sgmodule'), 'utf8');
const lines = moduleText.split('\n');
const compile = pattern => new RegExp(pattern.replace(/^\(\?i\)/, ''), 'i');
const rewrites = lines.filter(line => line.startsWith('http-response-jq ')).map(line => {
  const [, pattern, filter] = line.match(/^http-response-jq (\S+) '(.+)'$/);
  // Compile every expression without requiring a response for unrelated endpoints.
  execFileSync('jq', ['-n', `if false then (${filter}) else null end`]);
  return { pattern: compile(pattern), filter };
});
const maps = lines.filter(line => line.startsWith('(?i)')).map(line => compile(line.split(' ')[0]));

// Module rules take precedence over the two generated configurations.
for (const config of ['sr_direct_banad_tailscale.conf', 'sr_top500_whitelist_ad_tailscale.conf']) {
  const rules = (moduleText + '\n' + fs.readFileSync(path.join(root, config), 'utf8'))
    .split('\n').filter(line => /^DOMAIN(?:-SUFFIX)?,/.test(line)).map(line => line.split(','));
  for (const host of ['api.iqiyi.com', 'hotchat-im.iqiyi.com', 'policy.video.iqiyi.com']) {
    const rule = rules.find(([type, domain]) => host === domain ||
      (type === 'DOMAIN-SUFFIX' && host.endsWith('.' + domain)));
    assert.equal(rule[2].trim().toUpperCase(), 'DIRECT', `${config}: ${host}`);
  }
}

// Both forms must reach the same filters; these paths come from the module and device log.
for (const endpoint of [
  'cards.iqiyi.com/views_home/3.0/qy_home',
  'cards.iqiyi.com/views_category/3.0/category_home',
  'cards.iqiyi.com/waterfall/3.0/feed',
  'cards.iqiyi.com/waterfall-plt/3.0/feed',
  'cards.iqiyi.com/views_plt/3.0/player_tabs_v2',
  'iface2.iqiyi.com/views_menus/3.0/bottom_theme',
  'iface2.iqiyi.com/views_menus/3.0/home_top_menu',
  'iface2.iqiyi.com/fusion/3.0/common_switch',
  'iface2.iqiyi.com/aggregate/3.0/getMyMenus'
]) {
  const direct = `https://${endpoint}?test=1`;
  const gateway = `https://api.iqiyi.com/3f4/${endpoint}?test=1`;
  const match = url => rewrites.filter(rule => rule.pattern.test(url));
  assert(match(direct).length > 0, endpoint);
  assert.deepEqual(match(gateway), match(direct), endpoint);
  assert.equal(match(`https://example.com/3f4/${endpoint}?test=1`).length, 0);
}

function clean(url, body) {
  for (const { pattern, filter } of rewrites) {
    if (pattern.test(url)) body = JSON.parse(execFileSync('jq', ['-c', filter], { input: JSON.stringify(body) }));
  }
  return body;
}
const home = { code: 0, cards: [
  { alias_name: 'normal_video', title: 'keep' },
  { alias_name: 'ad_mobile_flow' }, { alias_name: 'ad_trueview' }
] };
for (const prefix of ['https://', 'https://api.iqiyi.com/3f4/']) {
  const url = `${prefix}cards.iqiyi.com/views_home/3.0/qy_home?test=1`;
  assert.deepEqual(clean(url, home), { code: 0, cards: [{ alias_name: 'normal_video', title: 'keep' }] });
  for (const endpoint of [
    'cards.iqiyi.com/views_home/3.0/qy_home',
    'cards.iqiyi.com/views_hot/3.0/category_home',
    'cards.iqiyi.com/views_focus/3.0/follow_channel',
    'iface2.iqiyi.com/control/3.0/init_login',
    'iface2.iqiyi.com/watch_control/pub/get'
  ]) assert(!maps.some(pattern => pattern.test(`${prefix}${endpoint}?test=1`)), endpoint);
  assert(maps.some(pattern => pattern.test(`${prefix}iface2.iqiyi.com/views_pop/3.0/pop_control?test=1`)));
}
console.log('iQiyi gateway routing and response filter checks passed');
