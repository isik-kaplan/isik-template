import { redirect } from 'next/navigation'

import { Api, type ApiOptions } from '@{{ cookiecutter.repo_slug }}/api'
import { AuthApi, type AuthApiOptions } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { LOGIN_PATH, broadcastSessionCleared } from './sessionChannel'

// Set by BaseModelViewSet only when it just cleared a dead session's cookie, never on an ordinary
// 403 - the one authoritative "log out for real" signal.
const SESSION_CLEARED_HEADER = 'X-Session-Cleared'

// window is undefined in Server Component/Action execution, never in the browser. Neither branch
// clears the actual cookie - it lingers until a real login overwrites it, so any anonymous-guard
// that checks cookie presence must never treat presence alone as "authenticated".
function autoLogoutFetch(baseFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const response = await baseFetch(input, init)
    if (response.headers.has(SESSION_CLEARED_HEADER)) {
      if (typeof window === 'undefined') {
        redirect(LOGIN_PATH)
      } else {
        // Only the browser can tell the other tabs - a Server Component render has no sibling
        // tabs to reach, and the visitor's own next request re-triggers this anyway. A hard
        // reload, deliberately not router.push: every bit of client state (SessionContext
        // included) is stale once the session is dead, and Next's soft navigation wouldn't clear it.
        broadcastSessionCleared()
        window.location.href = LOGIN_PATH
      }
    }
    return response
  }
}

export function createApi(baseUrl: string, options: ApiOptions = {}): Api {
  return new Api(baseUrl, { ...options, baseFetch: autoLogoutFetch(options.baseFetch ?? fetch.bind(globalThis)) })
}

export function createAuthApi(baseUrl: string, options: AuthApiOptions = {}): AuthApi {
  return new AuthApi(baseUrl, { ...options, baseFetch: autoLogoutFetch(options.baseFetch ?? fetch.bind(globalThis)) })
}
