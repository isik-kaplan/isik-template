import { redirect } from 'next/navigation'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { MfaChallengeForm } from '@/components/app-auth/MfaChallengeForm'

import { sUseTranslation } from '@/i18n'
import { getSessionState } from '@/lib/getSession'

import { getSafeRedirect } from '@isikk/core/next/request'

// Where a login whose password (or provider) checked out lands while a second factor is still owed.
export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const redirectTo = getSafeRedirect(next)
  const { session, pendingMfaTypes } = await getSessionState()
  if (session) redirect(redirectTo)
  // Nothing pending - reached directly, or the pending login expired - so there is nothing to answer.
  if (!pendingMfaTypes) redirect('/auth/login')
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard
      title={t('auth:twoFactorTitle')}
      footer={
        <AuthCardFooterLink href="/auth/login" className="block text-center">
          {t('auth:twoFactorBackToLogin')}
        </AuthCardFooterLink>
      }
    >
      <MfaChallengeForm types={pendingMfaTypes} redirectTo={redirectTo} />
    </AuthCard>
  )
}
