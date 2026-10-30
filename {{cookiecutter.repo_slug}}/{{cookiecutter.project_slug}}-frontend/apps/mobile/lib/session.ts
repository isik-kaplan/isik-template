import { AppAuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { authOrigin } from './config'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'session_token'

// The backend's "prove it is you, then retry" refusal.
export const REAUTHENTICATION_REQUIRED_HEADER = 'X-Reauthentication-Required'
export const PROVE_ROUTE = '/prove'

async function reauthenticatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
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
