import { redirect } from 'next/navigation'

import { afterSignIn } from '@/lib/afterSignIn'
import { getSessionState } from '@/lib/getSession'

// allauth's callback lands here whatever the outcome, so this page routes on the session state.
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
  const { session, pendingProviderSignup, pendingMfaTypes } = await getSessionState()
  if (pendingProviderSignup) redirect('/auth/complete-signup')
  if (session) redirect(afterSignIn(params.next))
  // The provider vouched for the first factor; an account with a second one still owes it.
  if (pendingMfaTypes) redirect(`/auth/two-factor?next=${encodeURIComponent(afterSignIn(params.next))}`)
  // A failure arrives as an `error` param, not a throw; provider-error picks its copy from the code.
  if (!params.error) redirect('/auth/login')
  const error = Array.isArray(params.error) ? params.error[0] : params.error
  const errorProcess = Array.isArray(params.error_process) ? params.error_process[0] : params.error_process
  const qs = new URLSearchParams({ error, ...(errorProcess ? { error_process: errorProcess } : {}) })
  redirect(`/auth/provider-error?${qs.toString()}`)
}
