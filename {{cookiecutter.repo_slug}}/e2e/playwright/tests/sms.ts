import { expect } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'

// SMS__BACKEND=file appends each text here, on a volume the backend shares with this container.
const TEXTS = '/sms/messages.jsonl'

type Text = { to: string; body: string }

/** A number no other spec uses, so a code read back is this spec's own. */
export function aNumber(): string {
  return `+1415${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`
}

function textsTo(number: string): Text[] {
  if (!existsSync(TEXTS)) return []
  const lines = readFileSync(TEXTS, 'utf8').split('\n').filter(Boolean)
  return lines.map((line) => JSON.parse(line) as Text).filter((text) => text.to === number)
}

/** The code in the `count`th text to `number`, once it has arrived: the body starts with it. */
export async function codeTextedTo(number: string, count = 1): Promise<string> {
  await expect.poll(() => textsTo(number).length, { timeout: 10_000 }).toBeGreaterThanOrEqual(count)
  return textsTo(number)[count - 1].body.split(' ')[0]
}
