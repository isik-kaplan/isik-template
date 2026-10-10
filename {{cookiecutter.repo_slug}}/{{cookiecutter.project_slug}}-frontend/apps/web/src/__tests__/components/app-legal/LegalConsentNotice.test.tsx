import { LegalConsentNotice } from '@/components/app-legal/LegalConsentNotice'

import { LanguageProvider } from '@/lib/LanguageContext'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

describe('LegalConsentNotice', () => {
  it('says continuing is agreeing, as one sentence with the documents listed in order', () => {
    const { container } = render(<LegalConsentNotice />)

    expect(container.textContent).toBe(
      'By continuing, you agree to the Terms of Service (opens in a new tab) and Privacy Policy (opens in a new tab).'
    )
  })

  it("links every document to its page, in a new tab so the form isn't lost", () => {
    render(<LegalConsentNotice />)

    const terms = screen.getByRole('link', { name: /Terms of Service/ })
    expect(terms.getAttribute('href')).toBe('/legal/terms-of-service')
    expect(terms.getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('link', { name: /Privacy Policy/ }).getAttribute('href')).toBe('/legal/privacy-policy')
  })

  it("tells a screen reader a link opens a new tab, as part of the link's name", () => {
    render(<LegalConsentNotice />)

    expect(screen.getByRole('link', { name: 'Terms of Service (opens in a new tab)' })).toBeTruthy()
  })

  it("joins the list the visitor's language's way", () => {
    // Spanish joins two items with "y"; the sentence itself stays English, the only catalog guaranteed to have text.
    const { container } = render(
      <LanguageProvider language={'es' as never}>
        <LegalConsentNotice />
      </LanguageProvider>
    )

    expect(container.textContent).toContain('(opens in a new tab) y Privacy Policy')
  })
})
