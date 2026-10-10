import definition from '@/legal/documents.json'
import { LEGAL_DOCUMENTS, isLegalSlug, legalHref, legalTitles } from '@/lib/legalDocuments'

import { echoKeys } from '../support/translate'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('legalTitles', () => {
  it('titles exactly the documents the definition names, so neither can gain one the other lacks', () => {
    expect(Object.keys(legalTitles(echoKeys)).sort()).toEqual(definition.documents.map(({ slug }) => slug).sort())
  })

  it('reaches for each title by its own key', () => {
    expect(legalTitles(echoKeys)).toEqual({
      'terms-of-service': 'legal:termsOfServiceTitle',
      'privacy-policy': 'legal:privacyPolicyTitle',
    })
  })
})

describe('LEGAL_DOCUMENTS', () => {
  it('is the definition, in its order', () => {
    expect(LEGAL_DOCUMENTS).toEqual(definition.documents)
  })

  it('has exactly one document carrying the cookies and storage disclosure', () => {
    expect(LEGAL_DOCUMENTS.filter((document) => document.disclosesStorage)).toHaveLength(1)
  })
})

describe('isLegalSlug', () => {
  it('accepts every defined slug', () => {
    for (const { slug } of LEGAL_DOCUMENTS) expect(isLegalSlug(slug)).toBe(true)
  })

  it('refuses anything else, including names an object already has', () => {
    for (const value of ['', 'constructor', '__proto__', 'toString', '../terms-of-service', 'terms-of-service.md']) {
      expect(isLegalSlug(value)).toBe(false)
    }
    fc.assert(
      fc.property(fc.string(), (value) => isLegalSlug(value) === LEGAL_DOCUMENTS.some(({ slug }) => slug === value))
    )
  })
})

describe('legalHref', () => {
  it('is the page under /legal', () => {
    expect(legalHref('privacy-policy')).toBe('/legal/privacy-policy')
  })
})
