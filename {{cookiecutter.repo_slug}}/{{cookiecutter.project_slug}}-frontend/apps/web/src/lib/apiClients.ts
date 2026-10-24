import { redirect } from 'next/navigation'

import { Api, type ApiOptions } from '@{{ cookiecutter.repo_slug }}/api'
import { AuthApi, type AuthApiOptions } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { REAUTHENTICATION_REQUIRED_HEADER, provePath } from './reauthentication'
import { LOGIN_PATH, broadcastSessionCleared } from './sessionChannel'
import { nameFetchFailures } from '@isikk/core'

// Set only when the backend just cleared a dead session's cookie, never on an ordinary 403.
const SESSION_CLEARED_HEADER = 'X-Session-Cleared'

// Neither branch clears the cookie, so its presence alone never means "authenticated".
function autoLogoutFetch(rawFetch: typeof fetch): typeof fetch {
  // Named inside: redirect() throws, and an outer wrapper would rename it a fetch failure.
  const baseFetch = nameFetchFailures(rawFetch)
  return async (input, init) => {
    const response = await baseFetch(input, init)
    // Never settles, so the caller shows no error before the page leaves.
    if (response.headers.has(REAUTHENTICATION_REQUIRED_HEADER) && typeof window !== 'undefined') {
      window.location.href = provePath(`${window.location.pathname}${window.location.search}`)
      return new Promise<Response>(() => {})
    }
    if (response.headers.has(SESSION_CLEARED_HEADER)) {
      if (typeof window === 'undefined') {
        redirect(LOGIN_PATH)
      } else {
        // A hard reload, not router.push: all client state is stale once the session is dead.
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
