import { AuthCard } from '@/components/app-auth/AuthCard'
import { ResetPasswordForm } from '@/components/app-auth/ResetPasswordForm'

import { sUseTranslation } from '@/i18n'

export default async function PasswordResetPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:resetPasswordTitle')}>
      {/* See the same decode in verify-email/[key]/page.tsx - allauth's key contains ":", which
          Next.js hands back exactly as it appeared in the URL (percent-encoded) rather than
          decoding it itself. */}
      <ResetPasswordForm resetKey={decodeURIComponent(key)} />
    </AuthCard>
  )
}
