import { headers } from 'next/headers'

import { AuthCard, AuthCardFooterLink } from '@/components/app-auth/AuthCard'
import { LoginForm } from '@/components/app-auth/LoginForm'
import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'

import { sUseTranslation } from '@/i18n'
import { afterSignIn } from '@/lib/afterSignIn'
import { redirectIfAuthenticated } from '@/lib/getSession'
import { isAdminHost, siblingOrigin } from '@/lib/hosts'
import { passwordsSignIn } from '@/lib/passwords'
import { requestOrigin } from '@/lib/requestOrigin'

import { PROVIDER_REDIRECT_PATH } from '@{{ cookiecutter.repo_slug }}/auth-api'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = afterSignIn((await searchParams).next)
  await redirectIfAuthenticated(next)
  const { t } = await sUseTranslation(['auth'])
  const origin = requestOrigin(await headers())
  const admin = isAdminHost(new URL(origin).host)
  const passwords = passwordsSignIn()
  // Without passwords a superuser's still opens the admin, so a provider outage never locks everybody out.
  const passwordForm = passwords || admin

  return (
    <AuthCard
      title={admin ? t('auth:adminLoginTitle') : t('auth:loginTitle')}
      footer={
        admin ? undefined : (
          <p className="text-muted-foreground text-center text-sm">
            {t('auth:noAccountLink')}
            <AuthCardFooterLink href="/auth/signup">{t('auth:signupLink')}</AuthCardFooterLink>
          </p>
        )
      }
    >
      <SocialLoginSection
        action={`${siblingOrigin(origin, 'auth')}${PROVIDER_REDIRECT_PATH}`}
        callbackUrl={`${origin}/auth/callback-complete?next=${encodeURIComponent(next)}`}
        dividerText={passwordForm ? t('auth:orDivider') : undefined}
        admin={admin}
      />
      {passwordForm && <LoginForm redirectTo={next} />}
      {!passwords && admin && (
        <p className="text-muted-foreground text-center text-sm">{t('auth:adminLoginSuperusersOnly')}</p>
      )}
      {passwords && (
        <AuthCardFooterLink href="/auth/forgot-password" className="block text-center">
          {t('auth:forgotPasswordLink')}
        </AuthCardFooterLink>
      )}
    </AuthCard>
  )
}
