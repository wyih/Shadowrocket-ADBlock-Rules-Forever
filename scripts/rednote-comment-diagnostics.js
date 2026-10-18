// Keep fmz200's pinned comment filter and record the video candidates it receives.
(function () {
  const revision = "5d5f63fcf98bc69d5f8f1b1bae6f86a01ee4bb97";
  const cacheKey = "wyih.rednote.comments.source." + revision;
  const anchor = "const picObj = JSON.parse(picture.video_info);";
  const diagnostic = `
      try {
        const media = { keys: Object.keys(picObj) };
        for (const key of Object.keys(picObj)) {
          if (/stream|consumer|origin|media|water|url|key/i.test(key)) media[key] = picObj[key];
        }
        console.log("RedNote live candidates: version=20261018.1 " +
          JSON.stringify({ video_id: picture.video_id, media }));
      } catch (_) {}
  `;

  function execute(source) {
    // Instrument the known extraction point; leave selection and replacement unchanged.
    if (source.split(anchor).length === 2) source = source.replace(anchor, anchor + diagnostic);
    else console.log("RedNote live candidates: extraction point unavailable");
    try { eval(source); } catch (_) {
      console.log("RedNote comment filter: execution failed");
      $done({});
    }
  }

  const cached = $persistentStore.read(cacheKey);
  if (typeof cached === "string" && cached) return execute(cached);
  const url = "https://raw.githubusercontent.com/fmz200/wool_scripts/" + revision +
    "/Scripts/xiaohongshu/xiaohongshu.js";
  $httpClient.get({ url, timeout: 3 }, (error, response, source) => {
    if (error || !response || response.status !== 200 || typeof source !== "string" || !source.trim()) {
      console.log("RedNote comment filter: upstream download failed");
      return $done({});
    }
    $persistentStore.write(source, cacheKey);
    execute(source);
  });
})();
