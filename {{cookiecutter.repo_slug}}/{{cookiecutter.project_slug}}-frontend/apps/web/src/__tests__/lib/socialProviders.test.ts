import { socialProviders } from '@/lib/socialProviders'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ SOCIAL_LOGIN: { PROVIDERS: [] as string[], ICONS: [] as string[] } }))
vi.mock('@/config/public', () => ({ CONFIG }))

describe('socialProviders', () => {
  beforeEach(() => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = []
    CONFIG.SOCIAL_LOGIN.ICONS = []
  })

  it('is empty when the deployment names no provider', () => {
    expect(socialProviders()).toEqual([])
  })

  it('lists the configured providers in order, named from their ids, without blanks', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['github', ' openid_connect ', '', 'GOOGLE']

    expect(socialProviders()).toEqual([
      { id: 'github', name: 'Github', icon: '' },
      { id: 'openid_connect', name: 'Openid Connect', icon: '' },
      { id: 'GOOGLE', name: 'Google', icon: '' },
    ])
  })

  it('gives a provider the icon configured for it, and only that one', () => {
    CONFIG.SOCIAL_LOGIN.PROVIDERS = ['openid_connect', 'github']
    CONFIG.SOCIAL_LOGIN.ICONS = [' openid_connect = https://idp.example.test/a=b.svg ', 'okta=/icons/okta.svg']

    expect(socialProviders()).toEqual([
      { id: 'openid_connect', name: 'Openid Connect', icon: 'https://idp.example.test/a=b.svg' },
      { id: 'github', name: 'Github', icon: '' },
    ])
  })

  it.each(['no-equals-sign', '=/icons/x.svg', 'google=', ' = '])('refuses the malformed icon entry %j', (entry) => {
    CONFIG.SOCIAL_LOGIN.ICONS = [entry]

    expect(() => socialProviders()).toThrow(
      `SOCIAL_LOGIN__ICONS entry ${JSON.stringify(entry)} is not <provider id>=<url or path>`
    )
  })
})
