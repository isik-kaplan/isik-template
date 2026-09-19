import { getConfig, namespaces } from '@/i18n/config'

import { describe, expect, it } from 'vitest'

describe('getConfig', () => {
  it('defaults to English, with values left unescaped for React to escape itself', () => {
    const config = getConfig()

    expect(config.lng).toBe('en')
    expect(config.fallbackLng).toBe('en')
    expect(config.interpolation).toEqual({ escapeValue: false })
  })

  it('defaults to every namespace when none is given', () => {
    expect(getConfig().ns).toEqual(namespaces)
  })

  it('scopes to the given namespaces when some are given', () => {
    expect(getConfig(['auth']).ns).toEqual(['auth'])
  })
})
