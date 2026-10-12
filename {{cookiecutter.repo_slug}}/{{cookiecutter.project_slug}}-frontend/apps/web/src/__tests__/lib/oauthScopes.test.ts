import { scopeLabel } from '@/lib/oauthScopes'

import { describe, expect, it } from 'vitest'

const t = ((key: string) => `t:${key}`) as Parameters<typeof scopeLabel>[1]

describe('scopeLabel', () => {
  it.each([
    ['openid', 't:auth:oauthScopeOpenid'],
    ['profile', 't:auth:oauthScopeProfile'],
    ['email', 't:auth:oauthScopeEmail'],
  ])('words %s for the person deciding', (scope, expected) => {
    expect(scopeLabel(scope, t)).toBe(expected)
  })

  it('shows a scope it has no words for as it is, rather than hiding it', () => {
    expect(scopeLabel('read:everything', t)).toBe('read:everything')
  })
})
