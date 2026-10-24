import { headers } from 'next/headers'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { SignupForm } from '@/components/app-auth/SignupForm'
import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'
import { LegalConsentNotice } from '@/components/app-legal/LegalConsentNotice'

import { sUseTranslation } from '@/i18n'
import { redirectIfAuthenticated } from '@/lib/getSession'
import { requestOrigin } from '@/lib/requestOrigin'

import { PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

export default async function SignupPage() {
  await redirectIfAuthenticated()
  const { t } = await sUseTranslation(['auth'])
  const origin = requestOrigin(await headers())

  return (
    <AuthCard
      title={t('auth:signupTitle')}
      footer={
        <p className="text-muted-foreground text-center text-sm">
          {t('auth:hasAccountLink')}
          <AuthCardFooterLink href="/auth/login">{t('auth:loginLink')}</AuthCardFooterLink>
        </p>
      }
    >
      <SocialLoginSection
        action={`${origin.replace('://', '://auth.')}${PROVIDER_REDIRECT_PATH}`}
        callbackUrl={`${origin}/auth/callback-complete?next=${encodeURIComponent('/')}`}
        dividerText={t('auth:orDivider')}
      />
      <SignupForm />
      {/* Below both provider buttons and form, covering every way an account starts. */}
      <LegalConsentNotice />
    </AuthCard>
  )
}
