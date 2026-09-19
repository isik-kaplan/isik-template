import { AuthCard } from '@/components/app-auth/AuthCard'
import { VerifyEmailButton } from '@/components/app-auth/VerifyEmailButton'

import { sUseTranslation } from '@/i18n'

export default async function VerifyEmailPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:verifyEmailTitle')}>
      {/* allauth's confirmation key contains ":" (see HEADLESS_FRONTEND_URLS in settings.py), which
          the link in the email carries percent-encoded - Next.js hands dynamic segments back
          exactly as they appeared in the URL rather than decoding them, so an un-decoded key here
          reaches the API as a literal "%3A" and allauth rejects it as invalid. */}
      <VerifyEmailButton verificationKey={decodeURIComponent(key)} />
    </AuthCard>
  )
}
