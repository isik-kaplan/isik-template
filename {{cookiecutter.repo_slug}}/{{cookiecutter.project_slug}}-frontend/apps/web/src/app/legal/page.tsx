import { redirect } from 'next/navigation'

import { LEGAL_DOCUMENTS, legalHref } from '@/lib/legalDocuments'

export default function LegalIndexPage() {
  redirect(legalHref(LEGAL_DOCUMENTS[0].slug))
}
