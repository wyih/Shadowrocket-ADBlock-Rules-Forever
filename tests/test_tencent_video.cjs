const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const moduleText = read('modules/TencentVideo.sgmodule');
const requestScript = read('scripts/tencent-video-request.js');
const feedScript = read('scripts/tencent-video-feed.js');
function pattern(name) {
  const line = moduleText.split('\n').find(l => l.startsWith(name + ' ='));
  return new RegExp(line.split('pattern=(?i)')[1].split(', script-path=')[0], 'i');
}
function rewrite(body) {
  let output;
  vm.runInNewContext(requestScript, { $request: { body }, $done: x => { output = x; } });
  return output;
}
for (const [input, expected] of [
  ['spsrt=12&sig=A%2BB%26C&sppreviewtype=23&spadseg=3', 'spsrt=0&sig=A%2BB%26C&sppreviewtype=0&spadseg=0'],
  ['sppreviewtype=15', 'sppreviewtype=0'],
  ['spsrt=9&spsrt=12', 'spsrt=0&spsrt=0'],
  ['sppreviewtype=3x&xspsrt=2&vid=keep', 'sppreviewtype=3x&xspsrt=2&vid=keep'],
  ['vid=keep&sig=spsrt%3D9', 'vid=keep&sig=spsrt%3D9']
]) assert.equal(rewrite(input).body, expected);
assert.equal(Object.keys(rewrite(undefined)).length, 0);
assert.equal(Object.keys(rewrite(new Uint8Array([1, 2]))).length, 0);
for (const host of ['vv.video.qq.com', 'svv.video.qq.com']) {
  assert(pattern('移除广告').test(`https://${host}/getvinfo`));
  assert(pattern('移除广告').test(`https://${host}/getvinfo?vid=test`));
  assert(!pattern('移除广告').test(`https://${host}/getvinfoOther`));
  assert(!pattern('移除广告').test(`https://${host}/getvkey`));
  assert(moduleText.split('hostname = %APPEND% ')[1].includes(host));
}
assert(pattern('首页广告卡片').test('https://i.video.qq.com/'));
for (const url of ['https://i.video.qq.com/other', 'https://i.video.qq.com.example.org/', 'https://36.155.163.124/']) {
  assert(!pattern('首页广告卡片').test(url));
}
assert.match(moduleText, /首页广告卡片 = .*requires-body=true, binary-body-mode=true/);
for (const host of ['i.video.qq.com', 'tab.video.qq.com', 'svv.video.qq.com', 'playproxy.video.qq.com', 'defaultts.tc.qq.com']) {
  assert(!moduleText.split('\n').includes(`DOMAIN,${host},REJECT`));
}

// Synthetic Protobuf fixtures follow the published PageClean wire schema.
// All strings are fabricated; no captured account or request data is stored.
const join = (...parts) => Buffer.concat(parts);
function varint(number) {
  const bytes = [];
  do { bytes.push((number % 128) | (number >= 128 ? 128 : 0)); number = Math.floor(number / 128); } while (number);
  return Buffer.from(bytes);
}
const field = (n, data) => {
  data = Buffer.from(data);
  return join(varint(n * 8 + 2), varint(data.length), data);
};
const num = (n, value) => join(varint(n * 8), varint(value));
const any = (name, data) => join(field(1, 'type.googleapis.com/com.tencent.qqlive.protocol.pb.' + name), field(2, data));
const extension = (kind, name, data) => join(num(1, kind), field(2, any(name, data)));
function adModule({ poster = 'AdFeedImagePoster', tracking = 'ad_request_id=fake gdt_stats.fcg', blockType = 16 } = {}) {
  const adInfo = join(field(1, tracking), field(3, any(poster, field(1, 'fake poster'))));
  const block = join(num(1, blockType), num(2, 3), field(4, any('AdFeedInfo', adInfo)));
  const list = field(5, field(1, block));
  return field(1, field(10, extension(1, 'Module', field(2, list))));
}
const focusTracking = 'ad_request_id=fake https://nc.gdt.qq.com/gdt_report.fcg?fake=1 https://c.l.qq.com/click?fake=1 https://p2.l.qq.com/p?fake=1';
function focusItem({ poster = 'AdFocusPoster', tracking = focusTracking, blockType = 16, mode = 1 } = {}) {
  const adInfo = join(field(1, tracking), field(3, any(poster, field(1, 'fake poster'))));
  const block = join(num(1, blockType), num(2, mode), field(4, any('AdFeedInfo', adInfo)));
  return field(1, join(field(1, 'fake carousel id'), field(2, 'fake title'), field(10, extension(2, 'Block', block))));
}
function carousel(items, key = '0') {
  return field(1, join(field(1, 'carousel metadata'),
    field(4, join(field(1, key), field(2, join(...items)))), field(6, 'keep module metadata')));
}
const normal = field(1, join(field(1, 'normal video'), field(2, 'keep title and playback reference')));
const unknown = field(1, field(10, extension(2, 'FutureModule', field(1, 'ad_request_id=fake gdt_stats.fcg'))));
const extensionItems = join(
  field(1, extension(1, 'ChannelPageConfig', field(1, 'normal page config'))),
  field(1, extension(5, 'AdResponseInfo', field(1, 'keep unrelated extension')))
);
const extensions = field(8, extensionItems);
const adExtensions = field(8, join(extensionItems,
  field(1, extension(5, 'AdResponseInfo', field(1, 'ad_request_id=fake feeds_ad_style=3')))
));
const otherFields = join(num(20, 1), field(21, 'unknown field retained'));
function frame(modules, { metadata = num(3, 7), ext = extensions, extra = otherFields, duplicate = false } = {}) {
  const normalMap = field(1, join(field(1, 'normal'), field(2, join(...modules))));
  const payload = join(normalMap, duplicate ? normalMap : Buffer.alloc(0), ext, extra);
  const header = Buffer.alloc(16);
  header[0] = 9; header[1] = 48;
  header.writeUInt32BE(16 + metadata.length + payload.length, 4);
  header.writeUInt16BE(metadata.length, 8);
  return join(header, metadata, payload);
}
function run(body, request = {}, response = {}, source = feedScript) {
  let output, calls = 0;
  const logs = [];
  vm.runInNewContext(source, {
    Uint8Array, ArrayBuffer,
    $request: { url: 'https://i.video.qq.com/', method: 'POST', headers: { ServiceTag: 'channel$100101' }, ...request },
    $response: { status: 200, headers: { 'Content-Type': 'application/octet-stream' }, body, ...response },
    $done: x => { calls++; output = x; },
    console: { log: x => logs.push(x) }
  }, { timeout: 1000 });
  assert.equal(calls, 1);
  return { output, logs };
}
function unchanged(body, request, response) {
  assert.equal(Object.keys(run(body, request, response).output).length, 0);
}
const untouched = adModule({ tracking: 'not an ad: gdt_stats.fcg only' });
const mixed = frame([normal, adModule(), unknown, adModule({ poster: 'AdFeedVideoPoster' }), untouched], { ext: adExtensions });
const before = Buffer.from(mixed);
const expected = frame([normal, unknown, untouched]);
const filtered = run(mixed);
assert.deepEqual(Buffer.from(filtered.output.body), expected);
assert.deepEqual(mixed, before, 'input bytes must not be mutated');
assert.deepEqual(filtered.logs, ['TencentVideo feed: removed=2, focus=0, adResponses=1, version=20261015.3']);
assert.equal(Buffer.from(filtered.output.body).readUInt32BE(4), expected.length);
assert.deepEqual(Buffer.from(run(mixed.buffer.slice(mixed.byteOffset, mixed.byteOffset + mixed.byteLength)).output.body), expected);
unchanged(expected);
assert.deepEqual(Buffer.from(run(frame([normal], { ext: adExtensions })).output.body), frame([normal]));
unchanged(frame([normal, adModule({ blockType: 15 }), adModule({ poster: 'NormalPoster' })]));
// The top carousel nests its ad among regular items rather than feed modules.
const regularFocus = focusItem({ blockType: 1, poster: 'VideoPoster', tracking: 'ordinary programme' });
const ambiguousFocus = [
  focusItem({ tracking: 'gdt_stats.fcg without a request id' }),
  focusItem({ tracking: 'ad_request_id=fake https://nc.gdt.qq.com/gdt_report.fcg?fake=1' }),
  focusItem({ poster: 'VideoPoster' }),
  focusItem({ mode: 3 })
];
const focusKeep = [regularFocus, ...ambiguousFocus];
const carouselInput = frame([carousel([focusItem(), ...focusKeep,
  focusItem({ tracking: 'ad_request_id=fake gdt_stats.fcg' })]), normal], { ext: adExtensions });
const carouselExpected = frame([carousel(focusKeep), normal]);
const carouselBefore = Buffer.from(carouselInput);
const carouselFiltered = run(carouselInput);
assert.deepEqual(Buffer.from(carouselFiltered.output.body), carouselExpected);
assert.deepEqual(carouselInput, carouselBefore, 'carousel input must not be mutated');
assert(carouselFiltered.logs.some(line => /focus=2(?:,|$)/.test(line)));
assert.equal(Buffer.from(carouselFiltered.output.body).readUInt32BE(4), carouselExpected.length);
unchanged(carouselExpected);
assert.deepEqual(Buffer.from(run(frame([carousel([regularFocus, focusItem()]), normal])).output.body),
  frame([carousel([regularFocus]), normal]));
assert.deepEqual(Buffer.from(run(frame([carousel([regularFocus, focusItem()]), adModule(), normal])).output.body),
  frame([carousel([regularFocus]), normal]));
unchanged(frame([carousel([focusItem(), regularFocus], 'unknown-group'), normal]));
unchanged(frame([carousel([focusItem()]), normal]));
unchanged(frame([adModule()]));
unchanged(frame([normal, adModule()], { metadata: num(1, 1) }));
unchanged(frame([normal, adModule()], { ext: field(8, field(1, extension(1, 'OtherPage', Buffer.alloc(0)))) }));
unchanged(frame([normal, adModule()], { duplicate: true }));
unchanged(mixed.subarray(0, mixed.length - 1));
const badWire = frame([normal, adModule()], { extra: Buffer.from([0xff]) });
unchanged(badWire);
unchanged(Buffer.from('not protobuf'));
unchanged('binary returned as text');
unchanged(new Uint8Array(2097153));
for (const request of [
  { url: 'https://i.video.qq.com/other' }, { url: 'https://36.155.163.124/' },
  { method: 'GET' }, { headers: {} }, { headers: { servicetag: 'other-channel' } }
]) unchanged(mixed, request);
unchanged(mixed, {}, { status: 500 });
unchanged(mixed, {}, { headers: { 'Content-Type': 'text/html' } });
// Exercise the alternate native header representation as well.
assert.deepEqual(Buffer.from(run(mixed,
  { headers: [{ field: 'ServiceTag', value: 'channel$100101' }] },
  { headers: [{ field: 'content-type', value: 'application/octet-stream; charset=binary' }] }
).output.body), expected);
// Optional comparison against the pinned public source used for this adaptation.
if (process.env.TENCENT_REFERENCE_SCRIPT) {
  const reference = fs.readFileSync(process.env.TENCENT_REFERENCE_SCRIPT, 'utf8');
  assert.deepEqual(Buffer.from(run(mixed, {}, {}, reference).output.body), expected);
  assert.deepEqual(Buffer.from(run(carouselInput, {}, {}, reference).output.body), carouselExpected);
}
console.log('Tencent Video request and binary feed checks passed');
