import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'

/** An application's sign-in this project could not even ask about - one nobody registered, one not approved
 *  or switched off, or a request not addressed to anywhere it may return to. Nothing is sent back to the
 *  application then, since where it says to send it cannot be trusted. */
export default async function OAuthErrorPage() {
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:oauthErrorTitle')} description={t('auth:oauthErrorIntro')}>
      <AuthCardFooterLink href="/" className="block text-center">
        {t('auth:backToHome')}
      </AuthCardFooterLink>
    </AuthCard>
  )
}
