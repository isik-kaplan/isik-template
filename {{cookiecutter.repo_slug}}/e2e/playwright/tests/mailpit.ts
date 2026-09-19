import { expect } from '@playwright/test'

const MAILPIT_URL = 'http://mailpit:8025'

type MailpitMessageSummary = { ID: string }
type MailpitSearchResponse = { messages: MailpitMessageSummary[] }
type MailpitMessage = { Text: string; HTML: string }

/** Polls mailpit for the most recent email to `address`, since delivery is async relative to the
 * request that triggered it (allauth sends via a signal, not inline in the response). */
async function waitForLatestEmailTo(address: string): Promise<MailpitMessage> {
  await expect(async () => {
    const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
    const data = (await response.json()) as MailpitSearchResponse
    expect(data.messages.length).toBeGreaterThan(0)
  }).toPass({ timeout: 10_000 })

  const response = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${address}`)}`)
  const data = (await response.json()) as MailpitSearchResponse
  // Most recent first - a suite that sends this address more than one email (e.g. signup then a
  // later password reset) always wants the latest, not the first ever sent.
  const messageResponse = await fetch(`${MAILPIT_URL}/api/v1/message/${data.messages[0].ID}`)
  return (await messageResponse.json()) as MailpitMessage
}

/** Extracts the first link matching `pathPrefix` (e.g. "/auth/verify-email/") from the latest
 * email sent to `address`. */
export async function extractLinkFromEmail(address: string, pathPrefix: string): Promise<string> {
  const message = await waitForLatestEmailTo(address)
  const body = message.Text || message.HTML
  const match = body.match(new RegExp(`https?://[^\\s"'<>]*${pathPrefix.replace(/\//g, '\\/')}[^\\s"'<>]*`))
  if (!match) {
    throw new Error(`No link matching "${pathPrefix}" found in the email sent to ${address}`)
  }
  return match[0]
}

export async function clearMailbox(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' })
}
