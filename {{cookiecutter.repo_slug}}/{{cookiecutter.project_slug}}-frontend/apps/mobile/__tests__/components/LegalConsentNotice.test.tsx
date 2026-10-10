import { LegalConsentNotice } from '@/components'

import { fireEvent, render, screen } from '@testing-library/react-native'
import { Linking } from 'react-native'

function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(text).join('')
  const children = (node as { children?: unknown } | null)?.children
  return children ? text(children) : ''
}

describe('LegalConsentNotice', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'https://auth.example.test'
  })

  it('says continuing is agreeing, as one sentence with the documents listed in order', async () => {
    await render(<LegalConsentNotice />)

    expect(text(screen.getByTestId('legal-consent-notice').toJSON())).toBe(
      'By continuing, you agree to the Terms of Service and Privacy Policy.'
    )
  })

  it("opens each document's page on the web app when its link is pressed", async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true)
    await render(<LegalConsentNotice />)

    await fireEvent.press(screen.getByTestId('legal-link-privacy-policy'))
    await fireEvent.press(screen.getByTestId('legal-link-terms-of-service'))

    expect(openURL.mock.calls).toEqual([
      ['https://example.test/legal/privacy-policy'],
      ['https://example.test/legal/terms-of-service'],
    ])
  })

  it('marks each document as a link for assistive technology', async () => {
    await render(<LegalConsentNotice />)

    expect(screen.getByTestId('legal-link-terms-of-service').props.accessibilityRole).toBe('link')
  })

  it('styles the notice muted and small, and the links underlined', async () => {
    await render(<LegalConsentNotice />)

    expect(screen.getByTestId('legal-consent-notice').props.style).toEqual({
      color: '#666666',
      fontSize: 12,
      textAlign: 'center',
    })
    expect(screen.getByTestId('legal-link-privacy-policy').props.style).toEqual({ textDecorationLine: 'underline' })
  })
})
