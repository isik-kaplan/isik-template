import ForgotPassword from '@/app/forgot-password'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockRequestPasswordReset = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({ requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args) }),
}))

jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

describe('ForgotPassword', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows the idle "Send reset link" label before any submission', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('forgot-password-submit-label').props.children).toBe('Send reset link')
  })

  it('starts with an empty email field', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('email-input').props.value).toBe('')
  })

  it('shows the heading and input placeholder', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('forgot-password-heading').props.children).toBe('Forgot password')
    expect(screen.getByTestId('email-input').props.placeholder).toBe('Email')
  })

  it('requests a password reset for the entered email and shows the confirmation', async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: undefined, error: undefined })
    await render(<ForgotPassword />)
    await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
    await fireEvent.press(screen.getByTestId('forgot-password-submit'))
    await waitFor(() => expect(screen.getByTestId('forgot-password-sent')).toBeTruthy())
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('jane@test.test')
    expect(screen.getByTestId('forgot-password-heading').props.children).toBe('Check your email')
    expect(screen.getByTestId('forgot-password-sent-message').props.children).toBe(
      "If an account exists for jane@test.test, we've sent a link to reset the password."
    )
  })

  it('shows the confirmation even when the request errors, revealing nothing about the address', async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: undefined, error: {} })
    await render(<ForgotPassword />)
    await fireEvent.press(screen.getByTestId('forgot-password-submit'))
    await waitFor(() => expect(screen.getByTestId('forgot-password-sent')).toBeTruthy())
  })

  it('shows a submitting state while the request is in flight', async () => {
    let resolveRequest: (value: unknown) => void = () => undefined
    mockRequestPasswordReset.mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)))
    await render(<ForgotPassword />)
    // Not awaited: the promise above deliberately never resolves, and fireEvent's own act()
    // wrapper waits for pending work to settle - awaiting it here would hang forever.
    fireEvent.press(screen.getByTestId('forgot-password-submit'))
    await waitFor(() => expect(screen.getByText('Sending…')).toBeTruthy())
    resolveRequest({ data: undefined, error: undefined })
    await waitFor(() => expect(screen.getByTestId('forgot-password-sent')).toBeTruthy())
  })

  it('styles the form container', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('forgot-password-form').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })

  it('styles the heading', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('forgot-password-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('styles the submit button and its label', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('forgot-password-submit').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('forgot-password-submit-label').props.style).toEqual({ color: 'white' })
  })

  it('styles the email input', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('email-input').props.style).toEqual({ borderWidth: 1, borderRadius: 8, padding: 12 })
  })

  it('links back to login from the form', async () => {
    await render(<ForgotPassword />)
    expect(screen.getByTestId('login-link')).toBeTruthy()
    expect(screen.getByText('Back to log in')).toBeTruthy()
  })

  it('links back to login from the confirmation', async () => {
    mockRequestPasswordReset.mockResolvedValue({ data: undefined, error: undefined })
    await render(<ForgotPassword />)
    await fireEvent.press(screen.getByTestId('forgot-password-submit'))
    await waitFor(() => expect(screen.getByTestId('forgot-password-sent')).toBeTruthy())
    expect(screen.getByTestId('login-link')).toBeTruthy()
    expect(screen.getByText('Back to log in')).toBeTruthy()
  })
})
