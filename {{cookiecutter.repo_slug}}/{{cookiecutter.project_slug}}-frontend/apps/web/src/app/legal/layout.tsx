import Link from 'next/link'

import type React from 'react'

import { LegalTabsList } from '@/components/app-legal/LegalTabsList'

import { sUseTranslation } from '@/i18n'

export default async function LegalLayout({ children }: { children: React.ReactNode }) {
  const { t } = await sUseTranslation(['legal'])

  return (
    <main className="flex w-full flex-1 justify-center p-6">
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <LegalTabsList />
        {children}
        <Link href="/" className="text-primary self-center text-sm underline underline-offset-4">
          {t('legal:backHome')}
        </Link>
      </div>
    </main>
  )
}
