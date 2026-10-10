'use client'

import Link from 'next/link'

import { useClientTranslation } from '@/i18n/client'
import { useLanguage } from '@/lib/LanguageContext'
import { LEGAL_DOCUMENTS, type LegalSlug, legalHref, legalTitles } from '@/lib/legalDocuments'

// Stands in for the document list while the sentence is translated, so the links can go where the translation
// put the list rather than where English puts it.
const LIST = '\u0000'

/** "By continuing, you agree to the ..." with a link to every document, shown wherever an account is created. */
export function LegalConsentNotice() {
  const { t } = useClientTranslation(['legal'])
  const language = useLanguage()
  const titles = legalTitles(t)
  const [before, after] = t('legal:consentNotice', { documents: LIST }).split(LIST)
  // A conjunction ("A, B and C") is ListFormat's default.
  const parts = new Intl.ListFormat(language).formatToParts(LEGAL_DOCUMENTS.map(({ slug }) => slug))

  return (
    <p className="text-muted-foreground text-center text-xs">
      {before}
      {parts.map((part, index) =>
        part.type === 'element' ? (
          // A new tab, so reading the terms does not throw away a half-filled signup form.
          <Link
            key={index}
            href={legalHref(part.value as LegalSlug)}
            target="_blank"
            className="text-primary underline underline-offset-4"
          >
            {titles[part.value as LegalSlug]}
            <span className="sr-only"> {t('legal:opensInNewTab')}</span>
          </Link>
        ) : (
          part.value
        )
      )}
      {after}
    </p>
  )
}
