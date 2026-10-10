import { headers } from 'next/headers'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { SignupForm } from '@/components/app-auth/SignupForm'
import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'
import { LegalConsentNotice } from '@/components/app-legal/LegalConsentNotice'

import { sUseTranslation } from '@/i18n'
import { redirectIfAuthenticated } from '@/lib/getSession'
import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

export default async function SignupPage() {
  await redirectIfAuthenticated()
  const { t } = await sUseTranslation(['auth'])
  const origin = getRequestOrigin(await headers(), { isLocalDevHost })

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
      {/* Below both the provider buttons and the form, so it covers every way an account starts here. */}
      <LegalConsentNotice />
    </AuthCard>
  )
}
