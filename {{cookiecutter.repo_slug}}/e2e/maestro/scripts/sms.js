// The code in the last text to SMS_TO, read from the file SMS__BACKEND=file appends to, served at SMS.
const texts = http
  .get(`${SMS}/messages.jsonl`)
  .body.split('\n')
  .filter(Boolean)
  .map((line) => json(line))
  .filter((text) => text.to === SMS_TO)
if (!texts.length) throw new Error(`No text to ${SMS_TO} yet`)
// The body starts with the code.
output.code = texts[texts.length - 1].body.split(' ')[0]
