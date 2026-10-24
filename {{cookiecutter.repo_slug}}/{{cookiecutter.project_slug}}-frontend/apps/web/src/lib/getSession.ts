import { headers } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'

import type { Language } from '@/i18n/config'

import { AuthApi, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api'

import type { Session } from './SessionContext'
import { requestOrigin } from './requestOrigin'
import { resolveLanguage } from './resolveLanguage'
import { visitorFetch } from './visitor'
import { createSessionGuards } from '@isikk/core/next/session'

type SessionState = {
  session: Session
  pendingProviderSignup: boolean
  // Non-null while a login still owes its second factor: the factors it can be answered with.
  pendingMfaTypes: string[] | null
  language: Language
}

async function fetchSessionState(): Promise<SessionState> {
  const requestHeaders = await headers()
  const authOrigin = requestOrigin(requestHeaders).replace('://', '://auth.')
  const authApi = new AuthApi(authOrigin, {
    cookieHeader: requestHeaders.get('cookie') ?? undefined,
    baseFetch: visitorFetch(requestHeaders),
  })
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
    // A first-ever social login, with SOCIALACCOUNT_AUTO_SIGNUP off.
    const pendingProviderSignup = error?.data?.flows?.some((flow) => flow.id === 'provider_signup') ?? false
    return {
      session: null,
      pendingProviderSignup,
      pendingMfaTypes: pendingMfaTypes(error),
      language: resolveLanguage(null, acceptLanguageHeader),
    }
  } catch (thrown) {
    unstable_rethrow(thrown)
    // Not "not logged in", but failing the root layout would take down every page.
    return {
      session: null,
      pendingProviderSignup: false,
      pendingMfaTypes: null,
      language: resolveLanguage(null, acceptLanguageHeader),
    }
  }
}

// The guards' cache() dedupes within one request and no longer: the X-Session-Cleared logout needs a
// backend hit on every page load.
const guards = createSessionGuards<NonNullable<Session>, SessionState>(fetchSessionState, {
  loginPath: '/auth/login',
  sessionOf: (state) => state.session,
  redirectFor: (state) => (state.pendingProviderSignup ? '/auth/complete-signup' : null),
})

export const { requireSession, getState: getSessionState } = guards
export const redirectIfAuthenticated = guards.redirectIfPresent

export async function getSession(): Promise<Session> {
  return (await getSessionState()).session
}

export async function getLanguage(): Promise<Language> {
  return (await getSessionState()).language
}
