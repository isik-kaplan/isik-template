import { webOrigin } from '@/lib/config'

import type { TFunction } from 'i18next'
import definition from 'web/src/legal/documents.json'

// Its test fails when these titles and documents.json name different documents.
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
