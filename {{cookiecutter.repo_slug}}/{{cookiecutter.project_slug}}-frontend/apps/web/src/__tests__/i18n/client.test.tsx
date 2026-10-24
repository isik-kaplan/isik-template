import { i18next, useClientTranslation } from '@/i18n/client'
import type { Language } from '@/i18n/config'
import { LanguageProvider } from '@/lib/LanguageContext'

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function Probe() {
  const { t } = useClientTranslation(['auth'])
  return <span>{t('auth:loginTitle')}</span>
}

describe('useClientTranslation', () => {
  // One shared i18next instance: a leftover language would make results depend on run order.
  beforeEach(async () => {
    await i18next.changeLanguage('en')
  })

  it('renders a translated string', () => {
    render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>
    )

    expect(screen.getByText('Log in')).toBeTruthy()
  })

  it('still works outside any LanguageProvider (defaults to English)', () => {
    render(<Probe />)

    expect(screen.getByText('Log in')).toBeTruthy()
  })

  it('switches the shared instance when the context language no longer matches it', async () => {
    // A mismatch first: beforeEach leaves the instance on "en".
    await i18next.changeLanguage('xx')

    render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>
    )

    await waitFor(() => expect(i18next.language).toBe('en'))
  })

  it('does not touch the shared instance when the context language already matches it', () => {
    const changeLanguageSpy = vi.spyOn(i18next, 'changeLanguage')

    render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>
    )

    expect(changeLanguageSpy).not.toHaveBeenCalled()
    changeLanguageSpy.mockRestore()
  })

  it('reacts to the context language changing after mount, not only at mount', async () => {
    const { rerender } = render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>
    )
    expect(i18next.language).toBe('en')

    // Not a configured language: this only proves the effect re-runs on a prop change.
    rerender(
      <LanguageProvider language={'xx' as Language}>
        <Probe />
      </LanguageProvider>
    )

    await waitFor(() => expect(i18next.language).toBe('xx'))
  })
})
