import { AppAuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { authOrigin } from './config'
import { router } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

const TOKEN_KEY = 'session_token'

// Set by the backend's re-authentication gate on the one refusal that means "prove it is you, then
// retry" - the prove screen goes back to whatever asked once it has the proof.
export const REAUTHENTICATION_REQUIRED_HEADER = 'X-Reauthentication-Required'
export const PROVE_ROUTE = '/prove'

async function reauthenticatingFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (response.headers.has(REAUTHENTICATION_REQUIRED_HEADER)) router.push(PROVE_ROUTE)
  return response
}

/** Wires AppAuthApi to expo-secure-store (encrypted, unlike AsyncStorage). Exported as a factory,
 * not just a ready-made instance, so tests can construct one against a fake baseUrl without
 * needing EXPO_PUBLIC_AUTH_ORIGIN set. */
export function createAuthApi(baseUrl: string): AppAuthApi {
  return new AppAuthApi(baseUrl, {
    getToken: () => SecureStore.getItemAsync(TOKEN_KEY),
    setToken: (token) => (token ? SecureStore.setItemAsync(TOKEN_KEY, token) : SecureStore.deleteItemAsync(TOKEN_KEY)),
    baseFetch: reauthenticatingFetch,
  })
}

// Lazy: authOrigin() throws when EXPO_PUBLIC_AUTH_ORIGIN isn't set, which should surface on first
// real use, not at import time - importing this module with no env configured (e.g. in a test that
// only needs createAuthApi) would otherwise crash before anything runs.
let instance: AppAuthApi | undefined
export function getAuthApi(): AppAuthApi {
  if (!instance) instance = createAuthApi(authOrigin())
  return instance
}
