// Preserve the original module's getvinfo form rewrite without its missing dependency.
const body = $request.body;
$done(typeof body === "string" ? {
  body: body.replace(/&sppreviewtype=\d(.*)&spsrt=\d/, "&sppreviewtype=0$1&spsrt=0")
} : {});
