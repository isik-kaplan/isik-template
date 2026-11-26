// Confirms the address MAIL_TO signed up with, as opening the mailed link would: the link carries allauth's key.
// MAILPIT and AUTH_HOST come from the run; the host needn't resolve it, so the request names it in Host.
// The worker sends it, a while after the screen says so on a busy machine; Maestro's scripts can't sleep, so ask again.
const deadline = Date.now() + 60000
let messages = []
while (!messages.length && Date.now() < deadline) {
  messages = json(http.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + MAIL_TO)}`).body).messages
}
if (!messages.length) throw new Error(`No mail to ${MAIL_TO} in a minute`)
const message = json(http.get(`${MAILPIT}/api/v1/message/${messages[0].ID}`).body)
const link = (message.Text || message.HTML).match(/\/auth\/verify-email\/([^\s"'<>]+)/)
if (!link) throw new Error(`No verification link in the mail to ${MAIL_TO}`)
const answer = http.post('http://127.0.0.1/v0/app/auth/email/verify', {
  headers: { 'Content-Type': 'application/json', Host: AUTH_HOST },
  body: JSON.stringify({ key: decodeURIComponent(link[1]) }),
})
// 401 is the verified address of nobody signed in on this client; anything else means the key was refused.
if (answer.status !== 200 && answer.status !== 401) throw new Error(`Verifying ${MAIL_TO} answered ${answer.status}`)
