import { AuthCard } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'

export default async function SignupEmailSentPage() {
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:signupEmailSentTitle')}>
      <p className="text-muted-foreground text-sm">{t('auth:signupEmailSentBody')}</p>
    </AuthCard>
  )
}
