import { authOrigin } from '@/lib/authOrigin'

import { describe, expect, it } from 'vitest'

describe('authOrigin', () => {
  it('prefixes the current origin with auth.', () => {
    // jsdom's default test URL is http://localhost:3000 - asserted here rather than assumed, so
    // a change to that default fails loudly instead of silently testing the wrong thing.
    expect(window.location.origin).toBe('http://localhost:3000')
    expect(authOrigin()).toBe('http://auth.localhost:3000')
  })
})
