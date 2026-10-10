import { headers } from 'next/headers'
import { redirect, unstable_rethrow } from 'next/navigation'

import { cache } from 'react'

import type { Language } from '@/i18n/config'

import { AuthApi, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api'

import type { Session } from './SessionContext'
import { requestOrigin } from './requestOrigin'
import { resolveLanguage } from './resolveLanguage'

type SessionState = {
  session: Session
  pendingProviderSignup: boolean
  // Non-null while a login still owes its second factor: the factors it can be answered with.
  pendingMfaTypes: string[] | null
  language: Language
}

// Called independently from the root layout and everything under it, so without cache() one page
// load makes several round trips to auth.<domain>. Argument-free (reads headers() itself) so
// cache() dedupes by render pass, not by argument identity. Scoped to one request only - a real
// hit to the backend on every fresh page load, which is what the X-Session-Cleared auto-logout
// check (apiClients.ts) depends on; a longer-lived cache here would delay noticing a cleared
// session.
const fetchSessionState = cache(async (): Promise<SessionState> => {
  const requestHeaders = await headers()
  const authOrigin = requestOrigin(requestHeaders).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, { cookieHeader: requestHeaders.get('cookie') ?? undefined })
  const acceptLanguageHeader = requestHeaders.get('accept-language')
  try {
    const { data, error } = await authApi.session()
    if (data) {
      return {
        session: { user: data.data.user },
        pendingProviderSignup: false,
        pendingMfaTypes: null,
        language: resolveLanguage(data.data.user.language, acceptLanguageHeader),
      }
    }
    // "provider_signup" - a first-ever login via a social provider, with SOCIALACCOUNT_AUTO_SIGNUP
    // off, lands here rather than being signed in immediately.
    const pendingProviderSignup = error?.data?.flows?.some((flow) => flow.id === 'provider_signup') ?? false
    return {
      session: null,
      pendingProviderSignup,
      pendingMfaTypes: pendingMfaTypes(error),
      language: resolveLanguage(null, acceptLanguageHeader),
    }
  } catch (thrown) {
    unstable_rethrow(thrown)
    // An unreachable backend is not "not logged in", but this runs in the root layout, so
    // failing the render would take down every page.
    return {
      session: null,
      pendingProviderSignup: false,
      pendingMfaTypes: null,
      language: resolveLanguage(null, acceptLanguageHeader),
    }
  }
})

export async function getSession(): Promise<Session> {
  return (await fetchSessionState()).session
}

export async function getLanguage(): Promise<Language> {
  return (await fetchSessionState()).language
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
