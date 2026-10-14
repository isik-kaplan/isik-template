import { describedScopes, scopeLabel } from '@/lib/oauthScopes'

import { describe, expect, it } from 'vitest'

const t = ((key: string) => `t:${key}`) as Parameters<typeof scopeLabel>[1]

describe('scopeLabel', () => {
  it.each([
    ['openid', 't:auth:oauthScopeOpenid'],
    ['profile', 't:auth:oauthScopeProfile'],
    ['email', 't:auth:oauthScopeEmail'],
  ])('words %s for the person deciding', (scope, expected) => {
    expect(scopeLabel(scope, t, { [scope]: 'the backend words it otherwise' })).toBe(expected)
  })

  it("words a permission in the backend's words", () => {
    expect(scopeLabel('users:manage:user', t, { 'users:manage:user': 'Manage people' })).toBe('Manage people')
  })

  it('shows a scope it has no words for as it is, rather than hiding it', () => {
    expect(scopeLabel('read:everything', t)).toBe('read:everything')
    expect(scopeLabel('read:everything', t, { other: 'Other' })).toBe('read:everything')
  })
})

describe('describedScopes', () => {
  it("keys the backend's words by scope", () => {
    expect(
      describedScopes([
        { name: 'a:read:x', label: 'Read' },
        { name: 'b:write:x', label: 'Write' },
      ])
    ).toEqual({ 'a:read:x': 'Read', 'b:write:x': 'Write' })
  })

  it('words nothing when the list could not be read', () => {
    expect(describedScopes(undefined)).toStrictEqual({})
  })
})
