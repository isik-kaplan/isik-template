import { redirect } from 'next/navigation'

import { getSessionState } from '@/lib/getSession'

import { getSafeRedirect } from '@isikk/core/next/request'

// The provider redirect's own final landing spot after allauth's classic (non-headless) callback
// view finishes - allauth redirects here (the callback_url the redirect started with, see
// SocialLoginButtons.tsx) regardless of whether the login succeeded, is pending a first-time
// signup, or failed, so it's this page's job to look at the actual session state and route
// accordingly, not allauth's.
export default async function CallbackCompletePage({
  searchParams,
}: {
  searchParams: Promise<{
    next?: string | string[]
    error?: string | string[]
    error_process?: string | string[]
  }>
}) {
  const params = await searchParams
  const { session, pendingProviderSignup } = await getSessionState()
  if (pendingProviderSignup) redirect('/auth/complete-signup')
  if (session) redirect(getSafeRedirect(params.next))
  // A real failure (e.g. the provider declined, or - see the blueprint's own comment on this
  // exact failure mode - the provider sent back no usable identity data) carries an `error` param
  // here rather than throwing - allauth always redirects back to this page's own URL regardless
  // of outcome, error included, so this is the only place that can surface it instead of it being
  // silently dropped. Forwarded on to provider-error, which reads the code to pick its copy.
  if (!params.error) redirect('/auth/login')
  const error = Array.isArray(params.error) ? params.error[0] : params.error
  const errorProcess = Array.isArray(params.error_process) ? params.error_process[0] : params.error_process
  const qs = new URLSearchParams({ error, ...(errorProcess ? { error_process: errorProcess } : {}) })
  redirect(`/auth/provider-error?${qs.toString()}`)
}
