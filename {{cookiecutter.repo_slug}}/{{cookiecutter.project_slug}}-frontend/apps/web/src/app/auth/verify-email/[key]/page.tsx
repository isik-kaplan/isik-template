import { AuthCard } from '@/components/app-auth/AuthCard'
import { VerifyEmailButton } from '@/components/app-auth/VerifyEmailButton'

import { sUseTranslation } from '@/i18n'

export default async function VerifyEmailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:verifyEmailTitle')}>
      {/* allauth's key contains ":", which Next hands back still percent-encoded. */}
      <VerifyEmailButton verificationKey={decodeURIComponent(key)} />
    </AuthCard>
  )
}
