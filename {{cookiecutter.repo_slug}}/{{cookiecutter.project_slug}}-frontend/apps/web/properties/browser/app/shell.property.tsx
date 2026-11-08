import NotFound from '@/app/not-found'
import { i18next, useClientTranslation } from '@/i18n/client'
import { languages } from '@/i18n/config'
import { LanguageProvider } from '@/lib/LanguageContext'
import { type Session, SessionProvider, useSession } from '@/lib/SessionContext'

import { freshDom } from '../../support/dom'
import { test } from '@fast-check/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect } from 'vitest'

function Reader() {
  const session = useSession()
  const { t } = useClientTranslation(['common'])
  return (
    <p>
      {session?.user.email ?? 'nobody'}|{t('common:tooManyRequests')}
    </p>
  )
}

describe('the providers every page sits in', () => {
  test.prop([
    fc.option(fc.record({ id: fc.uuid(), display: fc.string(), email: fc.emailAddress() }), { nil: null }),
    fc.constantFrom(...languages),
  ])('hand every page the session it was rendered with, in the language it was rendered in', async (user, language) => {
    freshDom()
    const session: Session = user ? { user } : null
    render(
      <SessionProvider session={session}>
        <LanguageProvider language={language}>
          <Reader />
        </LanguageProvider>
      </SessionProvider>
    )
    expect(
      screen.getByText(new RegExp(`^${(user?.email ?? 'nobody').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\|`))
    ).toBeTruthy()
    await waitFor(() => expect(i18next.language).toBe(language))
  })
})

describe('a page nobody found', () => {
  test('says so, and leads home', async () => {
    freshDom()
    render(await NotFound())
    expect(screen.getByRole('heading').textContent?.length).toBeGreaterThan(0)
    expect(screen.getByRole('link').getAttribute('href')).toBe('/')
  })
})
