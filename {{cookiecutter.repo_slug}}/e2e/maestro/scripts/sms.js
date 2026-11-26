// The code in the last text to SMS_TO, read from the file SMS__BACKEND=file appends to, served at SMS.
// The worker sends it, a while after the screen says so on a busy machine; Maestro's scripts can't sleep, so ask again.
const deadline = Date.now() + 60000
let texts = []
while (!texts.length && Date.now() < deadline) {
  texts = http
    .get(`${SMS}/messages.jsonl`)
    .body.split('\n')
    .filter(Boolean)
    .map((line) => json(line))
    .filter((text) => text.to === SMS_TO)
}
if (!texts.length) throw new Error(`No text to ${SMS_TO} in a minute`)
// The body starts with the code.
output.code = texts[texts.length - 1].body.split(' ')[0]
