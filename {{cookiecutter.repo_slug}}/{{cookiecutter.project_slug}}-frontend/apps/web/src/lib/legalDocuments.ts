import type { Translate } from '@/i18n/config'
import definition from '@/legal/documents.json'

// Written out rather than built from the slug, like historyLabels.ts. The test for this file fails when this list and
// documents.json name different documents.
export function legalTitles(t: Translate) {
  return {
    'terms-of-service': t('legal:termsOfServiceTitle'),
    'privacy-policy': t('legal:privacyPolicyTitle'),
  }
}

export type LegalSlug = keyof ReturnType<typeof legalTitles>
export type LegalDocument = { slug: LegalSlug; disclosesStorage?: boolean }

/** Every document a visitor agrees to by signing up, in display order. documents.json is the one list the pages,
 * the footer, the signup line, the version hash and the bake's checklist all read. */
export const LEGAL_DOCUMENTS = definition.documents as readonly LegalDocument[]

export function isLegalSlug(value: string): value is LegalSlug {
  return LEGAL_DOCUMENTS.some((document) => document.slug === value)
}

export function legalHref(slug: LegalSlug): string {
  return `/legal/${slug}`
}
