import { OAUTH_AUTHORIZE_PATH, afterSignIn } from '@/lib/afterSignIn'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'example.test' } }))

describe('afterSignIn', () => {
  it.each([
    ['/profile/details?tab=1', '/profile/details?tab=1'],
    [undefined, '/'],
    ['', '/'],
    [['/a', '/b'], '/'],
    [['https://auth.example.test/o/authorize/'], '/'],
    ['//elsewhere.test/', '/'],
    ['https://elsewhere.test/o/authorize/', '/'],
    ['https://example.test/o/authorize/', '/'],
    ['https://api.example.test/o/authorize/', '/'],
    ['https://auth.example.test.elsewhere.test/o/authorize/', '/'],
    ['https://auth.example.test/v0/browser/v1/auth/session', '/'],
    ['https://auth.example.test/o/authorize/../../v0/', '/'],
    ['javascript://auth.example.test/o/authorize/', '/'],
  ])('sends %j to %j', (next, expected) => {
    expect(afterSignIn(next)).toBe(expected)
  })

  it.each(['http', 'https'])('lets an application finish the %s authorize request it started', (scheme) => {
    const next = `${scheme}://auth.example.test${OAUTH_AUTHORIZE_PATH}?client_id=abc&scope=openid%20email`

    expect(afterSignIn(next)).toBe(next)
  })
})
