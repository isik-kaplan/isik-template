import type { Translate } from '@/i18n/config'
import definition from '@/legal/documents.json'

// Written out rather than built from the slug; its test checks it against documents.json.
export function legalTitles(t: Translate) {
  return {
    'terms-of-service': t('legal:termsOfServiceTitle'),
    'privacy-policy': t('legal:privacyPolicyTitle'),
  }
}

export type LegalSlug = keyof ReturnType<typeof legalTitles>
export type LegalDocument = { slug: LegalSlug; disclosesStorage?: boolean }

/** Every document a visitor agrees to by signing up, in display order, from documents.json. */
export const LEGAL_DOCUMENTS = definition.documents as readonly LegalDocument[]

export function isLegalSlug(value: string): value is LegalSlug {
  return LEGAL_DOCUMENTS.some((document) => document.slug === value)
}

export function legalHref(slug: LegalSlug): string {
  return `/legal/${slug}`
}
