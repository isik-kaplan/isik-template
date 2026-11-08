import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { VerifyPhoneForm } from '@/components/app-auth/VerifyPhoneForm'

import { sUseTranslation } from '@/i18n'
import { afterSignIn } from '@/lib/afterSignIn'

// Where a signup with a number, or a login by a number never verified, answers the texted code.
export default async function VerifyPhonePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard
      title={t('auth:verifyPhoneTitle')}
      footer={
        <AuthCardFooterLink href="/auth/login" className="block text-center">
          {t('auth:twoFactorBackToLogin')}
        </AuthCardFooterLink>
      }
    >
      <p className="text-muted-foreground text-sm">{t('auth:verifyPhoneBody')}</p>
      <VerifyPhoneForm redirectTo={afterSignIn(next)} />
    </AuthCard>
  )
}
