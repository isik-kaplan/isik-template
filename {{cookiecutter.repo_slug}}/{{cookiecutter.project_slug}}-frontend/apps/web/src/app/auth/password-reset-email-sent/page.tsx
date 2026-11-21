import { notFound } from 'next/navigation'

import { AuthCard } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'
import { passwordsSignIn } from '@/lib/passwords'

export default async function PasswordResetEmailSentPage() {
  if (!passwordsSignIn()) notFound()
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:passwordResetEmailSentTitle')}>
      <p className="text-muted-foreground text-sm">{t('auth:passwordResetEmailSentBody')}</p>
    </AuthCard>
  )
}
