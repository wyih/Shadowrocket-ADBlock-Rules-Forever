const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/rednote-watermark-response.js'), 'utf8');
const png = fs.readFileSync(path.join(root, 'modules/assets/rednote-watermark.png'));

function responseFor(url) {
  const results = [];
  vm.runInNewContext(source, {
    $request: { url },
    $done: value => results.push(JSON.parse(JSON.stringify(value)))
  }, { timeout: 1000 });
  assert.equal(results.length, 1);
  return results[0];
}

for (const url of [
  'https://ci.xiaohongshu.com/system_config/watermark/tiny3_100.jpg',
  'https://ci.xiaohongshu.com/system_config/watermark/tiny3_100.jpg?version=1'
]) {
  const { response } = responseFor(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'image/png');
  assert.equal(Number(response.headers['Content-Length']), png.length);
  assert.equal(response['body-base64'], true);
  assert.deepEqual(Buffer.from(response.body, 'base64'), png);
}
for (const url of [
  'https://ci.xiaohongshu.com/system_config/watermark/tiny3_100.jpg.bak',
  'https://ci.xiaohongshu.com/photos/image.jpg',
  'https://edith.xiaohongshu.com/api/sns/v1/note/imagefeed'
]) {
  assert.deepEqual(responseFor(url), {});
}

const moduleText = fs.readFileSync(path.join(root, 'modules/experimental/RedNote-H2.sgmodule'), 'utf8');
assert.match(moduleText, /^h2 = true$/m);
assert.doesNotMatch(moduleText, /data-type=base64/);
assert.match(moduleText, /静态水印素材 = type=http-request, .*engine=webview/);
assert.equal((moduleText.match(/script-path=/g) || []).length, 13);
console.log('PASS: binary PNG response, JSON bridge contract, narrow URL match and H2 module wiring');
