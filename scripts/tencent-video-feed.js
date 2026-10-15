// Tencent Video homepage feed filter for Shadowrocket.
// SPDX-License-Identifier: MIT
// Adapted from Feng-Feng1/surge TencentVideo-PageClean-V1.txt (MIT):
// https://github.com/Feng-Feng1/surge/blob/f7463681d65bd57c6bbeeded95cb12b6ded800c0/TencentVideo-PageClean-V1.txt
// Changes: feed cards, carousel ad items and ad extensions; retain other content.
(function () {
  "use strict";
  const PREFIX = "type.googleapis.com/com.tencent.qqlive.protocol.pb.";
  const MAX_BODY = 2097152;
  const MAX_FIELDS = 20000;
  let parsedFields = 0;

  function header(headers, name) {
    name = name.toLowerCase();
    if (Array.isArray(headers)) {
      const matches = headers.filter(h => String(h.field || "").toLowerCase() === name);
      return matches.length === 1 ? String(matches[0].value) : "";
    }
    const keys = Object.keys(headers || {}).filter(k => k.toLowerCase() === name);
    return keys.length === 1 ? String(headers[keys[0]]) : "";
  }

  function bytes(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) return new Uint8Array(value);
    return null;
  }

  function readVarint(b, pos, end) {
    let value = 0;
    let factor = 1;
    for (let i = 0; i < 10; i++) {
      if (pos >= end) throw new Error("truncated-varint");
      const c = b[pos++];
      if (i === 9 && c > 1) throw new Error("overflow-varint");
      value += (c & 127) * factor;
      if (!(c & 128)) return { value: Number.isSafeInteger(value) ? value : null, next: pos };
      factor *= 128;
    }
    throw new Error("overlong-varint");
  }

  function parse(b) {
    const out = [];
    for (let p = 0; p < b.length;) {
      if (++parsedFields > MAX_FIELDS) throw new Error("field-budget");
      const start = p;
      const tag = readVarint(b, p, b.length);
      p = tag.next;
      if (tag.value === null || tag.value < 8 || tag.value > 4294967295) throw new Error("bad-tag");
      const n = Math.floor(tag.value / 8);
      const w = tag.value % 8;
      const tagEnd = p;
      let valueStart = p;
      let value = null;
      if (w === 0) {
        const v = readVarint(b, p, b.length);
        value = v.value;
        p = v.next;
      } else if (w === 1 || w === 5) {
        p += w === 1 ? 8 : 4;
      } else if (w === 2) {
        const len = readVarint(b, p, b.length);
        if (len.value === null || len.value > MAX_BODY) throw new Error("bad-length");
        valueStart = len.next;
        p = valueStart + len.value;
      } else {
        throw new Error("unsupported-wire");
      }
      if (p > b.length) throw new Error("field-overrun");
      out.push({ n, w, value, raw: b.subarray(start, p), tag: b.subarray(start, tagEnd), data: b.subarray(valueStart, p) });
    }
    return out;
  }

  function one(fs, n, w) {
    const matches = fs.filter(f => f.n === n);
    return matches.length === 1 && matches[0].w === w ? matches[0] : null;
  }

  function numeric(fs, n, defaultValue) {
    const matches = fs.filter(f => f.n === n);
    if (!matches.length) return defaultValue;
    if (matches.length !== 1 || matches[0].w !== 0 || matches[0].value === null) return null;
    return matches[0].value;
  }

  function textEquals(b, s) {
    if (b.length !== s.length) return false;
    for (let i = 0; i < s.length; i++) if (b[i] !== s.charCodeAt(i)) return false;
    return true;
  }

  function contains(b, s) {
    outer: for (let i = 0; i <= b.length - s.length; i++) {
      for (let j = 0; j < s.length; j++) if (b[i + j] !== s.charCodeAt(j)) continue outer;
      return true;
    }
    return false;
  }

  function encodeVarint(v) {
    const out = [];
    do {
      const c = v % 128;
      v = Math.floor(v / 128);
      out.push(c | (v ? 128 : 0));
    } while (v);
    return new Uint8Array(out);
  }

  function concat(parts) {
    const length = parts.reduce((n, p) => n + p.length, 0);
    if (length > MAX_BODY) throw new Error("output-limit");
    const out = new Uint8Array(length);
    let p = 0;
    for (const part of parts) { out.set(part, p); p += part.length; }
    return out;
  }

  function wrap(field, payload) {
    return concat([field.tag, encodeVarint(payload.length), payload]);
  }

  function rebuild(fs, replacements) {
    return concat(fs.map(f => replacements.has(f) ? replacements.get(f) : f.raw));
  }

  function anyPayload(b, name) {
    const fs = parse(b);
    if (fs.length !== 2) return null;
    const type = one(fs, 1, 2), payload = one(fs, 2, 2);
    return type && payload && textEquals(type.data, PREFIX + name) ? payload.data : null;
  }

  function extensionPayload(field, kind, name) {
    const fs = parse(field.data);
    if (fs.length !== 2 || numeric(fs, 1, -1) !== kind) return null;
    const any = one(fs, 2, 2);
    return any ? anyPayload(any.data, name) : null;
  }

  function isAdBlock(b, mode) {
    const fs = parse(b);
    if (numeric(fs, 1, -1) !== 16 || numeric(fs, 2, -1) !== mode) return false;
    const any = one(fs, 4, 2);
    if (!any) return false;
    const ad = anyPayload(any.data, "AdFeedInfo");
    if (!ad || !contains(ad, "ad_request_id")) return false;
    const focusTracking = mode === 1 &&
      contains(ad, "://nc.gdt.qq.com/gdt_report.fcg?") &&
      contains(ad, "://c.l.qq.com/click?") &&
      contains(ad, "://p2.l.qq.com/p?");
    if (!contains(ad, "gdt_stats.fcg") && !focusTracking) return false;
    const poster = one(parse(ad), 3, 2);
    if (!poster) return false;
    if (mode === 1) return anyPayload(poster.data, "AdFocusPoster") !== null;
    return anyPayload(poster.data, "AdFeedImagePoster") !== null ||
      anyPayload(poster.data, "AdFeedVideoPoster") !== null;
  }

  function isFeedAd(field) {
    const fs = parse(field.data);
    if (fs.length !== 1) return false;
    const ext = one(fs, 10, 2);
    if (!ext) return false;
    const module = extensionPayload(ext, 1, "Module");
    if (!module) return false;
    const moduleFields = parse(module);
    if (moduleFields.some(f => ![1, 2, 3, 6].includes(f.n) || f.w !== 2)) return false;
    const blockList = one(moduleFields, 2, 2);
    if (!blockList) return false;
    const listFields = parse(blockList.data);
    const list = one(listFields, 5, 2);
    if (!list || listFields.some(f => ![4, 5, 8].includes(f.n) || f.w !== 2)) return false;
    const items = parse(list.data);
    return items.length === 1 && items[0].n === 1 && items[0].w === 2 && isAdBlock(items[0].data, 3);
  }

  function isFocusAd(field) {
    const fs = parse(field.data);
    if (fs.some(f => ![1, 2, 10].includes(f.n))) return false;
    if (!one(fs, 1, 2) || !one(fs, 2, 2)) return false;
    const ext = one(fs, 10, 2);
    if (!ext) return false;
    const block = extensionPayload(ext, 2, "Block");
    return block !== null && isAdBlock(block, 1);
  }

  function cleanCarousel(moduleField, counts) {
    const fs = parse(moduleField.data);
    const changes = new Map();
    for (const f of fs) {
      if (f.n !== 4 || f.w !== 2) continue;
      const mp = parse(f.data);
      if (mp.length !== 2) continue;
      const key = one(mp, 1, 2), value = one(mp, 2, 2);
      if (!key || !value || !textEquals(key.data, "0")) continue;
      const items = parse(value.data);
      if (!items.length || items.some(x => x.n !== 1 || x.w !== 2)) continue;
      const keep = items.filter(x => !isFocusAd(x));
      // Keep the upstream guard against handing the client an empty carousel.
      if (keep.length === items.length || keep.length === 0) continue;
      counts.focus += items.length - keep.length;
      const list = concat(keep.map(x => x.raw));
      changes.set(f, wrap(f, rebuild(mp, new Map([[value, wrap(value, list)]]))));
    }
    return changes.size ? wrap(moduleField, rebuild(fs, changes)) : moduleField.raw;
  }

  function isAdResponse(field) {
    const ad = extensionPayload(field, 5, "AdResponseInfo");
    return !!ad && contains(ad, "ad_request_id") && contains(ad, "feeds_ad_style");
  }

  function read32(b, p) {
    return b[p] * 16777216 + b[p + 1] * 65536 + b[p + 2] * 256 + b[p + 3];
  }

  function cleanFrame(b) {
    if (b.length < 16 || b.length > MAX_BODY || b[0] !== 9 || b[1] !== 48 ||
        b[2] !== 0 || b[3] !== 0 || read32(b, 4) !== b.length) return null;
    const offset = 16 + b[8] * 256 + b[9];
    if (offset >= b.length) return null;
    const meta = parse(b.subarray(16, offset));
    if ([1, 2, 4, 5, 9, 10, 12].some(n => numeric(meta, n, 0) !== 0)) return null;
    const fs = parse(b.subarray(offset));
    const extensions = one(fs, 8, 2);
    if (!extensions) return null;
    const extItems = parse(extensions.data);
    if (extItems.some(f => f.n !== 1 || f.w !== 2)) return null;
    if (!extItems.some(f => {
      const any = one(parse(f.data), 2, 2);
      return any && anyPayload(any.data, "ChannelPageConfig") !== null;
    })) return null;

    const changes = new Map();
    const counts = { focus: 0 };
    let normalMaps = 0, removed = 0;
    for (const f of fs) {
      if (f.n !== 1 || f.w !== 2) continue;
      const mp = parse(f.data);
      if (mp.length !== 2) continue;
      const key = one(mp, 1, 2), value = one(mp, 2, 2);
      if (!key || !value || !textEquals(key.data, "normal")) continue;
      if (++normalMaps > 1) return null;
      const modules = parse(value.data);
      if (modules.some(m => m.n !== 1 || m.w !== 2)) return null;
      const keep = [];
      for (const module of modules) {
        if (isFeedAd(module)) { removed++; continue; }
        keep.push(cleanCarousel(module, counts));
      }
      // Preserve the upstream guard against returning a completely empty page.
      if (!keep.length) return null;
      if (removed || counts.focus) {
        const list = concat(keep);
        changes.set(f, wrap(f, rebuild(mp, new Map([[value, wrap(value, list)]]))));
      }
    }
    if (normalMaps !== 1) return null;
    const keptExtensions = extItems.filter(f => !isAdResponse(f));
    const adResponses = extItems.length - keptExtensions.length;
    if (adResponses) changes.set(extensions, wrap(extensions, concat(keptExtensions.map(f => f.raw))));
    if (!changes.size) return null;
    const output = concat([b.subarray(0, offset), rebuild(fs, changes)]);
    const len = output.length;
    output[4] = Math.floor(len / 16777216) & 255;
    output[5] = Math.floor(len / 65536) & 255;
    output[6] = Math.floor(len / 256) & 255;
    output[7] = len & 255;
    return { body: output, removed, focus: counts.focus, adResponses };
  }

  let output = {};
  try {
    if (/^https:\/\/i\.video\.qq\.com\/$/i.test($request.url || "") &&
        $request.method === "POST" && Number($response.status) === 200 &&
        header($request.headers, "servicetag") === "channel$100101" &&
        /^application\/octet-stream(?:\s*;|$)/i.test(header($response.headers, "content-type"))) {
      const body = bytes($response.body);
      const result = body && cleanFrame(body);
      if (result) output = { body: result.body };
      console.log("TencentVideo feed: removed=" + (result ? result.removed : 0) +
        ", focus=" + (result ? result.focus : 0) +
        ", adResponses=" + (result ? result.adResponses : 0) + ", version=20261015.3");
    }
  } catch (_) {
    console.log("TencentVideo feed: passthrough (unrecognized frame), version=20261015.3");
  }
  $done(output);
})();
