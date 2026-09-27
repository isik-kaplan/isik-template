import { describe, expect, it, vi } from 'vitest'

const getLanguage = vi.fn()
vi.mock('@/lib/getSession', () => ({ getLanguage: () => getLanguage() }))

describe('sUseTranslation', () => {
  it("resolves the request's language and forwards it to the server translator", async () => {
    getLanguage.mockResolvedValue('en')
    const { sUseTranslation } = await import('@/i18n')

    const { t } = await sUseTranslation(['auth'])

    expect(t('auth:loginTitle')).toBe('Log in')
    expect(getLanguage).toHaveBeenCalledOnce()
  })
})
