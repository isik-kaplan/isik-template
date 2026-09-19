import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { AuthCard } from '@/components/app-auth/AuthCard'
import { CompleteSignupForm } from '@/components/app-auth/CompleteSignupForm'

import { sUseTranslation } from '@/i18n'
import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { getRequestOrigin } from '@isikk/core/next/request'

// Landed on after a first-ever social signup - SOCIALACCOUNT_AUTO_SIGNUP is off, so the provider's
// suggested username is always confirmable here first, not committed silently. Lives under
// auth/, not profile/ - profile/layout.tsx requires an existing session, and by definition there
// isn't one yet at this point (that's exactly what this page is for) - nesting it there created an
// infinite redirect loop with /auth/login's own pending-signup check.
export default async function CompleteSignupPage() {
  const requestHeaders = await headers()
  const authOrigin = getRequestOrigin(requestHeaders, { isLocalDevHost }).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, { cookieHeader: requestHeaders.get('cookie') ?? undefined })

  // No pending signup (this page reached directly, or the flow already completed/expired) - there
  // is nothing to finish here.
  const { data } = await authApi.pendingProviderSignup()
  if (!data) redirect('/auth/login')
  // Stryker disable next-line ArrayDeclaration,StringLiteral: equivalent mutant. Every t()
  // call here names its full 'auth:key', so this array only matters for an unprefixed
  // lookup - none of them are.
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:completeSignupTitle')}>
      <CompleteSignupForm email={data.data.user.email} suggestedUsername={data.data.user.username} />
    </AuthCard>
  )
}
