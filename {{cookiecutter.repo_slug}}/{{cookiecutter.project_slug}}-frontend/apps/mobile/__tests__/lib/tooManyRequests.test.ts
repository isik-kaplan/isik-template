import '@/lib/i18n'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import i18next from 'i18next'

const t = i18next.t.bind(i18next)

describe('tooManyRequestsMessage', () => {
  it('is nothing for any answer but a refusal for coming too often', () => {
    expect(tooManyRequestsMessage(t, new Response(null, { status: 400 }))).toBeUndefined()
    expect(tooManyRequestsMessage(t, undefined)).toBeUndefined()
  })

  it('says how long to wait when the refusal said', () => {
    const refused = (seconds: string) => new Response(null, { status: 429, headers: { 'Retry-After': seconds } })
    expect(tooManyRequestsMessage(t, refused('1'))).toBe('Too many requests. Try again in 1 second.')
    expect(tooManyRequestsMessage(t, refused('30'))).toBe('Too many requests. Try again in 30 seconds.')
  })

  it('says to wait a moment when it did not', () => {
    expect(tooManyRequestsMessage(t, new Response(null, { status: 429 }))).toBe(
      'Too many requests. Wait a moment, then try again.'
    )
  })
})
