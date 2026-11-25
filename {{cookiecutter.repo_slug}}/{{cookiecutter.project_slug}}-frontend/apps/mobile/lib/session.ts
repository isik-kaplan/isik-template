import { AppAuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { authOrigin } from './config'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'session_token'

// The backend's "prove it is you, then retry" refusal.
export const REAUTHENTICATION_REQUIRED_HEADER = 'X-Reauthentication-Required'
export const PROVE_ROUTE = '/prove'

/** The status a request that never reached the server answers with: see answered. */
export const UNREACHABLE_STATUS = 503

/**
 * A request that never reached the server comes back as a 503, so each screen's own no-answer path runs instead of
 * an unhandled rejection. An abort is the caller's own doing, and is left to throw.
 */
export async function answered(request: () => Promise<Response>): Promise<Response> {
  try {
    return await request()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    return new Response(JSON.stringify({ unreachable: true }), {
      status: UNREACHABLE_STATUS,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

async function reauthenticatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await answered(() => fetch(input, init))
  if (response.headers.has(REAUTHENTICATION_REQUIRED_HEADER)) router.push(PROVE_ROUTE)
  return response
}

const SESSION_TOKEN_HEADER = 'X-Session-Token'

/** The backend's own API takes the session token allauth's app API gives out, in the same header. */
export async function signedInFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers)
  const token = await SecureStore.getItemAsync(TOKEN_KEY)
  if (token) headers.set(SESSION_TOKEN_HEADER, token)
  return reauthenticatingFetch(input, { ...init, headers })
}

/** Whether this phone holds a session token: what counts as signed in while the server can't be asked. */
export async function holdsSession(): Promise<boolean> {
  return Boolean(await SecureStore.getItemAsync(TOKEN_KEY))
}

/** expo-secure-store, not AsyncStorage, because it is encrypted. */
export function createAuthApi(baseUrl: string): AppAuthApi {
  return new AppAuthApi(baseUrl, {
    getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
    setToken: (token) => (token ? SecureStore.setItemAsync(TOKEN_KEY, token) : SecureStore.deleteItemAsync(TOKEN_KEY)),
    baseFetch: reauthenticatingFetch,
  })
}

// Lazy, so a missing EXPO_PUBLIC_AUTH_ORIGIN throws on first use rather than at import.
let instance: AppAuthApi | undefined
export function getAuthApi(): AppAuthApi {
  if (!instance) instance = createAuthApi(authOrigin())
  return instance
}
