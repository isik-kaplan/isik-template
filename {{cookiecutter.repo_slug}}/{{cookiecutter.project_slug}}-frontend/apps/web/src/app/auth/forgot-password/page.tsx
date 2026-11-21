import { notFound } from 'next/navigation'

import { AuthCard } from '@/components/app-auth/AuthCard'
import { ForgotPasswordForm } from '@/components/app-auth/ForgotPasswordForm'

import { sUseTranslation } from '@/i18n'
import { passwordsSignIn } from '@/lib/passwords'

export default async function ForgotPasswordPage() {
  if (!passwordsSignIn()) notFound()
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:forgotPasswordTitle')} description={t('auth:forgotPasswordDescription')}>
      <ForgotPasswordForm />
    </AuthCard>
  )
}
