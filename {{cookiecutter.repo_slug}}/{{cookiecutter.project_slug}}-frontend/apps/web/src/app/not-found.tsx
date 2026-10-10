import Link from 'next/link'

import { sUseTranslation } from '@/i18n'

export default async function NotFound() {
  const { t } = await sUseTranslation(['notFound'])

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{t('notFound:title')}</h1>
      <Link href="/" className="text-primary underline-offset-4 hover:underline">
        {t('notFound:backHome')}
      </Link>
    </main>
  )
}
