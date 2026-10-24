import { authOrigin } from '@/lib/authOrigin'

import { describe, expect, it } from 'vitest'

describe('authOrigin', () => {
  it('prefixes the current origin with auth.', () => {
    // Asserted rather than assumed, so a changed jsdom default fails loudly.
    expect(window.location.origin).toBe('http://localhost:3000')
    expect(authOrigin()).toBe('http://auth.localhost:3000')
  })
})
