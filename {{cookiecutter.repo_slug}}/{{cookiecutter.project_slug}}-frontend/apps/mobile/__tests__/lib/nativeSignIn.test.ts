import { signInWithApple, signInWithGoogle } from '@/lib/nativeSignIn'

import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'

jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 'EMAIL' },
}))

jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { hasPlayServices: jest.fn(), signIn: jest.fn() },
}))

describe('signInWithGoogle', () => {
  beforeEach(() => jest.clearAllMocks())

  it('checks for Play Services before signing in', async () => {
    ;(GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: { idToken: 't', user: { id: 'u' } },
    })
    await signInWithGoogle()
    expect(GoogleSignin.hasPlayServices).toHaveBeenCalled()
  })

  it('returns the id token and client id on success', async () => {
    ;(GoogleSignin.signIn as jest.Mock).mockResolvedValue({
      type: 'success',
      data: { idToken: 'the-id-token', user: { id: 'the-client-id' } },
    })
    const result = await signInWithGoogle()
    expect(result).toEqual({ provider: 'google', token: { id_token: 'the-id-token', client_id: 'the-client-id' } })
  })

  it('returns null when the picker is cancelled', async () => {
    ;(GoogleSignin.signIn as jest.Mock).mockResolvedValue({ type: 'cancelled' })
    const result = await signInWithGoogle()
    expect(result).toBeNull()
  })
})

describe('signInWithApple', () => {
  beforeEach(() => jest.clearAllMocks())

  it('requests the email scope', async () => {
    ;(AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 't' })
    await signInWithApple()
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({ requestedScopes: ['EMAIL'] })
  })

  it('returns the identity token on success', async () => {
    ;(AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'the-identity-token' })
    const result = await signInWithApple()
    expect(result).toEqual({ provider: 'apple', token: { id_token: 'the-identity-token' } })
  })

  it('returns null when the user cancels', async () => {
    ;(AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' })
    const result = await signInWithApple()
    expect(result).toBeNull()
  })

  it('rethrows any other error', async () => {
    ;(AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue({ code: 'ERR_SOMETHING_ELSE' })
    await expect(signInWithApple()).rejects.toEqual({ code: 'ERR_SOMETHING_ELSE' })
  })

  it('rethrows a non-object error untouched', async () => {
    ;(AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue('boom')
    await expect(signInWithApple()).rejects.toBe('boom')
  })

  it('rethrows a null rejection untouched, without crashing on a property read', async () => {
    ;(AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(null)
    await expect(signInWithApple()).rejects.toBe(null)
  })
})
