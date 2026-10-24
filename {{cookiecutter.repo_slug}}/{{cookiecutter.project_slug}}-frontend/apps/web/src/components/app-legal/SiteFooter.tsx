'use client'

import Link from 'next/link'

import { useClientTranslation } from '@/i18n/client'
import { LEGAL_DOCUMENTS, legalHref, legalTitles } from '@/lib/legalDocuments'
import { STORAGE_DISCLOSURE_ANCHOR } from '@/lib/storageDisclosure'

/** A disclosure, not a consent banner: everything stored is strictly necessary or asked for. */
export function SiteFooter() {
  const { t } = useClientTranslation(['legal'])
  const titles = legalTitles(t)
  const disclosing = LEGAL_DOCUMENTS.find((document) => document.disclosesStorage)

  return (
    <footer className="text-muted-foreground flex flex-col items-center gap-2 border-t border-border px-6 py-4 text-center text-xs">
      <nav aria-label={t('legal:footerNavLabel')}>
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1">
          {LEGAL_DOCUMENTS.map(({ slug }) => (
            <li key={slug}>
              <Link href={legalHref(slug)} className="underline-offset-4 hover:text-foreground hover:underline">
                {titles[slug]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {disclosing && (
        <p>
          {t('legal:footerStorageNotice')}{' '}
          <Link
            href={`${legalHref(disclosing.slug)}#${STORAGE_DISCLOSURE_ANCHOR}`}
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {t('legal:footerStorageLink')}
          </Link>
        </p>
      )}
    </footer>
  )
}
