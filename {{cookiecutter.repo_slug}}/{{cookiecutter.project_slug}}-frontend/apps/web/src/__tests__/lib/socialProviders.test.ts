import { signInProviders, socialProviders } from '@/lib/socialProviders'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({
  SOCIAL_LOGIN: { PROVIDERS: [] as string[], ICONS: [] as string[], ADMIN_ONLY: [] as string[] },
}))
vi.mock('@/config/public', () => ({ CONFIG }))

describe('socialProviders', () => {
  beforeEach(() => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = []
    CONFIG.SOCIAL_LOGIN.ICONS = []
    CONFIG.SOCIAL_LOGIN.ADMIN_ONLY = []
  })

  it('is empty when the deployment names no provider', () => {
    expect(socialProviders()).toEqual([])
  })

  it('lists the configured providers in order, named from their ids, without blanks', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['github', ' microsoft ', '', 'GOOGLE']

    expect(socialProviders()).toEqual([
      { id: 'github', name: 'Github', icon: '', adminOnly: false },
      { id: 'microsoft', name: 'Microsoft', icon: '', adminOnly: false },
      { id: 'GOOGLE', name: 'Google', icon: '', adminOnly: false },
    ])
  })

  it('is each OpenID Connect issuer by its own name, as allauth knows it', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['openid_connect:corp', 'openid_connect:customer-login']

    expect(socialProviders().map(({ id, name }) => [id, name])).toEqual([
      ['corp', 'Corp'],
      ['customer-login', 'Customer Login'],
    ])
  })

  it('gives a provider the icon configured for it, and only that one', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['openid_connect:corp', 'github']
    CONFIG.SOCIAL_LOGIN.ICONS = [' corp = https://idp.example.test/a=b.svg ', 'okta=/icons/okta.svg']

    expect(socialProviders().map(({ id, icon }) => [id, icon])).toEqual([
      ['corp', 'https://idp.example.test/a=b.svg'],
      ['github', ''],
    ])
  })

  it.each(['no-equals-sign', '=/icons/x.svg', 'google=', ' = '])('refuses the malformed icon entry %j', (entry) => {
    CONFIG.SOCIAL_LOGIN.ICONS = [entry]

    expect(() => socialProviders()).toThrow(
      `SOCIAL_LOGIN__ICONS entry ${JSON.stringify(entry)} is not <provider id>=<url or path>`
    )
  })

  it('marks the admin-only ones, which are offered for signing in on the admin alone', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['google', 'openid_connect:corp']
    CONFIG.SOCIAL_LOGIN.ADMIN_ONLY = [' openid_connect:corp ', '']

    expect(socialProviders().map(({ id, adminOnly }) => [id, adminOnly])).toEqual([
      ['google', false],
      ['corp', true],
    ])
    expect(signInProviders(false).map(({ id }) => id)).toEqual(['google'])
    expect(signInProviders(true).map(({ id }) => id)).toEqual(['google', 'corp'])
  })

  it('refuses an admin-only provider the deployment does not offer at all', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['google']
    CONFIG.SOCIAL_LOGIN.ADMIN_ONLY = ['openid_connect:corp', 'github']

    expect(() => socialProviders()).toThrow(
      'SOCIAL_LOGIN__ADMIN_ONLY names what SOCIAL_LOGIN__PROVIDERS does not: openid_connect:corp, github'
    )
  })
})
