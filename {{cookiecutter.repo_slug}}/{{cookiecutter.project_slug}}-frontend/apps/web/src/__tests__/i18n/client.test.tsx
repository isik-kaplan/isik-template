import { i18next, useClientTranslation } from '@/i18n/client'
import { LanguageProvider } from '@/lib/LanguageContext'

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

function Probe() {
  const { t } = useClientTranslation(['auth'])
  return <span>{t('auth:loginTitle')}</span>
}

describe('useClientTranslation', () => {
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
    // Forces a mismatch first - every other test here leaves the shared instance on "en" already,
    // which would make this a no-op the effect never actually needs to act on.
    await i18next.changeLanguage('xx')

    render(
      <LanguageProvider language="en">
        <Probe />
      </LanguageProvider>
    )

    await waitFor(() => expect(i18next.language).toBe('en'))
  })
})
