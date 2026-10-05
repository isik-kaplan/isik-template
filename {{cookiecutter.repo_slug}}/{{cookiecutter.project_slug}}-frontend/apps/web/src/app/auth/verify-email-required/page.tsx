import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'
import { LOGIN_PATH } from '@/lib/sessionChannel'

export default async function VerifyEmailRequiredPage() {
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard
      title={t('auth:verifyEmailRequiredTitle')}
      footer={
        <AuthCardFooterLink href={LOGIN_PATH} className="block text-center">
          {t('auth:backToLoginLink')}
        </AuthCardFooterLink>
      }
    >
      <p className="text-muted-foreground text-sm">{t('auth:verifyEmailRequiredBody')}</p>
    </AuthCard>
  )
}
