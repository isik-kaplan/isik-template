import { SocialLoginButtons } from '@/components'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { Platform } from 'react-native'

const mockLoginWithProviderToken = jest.fn()
const mockPendingProviderSignup = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    loginWithProviderToken: (...args: unknown[]) => mockLoginWithProviderToken(...args),
    pendingProviderSignup: (...args: unknown[]) => mockPendingProviderSignup(...args),
  }),
}))

const mockSignInWithGoogle = jest.fn()
const mockSignInWithApple = jest.fn()
jest.mock('@/lib/nativeSignIn', () => ({
  signInWithGoogle: () => mockSignInWithGoogle(),
  signInWithApple: () => mockSignInWithApple(),
}))

const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => ({
  router: { replace: (...args: unknown[]) => mockReplace(...args), push: (...args: unknown[]) => mockPush(...args) },
}))

describe('SocialLoginButtons', () => {
  const originalOS = Platform.OS

  beforeEach(() => jest.clearAllMocks())
  afterEach(() => {
    Platform.OS = originalOS
  })

  it("defaults to this project's generated config when no override is passed", async () => {
    // Coupled to this generated project's own social_login_providers answer (see
    // lib/socialProviders.ts) rather than a prop override, specifically to prove the real default
    // wiring works end to end, not just the override path every other test here exercises.
    Platform.OS = 'ios'
    await render(<SocialLoginButtons onError={jest.fn()} />)
    expect(screen.getByTestId('google-signin')).toBeTruthy()
    expect(screen.queryByTestId('apple-signin')).toBeNull()
  })

  it('renders nothing when neither provider is enabled', async () => {
    const { toJSON } = await render(
      <SocialLoginButtons onError={jest.fn()} googleEnabled={false} appleEnabled={false} />
    )
    expect(toJSON()).toBeNull()
  })

  it('renders a Google button when Google sign-in is enabled', async () => {
    await render(<SocialLoginButtons onError={jest.fn()} googleEnabled appleEnabled={false} />)
    expect(screen.getByTestId('google-signin')).toBeTruthy()
    expect(screen.getByText('Continue with Google')).toBeTruthy()
  })

  it('renders an Apple button on iOS when Apple sign-in is enabled', async () => {
    Platform.OS = 'ios'
    await render(<SocialLoginButtons onError={jest.fn()} googleEnabled={false} appleEnabled />)
    expect(screen.getByTestId('apple-signin')).toBeTruthy()
    expect(screen.getByText('Continue with Apple')).toBeTruthy()
  })

  it('hides the Apple button off iOS even when enabled', async () => {
    Platform.OS = 'android'
    await render(<SocialLoginButtons onError={jest.fn()} googleEnabled={false} appleEnabled />)
    expect(screen.queryByTestId('apple-signin')).toBeNull()
  })

  it('does nothing when the native picker is cancelled', async () => {
    mockSignInWithGoogle.mockResolvedValue(null)
    const onError = jest.fn()
    await render(<SocialLoginButtons onError={onError} googleEnabled appleEnabled={false} />)
    await fireEvent.press(screen.getByTestId('google-signin'))
    expect(mockLoginWithProviderToken).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
  })

  it('navigates home on a successful login', async () => {
    mockSignInWithGoogle.mockResolvedValue({ provider: 'google', token: { id_token: 't' } })
    mockLoginWithProviderToken.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<SocialLoginButtons onError={jest.fn()} googleEnabled appleEnabled={false} />)
    await fireEvent.press(screen.getByTestId('google-signin'))
    expect(mockLoginWithProviderToken).toHaveBeenCalledWith('google', { id_token: 't' })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
  })

  it('navigates to complete-signup when there is no error but not authenticated', async () => {
    mockSignInWithGoogle.mockResolvedValue({ provider: 'google', token: { id_token: 't' } })
    mockLoginWithProviderToken.mockResolvedValue({ data: undefined, error: {} })
    await render(<SocialLoginButtons onError={jest.fn()} googleEnabled appleEnabled={false} />)
    await fireEvent.press(screen.getByTestId('google-signin'))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/complete-signup'))
  })

  it('reports the server error message on a real failure', async () => {
    mockSignInWithGoogle.mockResolvedValue({ provider: 'google', token: { id_token: 't' } })
    mockLoginWithProviderToken.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'x', message: 'Nope.' }] },
    })
    const onError = jest.fn()
    await render(<SocialLoginButtons onError={onError} googleEnabled appleEnabled={false} />)
    await fireEvent.press(screen.getByTestId('google-signin'))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Nope.'))
  })

  it('reports a generic error when the native sign-in throws', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('boom'))
    const onError = jest.fn()
    await render(<SocialLoginButtons onError={onError} googleEnabled appleEnabled={false} />)
    await fireEvent.press(screen.getByTestId('google-signin'))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Could not sign in - please try again.'))
  })

  it('presses through the Apple flow too', async () => {
    Platform.OS = 'ios'
    mockSignInWithApple.mockResolvedValue({ provider: 'apple', token: { id_token: 'a' } })
    mockLoginWithProviderToken.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<SocialLoginButtons onError={jest.fn()} googleEnabled={false} appleEnabled />)
    await fireEvent.press(screen.getByTestId('apple-signin'))
    expect(mockLoginWithProviderToken).toHaveBeenCalledWith('apple', { id_token: 'a' })
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
  })
})
