import { LEGAL_SLUGS, legalTitles, legalUrl } from '@/lib/legalDocuments'

import type { TFunction } from 'i18next'
import definition from 'web/src/legal/documents.json'

const echoKeys = ((key: string) => key) as unknown as TFunction

describe('legalDocuments', () => {
  it("lists the web app's documents, in its order", () => {
    expect(LEGAL_SLUGS).toEqual(definition.documents.map(({ slug }) => slug))
  })

  it('titles exactly the documents the definition names', () => {
    expect(legalTitles(echoKeys)).toEqual({
      'terms-of-service': 'termsOfServiceTitle',
      'privacy-policy': 'privacyPolicyTitle',
    })
    expect(Object.keys(legalTitles(echoKeys)).sort()).toEqual([...LEGAL_SLUGS].sort())
  })

  it("points at the document's page on the web app", () => {
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'http://auth.example.test'
    expect(legalUrl('terms-of-service')).toBe('http://example.test/legal/terms-of-service')
  })
})
