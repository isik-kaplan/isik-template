import { LegalConsentNotice } from '@/components/LegalConsentNotice'

import { render, screen } from '@testing-library/react-native'
import fc from 'fast-check'

// Any number of documents, not only the shipped definition's: a third is what reaches the middle separator.
const documents = { slugs: ['a'] as string[] }
jest.mock('@/lib/legalDocuments', () => ({
  get LEGAL_SLUGS() {
    return documents.slugs
  },
  legalTitles: () => Object.fromEntries(documents.slugs.map((slug) => [slug, slug.toUpperCase()])),
  legalUrl: (slug: string) => slug,
}))

function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(text).join('')
  const children = (node as { children?: unknown } | null)?.children
  return children ? text(children) : ''
}

describe('the legal consent notice', () => {
  it('lists however many documents there are as English lists them', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.stringMatching(/^[a-z]{2,6}$/), { minLength: 1, maxLength: 5 }),
        async (slugs) => {
          documents.slugs = slugs
          const view = await render(<LegalConsentNotice />)
          const titles = slugs.map((slug) => slug.toUpperCase())
          const listed = titles.length === 1 ? titles[0] : `${titles.slice(0, -1).join(', ')} and ${titles.at(-1)}`
          expect(text(screen.getByTestId('legal-consent-notice').toJSON())).toBe(
            `By continuing, you agree to the ${listed}.`
          )
          await view.unmount()
        }
      )
    )
  })
})
