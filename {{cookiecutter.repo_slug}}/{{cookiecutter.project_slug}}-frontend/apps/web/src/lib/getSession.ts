import { headers } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'

import { cache } from 'react'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import type { Session } from './SessionContext'
import { isLocalDevHost } from './isLocalDevHost'
import { getRequestOrigin } from '@isikk/core/next/request'

type SessionState = {
  session: Session
  pendingProviderSignup: boolean
}

// Called independently from the root layout and everything under it, so without cache() one page
// load makes several round trips to auth.<domain>. Argument-free (reads headers() itself) so
// cache() dedupes by render pass, not by argument identity. Scoped to one request only - a real
// hit to the backend on every fresh page load, which is what the X-Session-Cleared auto-logout
// check (apiClients.ts) depends on; a longer-lived cache here would delay noticing a cleared
// session.
const fetchSessionState = cache(async (): Promise<SessionState> => {
  const requestHeaders = await headers()
  const authOrigin = getRequestOrigin(requestHeaders, { isLocalDevHost }).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, { cookieHeader: requestHeaders.get('cookie') ?? undefined })
  try {
    const { data, error } = await authApi.session()
    if (data) {
      return { session: { user: data.data.user }, pendingProviderSignup: false }
    }
    // "provider_signup" - a first-ever login via a social provider, with SOCIALACCOUNT_AUTO_SIGNUP
    // off, lands here rather than being signed in immediately.
    // Stryker disable next-line OptionalChaining: equivalent mutants. Dropping any of these three
    // "?." throws instead of short-circuiting to undefined when that link is missing - but the
    // catch block below turns any thrown error into the exact same pendingProviderSignup: false.
    const pendingProviderSignup = error?.data?.flows?.some((flow) => flow.id === 'provider_signup') ?? false
    return { session: null, pendingProviderSignup }
  } catch (thrown) {
    unstable_rethrow(thrown)
    // An unreachable backend is not "not logged in", but this runs in the root layout, so
    // failing the render would take down every page.
    return { session: null, pendingProviderSignup: false }
  }
})

export async function getSession(): Promise<Session> {
  return (await fetchSessionState()).session
}

// Exposed separately from getSession() for callback-complete/page.tsx, the one place that needs
// to distinguish "not logged in" from "not logged in, but a provider signup is pending" rather
// than just redirect on either.
export async function getSessionState(): Promise<SessionState> {
  return fetchSessionState()
}

export async function redirectIfAuthenticated(redirectTo = '/'): Promise<void> {
  const { session, pendingProviderSignup } = await fetchSessionState()
  if (pendingProviderSignup) redirect('/auth/complete-signup')
  if (session) redirect(redirectTo)
}

export async function requireSession(redirectTo = '/auth/login'): Promise<NonNullable<Session>> {
  const session = await getSession()
  if (!session) redirect(redirectTo)
  return session
}
