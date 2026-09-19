import { headers } from 'next/headers'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { SignupForm } from '@/components/app-auth/SignupForm'
import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'

import { sUseTranslation } from '@/i18n'
import { redirectIfAuthenticated } from '@/lib/getSession'
import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

export default async function SignupPage() {
  await redirectIfAuthenticated()
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
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
    </AuthCard>
  )
}
