import { AuthCard } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'

export default async function PasswordResetEmailSentPage() {
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:passwordResetEmailSentTitle')}>
      <p className="text-muted-foreground text-sm">{t('auth:passwordResetEmailSentBody')}</p>
    </AuthCard>
  )
}
