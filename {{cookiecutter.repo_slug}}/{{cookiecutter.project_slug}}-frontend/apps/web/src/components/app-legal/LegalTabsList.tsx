'use client'

import { usePathname, useRouter } from 'next/navigation'

import { Tabs, TabsList, TabsTrigger } from '@/components/base/tabs'

import { useClientTranslation } from '@/i18n/client'
import { LEGAL_DOCUMENTS, type LegalSlug, legalHref, legalTitles } from '@/lib/legalDocuments'

export function LegalTabsList() {
  const { t } = useClientTranslation(['legal'])
  const pathname = usePathname()
  const router = useRouter()
  const titles = legalTitles(t)
  const active = LEGAL_DOCUMENTS.find(({ slug }) => pathname === legalHref(slug))?.slug ?? null

  return (
    <Tabs value={active} onValueChange={(slug: LegalSlug) => router.push(legalHref(slug))}>
      {/* w-full so TabsTrigger's own flex-1 divides the strip evenly, as on the profile card. */}
      <TabsList aria-label={t('legal:documentsNavLabel')} className="w-full">
        {LEGAL_DOCUMENTS.map(({ slug }) => (
          <TabsTrigger key={slug} value={slug}>
            {titles[slug]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
