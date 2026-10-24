import { AuthCard } from '@/components/app-auth/AuthCard'
import { ResetPasswordForm } from '@/components/app-auth/ResetPasswordForm'

import { sUseTranslation } from '@/i18n'

export default async function PasswordResetPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:resetPasswordTitle')}>
      {/* allauth's key contains ":", which Next hands back still percent-encoded. */}
      <ResetPasswordForm resetKey={decodeURIComponent(key)} />
    </AuthCard>
  )
}
