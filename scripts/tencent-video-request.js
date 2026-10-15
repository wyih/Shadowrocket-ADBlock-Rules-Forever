// Normalize each playback-ad flag independently without re-encoding signed fields.
const body = $request.body;
$done(typeof body === "string" ? {
  body: body.replace(/(^|&)(sppreviewtype|spsrt|spadseg)=\d+(?=&|$)/g, "$1$2=0")
} : {});
