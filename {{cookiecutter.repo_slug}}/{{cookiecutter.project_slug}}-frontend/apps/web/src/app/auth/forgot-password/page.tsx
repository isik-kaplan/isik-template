import { AuthCard } from '@/components/app-auth/AuthCard'
import { ForgotPasswordForm } from '@/components/app-auth/ForgotPasswordForm'

import { sUseTranslation } from '@/i18n'

export default async function ForgotPasswordPage() {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:forgotPasswordTitle')} description={t('auth:forgotPasswordDescription')}>
      <ForgotPasswordForm />
    </AuthCard>
  )
}
