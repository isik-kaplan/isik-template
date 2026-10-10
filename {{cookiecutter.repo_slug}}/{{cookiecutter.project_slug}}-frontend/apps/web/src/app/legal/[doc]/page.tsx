import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { StorageDisclosure } from '@/components/app-legal/StorageDisclosure'
import { Markdown } from '@/components/app/Markdown'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/base/card'

import { sUseTranslation } from '@/i18n'
import { getLanguage } from '@/lib/getSession'
import { LEGAL_DOCUMENTS, isLegalSlug, legalTitles } from '@/lib/legalDocuments'
import { readLegalDocument } from '@/lib/readLegalDocument'

type Props = { params: Promise<{ doc: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { doc } = await params
  if (!isLegalSlug(doc)) return {}
  const { t } = await sUseTranslation(['legal'])
  return { title: legalTitles(t)[doc] }
}

export default async function LegalDocumentPage({ params }: Props) {
  const { doc } = await params
  if (!isLegalSlug(doc)) notFound()
  const { t } = await sUseTranslation(['legal'])
  const language = await getLanguage()
  const document = await readLegalDocument(doc, language)
  const disclosesStorage = LEGAL_DOCUMENTS.some(({ slug, disclosesStorage }) => slug === doc && disclosesStorage)

  return (
    <>
      {/* Visually the active tab names the page; a screen reader gets the same name as a heading. */}
      <h1 className="sr-only">{legalTitles(t)[doc]}</h1>
      {document && document.language !== language && (
        <p className="text-muted-foreground text-center text-sm">{t('legal:fallbackNotice')}</p>
      )}
      {document ? (
        <article lang={document.language}>
          <Markdown>{document.content}</Markdown>
        </article>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('legal:missingTitle')}</CardTitle>
            <CardDescription>{t('legal:missingBody')}</CardDescription>
          </CardHeader>
        </Card>
      )}
      {disclosesStorage && <StorageDisclosure />}
    </>
  )
}
