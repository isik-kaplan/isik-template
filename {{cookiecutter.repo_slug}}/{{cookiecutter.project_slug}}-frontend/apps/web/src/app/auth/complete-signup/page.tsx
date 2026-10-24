import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { AuthCard } from '@/components/app-auth/AuthCard'
import { CompleteSignupForm } from '@/components/app-auth/CompleteSignupForm'
import { LegalConsentNotice } from '@/components/app-legal/LegalConsentNotice'

import { sUseTranslation } from '@/i18n'
import { requestOrigin } from '@/lib/requestOrigin'
import { visitorFetch } from '@/lib/visitor'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

// After a first-ever social signup. Under auth/, not profile/: profile/layout.tsx requires a session,
// which looped with /auth/login's pending-signup check.
export default async function CompleteSignupPage() {
  const requestHeaders = await headers()
  const authOrigin = requestOrigin(requestHeaders).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })

  // No pending signup: nothing to finish.
  const { data } = await authApi.pendingProviderSignup()
  if (!data) redirect('/auth/login')
  const { t } = await sUseTranslation(['auth'])

  return (
    <AuthCard title={t('auth:completeSignupTitle')}>
      <CompleteSignupForm email={data.data.user.email} suggestedUsername={data.data.user.username} />
      <LegalConsentNotice />
    </AuthCard>
  )
}
