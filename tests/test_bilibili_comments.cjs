const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const compat = fs.readFileSync(path.join(__dirname, '../scripts/bilibili-protobuf-compat.js'), 'utf8');
const revision = '290bcbdd2f158cdd8f7db9c996e90fe63490e16f';
const upstreamUrl = phase => `https://raw.githubusercontent.com/kokoryh/Sparkle/${revision}/dist/bilibili.protobuf.${phase}.js`;
const sources = Object.fromEntries(['request', 'response'].map((phase, index) => [phase,
  process.argv[index + 2] ? fs.readFileSync(process.argv[index + 2], 'utf8') :
    execFileSync('curl', ['-fsSL', '--max-time', '20', upstreamUrl(phase)], { encoding: 'utf8' })
]));
for (const source of Object.values(sources)) {
  assert.equal(source.split('.topReplies.filter(').length - 1, 1, 'pinned upstream predicate changed');
}

function varint(value) {
  const bytes = [];
  for (let n = BigInt(value);; n >>= 7n) {
    bytes.push(Number(n & 127n) | (n > 127n ? 128 : 0));
    if (n <= 127n) return Buffer.from(bytes);
  }
}
function field(number, data) {
  const bytes = typeof data === 'string' ? Buffer.from(data) : data;
  return Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);
}
function reply(message, title, appName = '', url = 'https://example.invalid/product') {
  const entry = title ? field(5, Buffer.concat([field(1, url), field(2, Buffer.concat([
    field(1, title), field(5, appName)
  ]))])) : Buffer.alloc(0);
  return Buffer.concat([
    field(12, Buffer.concat([field(1, message), entry])),
    // A real ReplyInfo carries fields outside the upstream's minimal schema.
    varint(8), varint(12345678901234567n), field(80, 'keep-unknown-reply-field')
  ]);
}
const replies = [
  reply('普通置顶评论'),
  reply('30天无理由试坐，大体型放心坐', '跳转京东｜【券550元】商品优惠券'),
  reply('查看链接', '商品详情', '京东'),
  reply('旧带货链接', '商品', '', 'https://b23.tv/mall/fixture'),
  reply('京东购买链接'),
  reply('视频补充说明', '参考资料', '浏览器')
];
const normalReply = reply('普通讨论：京东与淘宝', '京东', '京东');
const payload = Buffer.concat([
  ...replies.map(data => field(14, data)),
  field(6, normalReply), field(99, 'keep-unknown-main-field')
]);
function frame(body, compressed) {
  const data = compressed ? zlib.gzipSync(body) : body;
  const header = Buffer.alloc(5);
  header[0] = Number(compressed);
  header.writeUInt32BE(data.length, 1);
  return new Uint8Array(Buffer.concat([header, data]));
}
function fields(buffer) {
  const bytes = Buffer.from(buffer), out = [];
  let offset = 0;
  function read() {
    let value = 0n, shift = 0n;
    while (offset < bytes.length) {
      const byte = bytes[offset++];
      value |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return Number(value);
      shift += 7n;
    }
    throw new Error('truncated fixture');
  }
  while (offset < bytes.length) {
    const start = offset, tag = read(), wire = tag % 8;
    let data;
    if (wire === 2) {
      const size = read();
      data = bytes.subarray(offset, offset + size);
      offset += size;
    } else if (wire === 0) read();
    else if (wire === 1 || wire === 5) offset += wire === 1 ? 8 : 4;
    else throw new Error('unsupported fixture wire');
    out.push({ number: Math.floor(tag / 8), data, raw: bytes.subarray(start, offset) });
  }
  return out;
}

async function run(phase, { enabled = true, compressed = false, cache = new Map(), original = false } = {}) {
  const logs = [], downloads = [];
  const input = frame(payload, compressed);
  const headers = { 'content-type': 'application/grpc', 'grpc-status': '0' };
  const response = { status: 200, headers, body: input, h2_trailers: { 'grpc-status': '0' } };
  const settings = { purifyComment: enabled, logLevel: 'error' };
  const result = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('upstream did not finish')), 3000);
    const context = {
      Uint8Array, ArrayBuffer, URL, TextDecoder, TextEncoder,
      $argument: JSON.stringify(original ? settings : { ...settings, _biliPhase: phase }),
      $request: {
        url: 'https://grpc.biliapi.net/bilibili.main.community.reply.v1.Reply/MainList',
        method: 'POST', headers: { te: 'trailers' }, body: frame(Buffer.alloc(0), false)
      },
      ...(phase === 'response' ? { $response: response } : {}),
      $utils: { ungzip: data => new Uint8Array(zlib.gunzipSync(data)) },
      $persistentStore: { read: key => cache.get(key), write: (value, key) => cache.set(key, value) },
      $httpClient: {
        get: (options, callback) => {
          downloads.push(options.url);
          assert.equal(options.url, upstreamUrl(phase));
          callback(null, { status: 200 }, sources[phase]);
        },
        post: (options, callback) => callback(null, response, input)
      },
      console: { log: value => logs.push(value) },
      $done: value => { clearTimeout(timer); resolve(value); }
    };
    try { vm.runInNewContext(original ? sources[phase] : compat, context); }
    catch (error) { clearTimeout(timer); reject(error); }
  });
  const output = phase === 'request' ? result.response : result;
  assert(output?.body instanceof Uint8Array, logs.join('\n'));
  const body = Buffer.from(output.body);
  assert.equal(body[0], 0);
  assert.equal(body.readUInt32BE(1), body.length - 5);
  const metadata = JSON.parse(JSON.stringify({ ...output, body: undefined }));
  return { body, fields: fields(body.subarray(5)), metadata, logs, downloads };
}

(async () => {
  for (const phase of ['request', 'response']) {
    const original = await run(phase, { original: true });
    const originalPinned = original.fields.filter(f => f.number === 14);
    assert.equal(originalPinned.length, 4, 'original filter misses title/appName-only ads');
    for (const compressed of [false, true]) {
      const result = await run(phase, { compressed });
      assert.deepEqual(result.metadata, original.metadata);
      const pinned = result.fields.filter(f => f.number === 14);
      assert.equal(pinned.length, 2);
      assert.deepEqual(pinned.map(f => f.raw), [originalPinned[0].raw, originalPinned[3].raw]);
      for (const number of [6, 99]) {
        assert.deepEqual(result.fields.filter(f => f.number === number).map(f => f.raw),
          original.fields.filter(f => f.number === number).map(f => f.raw));
      }
      assert.equal(result.logs.length, 2);
      assert(result.logs.every(log => log === 'Bilibili comments: version=20261017.1 removed-pinned-commerce=1'));
    }
    const originalDisabled = await run(phase, { original: true, enabled: false });
    const disabled = await run(phase, { enabled: false });
    assert.deepEqual(disabled.body, originalDisabled.body);
    assert.deepEqual(disabled.logs, []);
    const cache = new Map();
    const first = await run(phase, { cache });
    const second = await run(phase, { cache });
    assert.deepEqual(first.body, second.body);
    assert.equal(second.downloads.length, 0);
    assert.equal([...cache.values()][0], sources[phase], 'cache retains the original bundle');
  }
  console.log('Bilibili pinned commerce comment checks passed (actual upstream, both phases)');
})().catch(error => { console.error(error); process.exitCode = 1; });
