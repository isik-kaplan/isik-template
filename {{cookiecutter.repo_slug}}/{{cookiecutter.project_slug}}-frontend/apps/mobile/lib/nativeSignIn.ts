import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'

export type ProviderToken = { provider: 'google' | 'apple'; token: Record<string, unknown> }

/** Neither SDK works in Expo Go: both need a dev-client build and real credentials. */
export async function signInWithGoogle(): Promise<ProviderToken | null> {
  await GoogleSignin.hasPlayServices()
  const response = await GoogleSignin.signIn()
  // A cancelled picker resolves rather than rejects.
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
    // Unlike Google's, Apple's SDK rejects on cancellation.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return null
    throw error
  }
}
