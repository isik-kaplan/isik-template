import { LegalConsentNotice } from '@/components'

import { render, screen } from '@testing-library/react-native'

// A definition with more documents than the shipped one, which only reaches the final separator.
jest.mock('@/lib/legalDocuments', () => ({
  LEGAL_SLUGS: ['a', 'b', 'c'],
  legalTitles: () => ({ a: 'A', b: 'B', c: 'C' }),
  legalUrl: (slug: string) => slug,
}))

function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(text).join('')
  const children = (node as { children?: unknown } | null)?.children
  return children ? text(children) : ''
}

describe('LegalConsentNotice with more than two documents', () => {
  it('separates the list with commas, keeping the final separator for the last pair', async () => {
    await render(<LegalConsentNotice />)

    expect(text(screen.getByTestId('legal-consent-notice').toJSON())).toBe(
      'By continuing, you agree to the A, B and C.'
    )
  })
})
