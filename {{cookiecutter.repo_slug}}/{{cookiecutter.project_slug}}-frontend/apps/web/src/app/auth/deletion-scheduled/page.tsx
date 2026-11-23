import Link from 'next/link'

import { AuthCard } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'
import { LOGIN_PATH } from '@/lib/sessionChannel'

/** Where asking to delete the account lands: they are signed out, and told how to keep it. */
export default async function DeletionScheduledPage({ searchParams }: { searchParams: Promise<{ on?: string }> }) {
  const { t, i18n } = await sUseTranslation(['auth'])
  // String(undefined) reads as no date at all, like any other text that is not one.
  const on = new Date(String((await searchParams).on))
  const date = Number.isNaN(on.getTime()) ? null : on.toLocaleDateString(i18n.language, { dateStyle: 'long' })

  return (
    <AuthCard title={t('auth:deletionScheduledTitle')}>
      <p className="text-muted-foreground text-sm">
        {date ? t('auth:deletionScheduledBody', { date }) : t('auth:deletionScheduledBodyUndated')}
      </p>
      <Link href={LOGIN_PATH} className="text-sm underline underline-offset-4">
        {t('auth:deletionScheduledSignIn')}
      </Link>
    </AuthCard>
  )
}
