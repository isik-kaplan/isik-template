import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'

/** A sign-in that cannot be asked about. Nothing is sent back: its redirect cannot be trusted. */
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
