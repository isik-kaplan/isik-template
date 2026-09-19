import { apiOrigin } from '@/lib/apiOrigin'

import { describe, expect, it } from 'vitest'

describe('apiOrigin', () => {
  it('prefixes the current origin with api.', () => {
    expect(window.location.origin).toBe('http://localhost:3000')
    expect(apiOrigin()).toBe('http://api.localhost:3000')
  })
})
