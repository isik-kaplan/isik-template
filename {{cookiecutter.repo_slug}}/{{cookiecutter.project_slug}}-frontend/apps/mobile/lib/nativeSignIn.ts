import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'

export type ProviderToken = { provider: 'google' | 'apple'; token: Record<string, unknown> }

/** Thin wrapper over two unrelated native SDKs, one function each - callers (login.tsx,
 * signup.tsx) and their tests depend on this module alone, never on the SDKs directly. Both
 * SDKs need a real device/dev-client build (neither works in Expo Go) and per-project
 * credentials this template can't supply - see the mobile app's README for setup. */
export async function signInWithGoogle(): Promise<ProviderToken | null> {
  await GoogleSignin.hasPlayServices()
  const response = await GoogleSignin.signIn()
  // A cancelled picker resolves rather than rejects, tagged by its own `type` field - there's no
  // token to send in that case, not a failure to report either.
  if (response.type === 'cancelled') return null
  return { provider: 'google', token: { id_token: response.data.idToken, client_id: response.data.user.id } }
}

export async function signInWithApple(): Promise<ProviderToken | null> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    })
    return { provider: 'apple', token: { id_token: credential.identityToken } }
  } catch (error) {
    // Apple's SDK rejects on cancellation instead of resolving a "cancelled" variant (unlike
    // Google's above) - its own error code is the only way to tell that apart from a real failure.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return null
    throw error
  }
}
