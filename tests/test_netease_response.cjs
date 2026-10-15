const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const script = fs.readFileSync(path.join(__dirname, '../scripts/netease-response-compat.js'), 'utf8');
const moduleText = fs.readFileSync(path.join(__dirname, '../modules/NeteaseCloudMusic.sgmodule'), 'utf8');
const revision = 'a06d921d370ad6fca9e972a3f76e64d90bc8cfae';
const sourceUrl = `https://raw.githubusercontent.com/Keywos/rule/${revision}/script/wy/js/wyres.js`;
const rules = moduleText.split('\n').filter(line => line.includes('script-path='));
assert.equal(rules.length, 6);
for (const line of rules) assert.match(line, /script-path=.*\/netease-response-compat\.js,/);
const recommendationRule = rules.find(line => line.startsWith('推荐、'));
const tabRule = rules.find(line => line.startsWith('底部选项卡'));
const argumentFor = line => line.split('argument=')[1].replace(/\{\{\{\w+\}\}\}/g, 'false');

function run(source, { argument = '', endpoint = '/batch', body, compressed = true,
  cache = new Map(), status = 200, nativeDecoder = false, decodedBytes } = {}) {
  let result;
  const downloads = [], logs = [];
  vm.runInNewContext(script, {
    Uint8Array, ArrayBuffer,
    $argument: argument,
    $request: { url: `https://interface3.music.163.com/eapi${endpoint}`, headers: { 'x-aeapi': String(compressed) } },
    $response: { body },
    $utils: { ungzip: bytes => new Uint8Array(zlib.gunzipSync(bytes)) },
    $persistentStore: { read: key => cache.get(key), write: (value, key) => cache.set(key, value) },
    $httpClient: { get: (options, callback) => {
      downloads.push(options.url);
      callback(null, { status }, source);
    } },
    ...(nativeDecoder ? { TextDecoder } : {}),
    decodedBytes,
    console: { log: value => logs.push(value) },
    $done: value => { result = value; }
  });
  return { result, downloads, logs };
}

const probe = '$done({settings: $argument ? JSON.parse($argument) : null, text: new TextDecoder("utf-8").decode(decodedBytes)});';
const text = '每日推荐 🎵';
const bytes = Buffer.from(`x\uFEFF${text}y`);
for (const nativeDecoder of [false, true]) {
  for (const argument of [argumentFor(recommendationRule), 'PRGG="false"&PRRK="true"', '{"PRGG":"false","PRRK":true}']) {
    const { result } = run(probe, { argument, nativeDecoder, decodedBytes: bytes.subarray(1, -1) });
    assert.equal(result.text, text);
    assert.equal(result.settings.PRGG, false);
    assert.equal(result.settings.PRRK, argument.includes('true'));
  }
}
const cache = new Map();
assert.deepEqual(run(probe, { cache, decodedBytes: Buffer.from(text) }).downloads, [sourceUrl]);
assert.equal(run(probe, { cache, decodedBytes: Buffer.from(text) }).downloads.length, 0);
const failedCache = new Map();
assert.equal(Object.keys(run('', { status: 404, cache: failedCache }).result).length, 0);
assert.equal(failedCache.size, 0);

// Optionally exercise the author's actual pinned bundle without vendoring it.
if (process.argv[2]) {
  const upstream = fs.readFileSync(process.argv[2], 'utf8');
  const key = Buffer.alloc(16);
  [1698181731, 1801809512, 946104675, 1751477816].forEach((word, index) => key.writeUInt32BE(word, index * 4));
  function filter(endpoint, payload, argument = '', compressed = true, nativeDecoder = false) {
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    let input = Buffer.from(JSON.stringify(payload));
    if (compressed) input = zlib.gzipSync(input);
    const body = new Uint8Array(Buffer.concat([cipher.update(input), cipher.final()]));
    const { result, logs } = run(upstream, { endpoint, body, argument, compressed, nativeDecoder });
    assert.deepEqual(logs, []);
    assert(result.body, `${endpoint}: missing rewritten binary body`);
    const decipher = crypto.createDecipheriv('aes-128-ecb', key, null);
    return JSON.parse(Buffer.concat([decipher.update(result.body), decipher.final()]).toString('utf8'));
  }
  const daily = { bizCode: 'PAGE_RECOMMEND_DAILY_RECOMMEND', title: text, songs: [{ id: 1 }] };
  const playlist = { bizCode: 'PAGE_RECOMMEND_SPECIAL_CLOUD_VILLAGE_PLAYLIST', title: '推荐歌单', playlists: [{ id: 2 }] };
  const greeting = { bizCode: 'PAGE_RECOMMEND_GREETING', dslData: { greeting: { commonResourceList: [{ title: '下午好', summary: '推广' }] } } };
  const promotion = { bizCode: 'TEST_OPERATIONAL_PROMOTION', title: '云贝免费领现金红包' };
  const blocks = [greeting, daily, promotion, playlist];
  for (const compressed of [false, true]) {
    for (const nativeDecoder of [false, true]) {
      const result = filter('/link/page/rcmd/resource/show', { code: 200, data: {
        blocks, blockCodeOrderList: JSON.stringify(blocks.map(block => block.bizCode))
      } }, argumentFor(recommendationRule), compressed, nativeDecoder);
      assert.deepEqual(result.data.blocks.slice(1), [daily, playlist]);
      assert.equal(result.data.blocks[0].dslData.greeting.commonResourceList[0].title, '下午好');
      assert.equal(result.data.blocks[0].dslData.greeting.commonResourceList[0].summary, '');
      assert.deepEqual(JSON.parse(result.data.blockCodeOrderList), [greeting, daily, playlist].map(block => block.bizCode));
    }
  }
  const options = argumentFor(recommendationRule).replace('PRSCVPT=false', 'PRSCVPT=true');
  assert.deepEqual(filter('/link/page/rcmd/resource/show', { data: { blocks } }, options).data.blocks.map(block => block.bizCode), [greeting.bizCode, daily.bizCode]);
  const refresh = filter('/link/page/rcmd/block/resource/multi/refresh', {
    data: blocks.map(block => ({ blockCode: block.bizCode, block }))
  }, argumentFor(recommendationRule));
  assert.deepEqual(refresh.data.map(item => item.blockCode), [greeting, daily, playlist].map(block => block.bizCode));
  assert.equal(refresh.data[0].block.dslData.greeting.commonResourceList.length, 1);
  const tabs = ['漫游', '笔记', '发现'].map(title => ({ title, subCommonResourceList: [{ title: '直播' }, { title: '音乐' }] }));
  const defaultTabs = filter('/link/home/framework/tab', { data: { commonResourceList: tabs } }, argumentFor(tabRule));
  assert.deepEqual(defaultTabs.data.commonResourceList.map(tab => tab.title), ['漫游', '笔记', '发现']);
  const hiddenTab = filter('/link/home/framework/tab', { data: { commonResourceList: tabs } }, 'MY=true&DT=false&FX=false');
  assert.deepEqual(hiddenTab.data.commonResourceList.map(tab => tab.title), ['笔记', '发现']);
  assert.deepEqual(filter('/link/position/show/resource', { data: { crossPlatformResource: { positionCode: 'MyPageBar', ad: true } } }).data.crossPlatformResource, {});
  const batch = filter('/batch', { '/api/ad/get': { data: { ads: { ad: 1 } } }, '/api/song/detail': { data: { id: 1 } } });
  assert.deepEqual(batch['/api/ad/get'].data, { code: 200, ads: {} });
  assert.deepEqual(batch['/api/song/detail'].data, { id: 1 });
  const banners = filter('/homepage/block/page', { data: { blocks: [{ showType: 'BANNER', extInfo: { banners: [{ typeTitle: '广告' }, { typeTitle: '活动' }, { typeTitle: '新歌' }] } }] } });
  assert.deepEqual(banners.data.blocks[0].extInfo.banners, [{ typeTitle: '新歌' }]);
  console.log('Netease encrypted upstream response checks passed');
} else {
  console.log('Netease compatibility checks passed (supply pinned upstream file for encrypted response checks)');
}
