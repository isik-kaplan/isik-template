import { webOrigin } from '@/lib/config'

import type { TFunction } from 'i18next'
import definition from 'web/src/legal/documents.json'

// The web app's definition, read through its workspace package rather than repeated: the screens link to its pages,
// so both apps agree on which documents exist. Titles are written out rather than built from the slug; the test for
// this file fails when they and documents.json name different documents.
export function legalTitles(t: TFunction) {
  return {
    'terms-of-service': t('termsOfServiceTitle'),
    'privacy-policy': t('privacyPolicyTitle'),
  }
}

export type LegalSlug = keyof ReturnType<typeof legalTitles>

export const LEGAL_SLUGS = definition.documents.map(({ slug }) => slug) as readonly LegalSlug[]

export function legalUrl(slug: LegalSlug): string {
  return `${webOrigin()}/legal/${slug}`
}
