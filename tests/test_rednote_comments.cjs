const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const wrapper = read('scripts/rednote-comment-diagnostics.js');
const upstreamURL = 'https://raw.githubusercontent.com/fmz200/wool_scripts/5d5f63fcf98bc69d5f8f1b1bae6f86a01ee4bb97/Scripts/xiaohongshu/xiaohongshu.js';
const upstream = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') :
  execFileSync('curl', ['-fsSL', '--max-time', '30', upstreamURL], { encoding: 'utf8' });

function run(source, route, input, store = new Map(), networkError = false) {
  const results = [], logs = [];
  let downloads = 0;
  vm.runInNewContext(source, {
    $request: { url: 'https://edith.xiaohongshu.com/api/sns/' + route },
    $response: { body: JSON.stringify(input) },
    $persistentStore: {
      read: key => store.get(key) || null,
      write: (value, key) => { store.set(key, value); return true; }
    },
    $httpClient: { get(options, callback) {
      downloads++;
      assert.equal(options.url, upstreamURL);
      callback(networkError ? 'offline' : null, { status: networkError ? 503 : 200 }, upstream);
    } },
    $done: value => results.push(JSON.parse(JSON.stringify(value))),
    console: { log: (...args) => logs.push(args.join(' ')) }
  }, { timeout: 1000 });
  assert.equal(results.length, 1);
  return { result: results[0], logs, downloads, store };
}

const listRoute = 'v5/note/comment/list?fixture=1';
const downloadRoute = 'v1/interaction/comment/video/download?media_type=live_photo';
const videoInfo = {
  stream: {
    h265: [{ master_url: 'https://media.example/marked.mp4', width: 1080, height: 1440 }],
    h264: [{ master_url: 'https://media.example/clean.mp4', width: 720, height: 960 }]
  },
  consumer: { origin_video_key: 'fixture-original-key' }
};
const input = { code: 0, data: { comments: [{ id: 'comment', note_id: 'note',
  content: 'private-comment-text', user: { red_id: 'author' },
  pictures: [{ video_id: 'video', video_info: JSON.stringify(videoInfo) }],
  sub_comments: [{ id: 'sub', note_id: 'note', pictures: [{
    video_id: 'sub-video', video_info: JSON.stringify(videoInfo)
  }] }]
}] } };
const originalStore = new Map(), instrumentedStore = new Map();
const originalList = run(upstream, listRoute, input, originalStore);
const instrumentedList = run(wrapper, listRoute, input, instrumentedStore);
assert.deepEqual(instrumentedList.result, originalList.result);
assert.equal(instrumentedList.downloads, 1);
const candidateLogs = instrumentedList.logs.filter(line => line.startsWith('RedNote live candidates:'));
assert.equal(candidateLogs.length, 2);
const candidate = JSON.parse(candidateLogs[0].slice(candidateLogs[0].indexOf('{')));
assert.deepEqual(candidate.media.stream, videoInfo.stream);
assert.deepEqual(candidate.media.consumer, videoInfo.consumer);
assert(!candidateLogs.join('\n').includes('private-comment-text'));
for (const [key, value] of originalStore) assert.equal(instrumentedStore.get(key), value);

const download = { code: 0, data: { video: { video_id: 'video', video_url: 'https://media.example/download.mp4' } } };
const originalDownload = run(upstream, downloadRoute, download, originalStore);
const instrumentedDownload = run(wrapper, downloadRoute, download, instrumentedStore);
assert.deepEqual(instrumentedDownload.result, originalDownload.result);
assert.equal(instrumentedDownload.downloads, 0);
// This diagnostic exposes both streams while preserving the existing H265 choice.
assert.equal(JSON.parse(instrumentedDownload.result.body).data.video.video_url, videoInfo.stream.h265[0].master_url);
const still = { code: 0, data: { comments: [{ note_id: 'note', pictures: [{ url: 'https://media.example/still.jpg' }] }] } };
assert.deepEqual(run(wrapper, listRoute, still, instrumentedStore).result, run(upstream, listRoute, still).result);
assert.deepEqual(run(wrapper, listRoute, input, new Map(), true).result, {});

const moduleText = read('modules/experimental/RedNote-H2.sgmodule');
const rule = moduleText.split('\n').find(line => line.startsWith('移除评论区实况照片水印 ='));
assert.match(rule, /rednote-comment-diagnostics\.js\?v=20261018\.1/);
assert.doesNotMatch(rule, /engine=webview/);
assert.equal((moduleText.match(/script-path=/g) || []).length, 13);
console.log('PASS: pinned filter equivalence, full candidate streams, unchanged static images and download selection, source cache and offline fallback');
