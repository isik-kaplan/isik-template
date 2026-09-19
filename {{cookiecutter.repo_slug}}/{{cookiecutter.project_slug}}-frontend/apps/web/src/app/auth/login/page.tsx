import { headers } from 'next/headers'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { LoginForm } from '@/components/app-auth/LoginForm'
import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'

import { sUseTranslation } from '@/i18n'
import { redirectIfAuthenticated } from '@/lib/getSession'
import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  await redirectIfAuthenticated(next || '/')
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])
  const origin = getRequestOrigin(await headers(), { isLocalDevHost })

  return (
    <AuthCard
      title={t('auth:loginTitle')}
      footer={
        <p className="text-muted-foreground text-center text-sm">
          {t('auth:noAccountLink')}
          <AuthCardFooterLink href="/auth/signup">{t('auth:signupLink')}</AuthCardFooterLink>
        </p>
      }
    >
      <SocialLoginSection
        action={`${origin.replace('://', '://auth.')}${PROVIDER_REDIRECT_PATH}`}
        callbackUrl={`${origin}/auth/callback-complete?next=${encodeURIComponent(next || '/')}`}
        dividerText={t('auth:orDivider')}
      />
      <LoginForm redirectTo={next || '/'} />
      <AuthCardFooterLink href="/auth/forgot-password" className="block text-center">
        {t('auth:forgotPasswordLink')}
      </AuthCardFooterLink>
    </AuthCard>
  )
}
