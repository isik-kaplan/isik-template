import { tooManyRequestsMessage } from '@/lib/tooManyRequestsMessage'

import { describe, expect, it } from 'vitest'

describe('tooManyRequestsMessage', () => {
  it('says how long to wait when the refusal said', () => {
    expect(tooManyRequestsMessage(1)).toBe('Too many requests. Try again in 1 second.')
    expect(tooManyRequestsMessage(30)).toBe('Too many requests. Try again in 30 seconds.')
  })

  it('says to wait a moment when it did not, or said no time at all', () => {
    expect(tooManyRequestsMessage(null)).toBe('Too many requests. Wait a moment, then try again.')
    expect(tooManyRequestsMessage(0)).toBe('Too many requests. Wait a moment, then try again.')
  })
})
