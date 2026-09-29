import type { Language } from '@/i18n/config'
import { i18next, useClientTranslation } from '@/i18n/client'
import { LanguageProvider } from '@/lib/LanguageContext'

import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

function Probe() {
  const { t } = useClientTranslation(['auth'])
  return <span>{t('auth:loginTitle')}</span>
}

describe('useClientTranslation', () => {
  // Every test here shares one module-level i18next instance, so a language left over from
  // whichever test ran before would make the next one's own "already en" or "needs to switch"
  // premise false depending on run order.
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
    // Forces a mismatch first - the beforeEach above leaves the shared instance on "en" already,
    // which would make this a no-op the effect never actually needs to act on.
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

    // Not a real configured language - this only needs to prove the effect re-runs on a prop
    // change, the same way the mismatch test above proves it runs at mount.
    rerender(
      <LanguageProvider language={'xx' as Language}>
        <Probe />
      </LanguageProvider>
    )

    await waitFor(() => expect(i18next.language).toBe('xx'))
  })
})
