import { AuthCard } from '@/components/app-auth/AuthCard'

import { sUseTranslation } from '@/i18n'

export default async function VerifyEmailDeclinedPage() {
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:verifyEmailDeclinedTitle')}>
      <p className="text-muted-foreground text-sm">{t('auth:verifyEmailDeclinedBody')}</p>
    </AuthCard>
  )
}
