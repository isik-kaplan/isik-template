import { useTranslation } from '@/i18n/server'

import { describe, expect, it } from 'vitest'

describe('useTranslation (server)', () => {
  it('resolves a fixed translator for the given namespaces', async () => {
    const { t } = await useTranslation(['auth'])

    expect(t('auth:loginTitle')).toBe('Log in')
  })

  it('gives every call a fresh i18next instance', async () => {
    const first = await useTranslation(['auth'])
    const second = await useTranslation(['auth'])

    expect(first.i18n).not.toBe(second.i18n)
  })

  it('defaults to English when no language is given', async () => {
    const { t } = await useTranslation(['auth'])

    expect(t('auth:loginTitle')).toBe('Log in')
  })

  it('honors an explicitly given language', async () => {
    const { t } = await useTranslation(['auth'], 'en')

    expect(t('auth:loginTitle')).toBe('Log in')
  })
})
