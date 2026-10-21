import Link from 'next/link'

import { sUseTranslation } from '@/i18n'
import { safeNext } from '@/lib/reauthentication'

/** Where a page goes when the API refused to answer its render for now (lib/serverApi.ts): a page
 *  missing what it was refused would read as empty, or as not there at all. */
export default async function TooManyRequests({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { t } = await sUseTranslation(['common'])
  const { next } = await searchParams

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t('common:tooManyRequestsTitle')}</h1>
      <p className="text-muted-foreground">{t('common:tooManyRequests')}</p>
      <Link href={safeNext(next)} className="text-primary underline-offset-4 hover:underline">
        {t('common:tryAgain')}
      </Link>
    </main>
  )
}
