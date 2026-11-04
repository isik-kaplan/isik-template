import Signup from '@/app/signup'
import type { NameRequirement } from '@/lib/nameRequirement'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

let mockRequirement: NameRequirement = 'username_with_optional_full'
jest.mock('@/lib/nameRequirement', () => ({
  get NAME_REQUIREMENT() {
    return mockRequirement
  },
}))

const mockSignup = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ signup: (...args: unknown[]) => mockSignup(...args) }) }))

const mockReplace = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    router: { replace: (...args: unknown[]) => mockReplace(...args) },
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

// Each requirement's names as the backend's NameRequirement offers them, in form order.
const OFFERED: [NameRequirement, string[]][] = [
  ['username_with_optional_full', ['username', 'first_name', 'last_name']],
  ['full_only', ['first_name', 'last_name']],
  ['full_and_username', ['first_name', 'last_name', 'username']],
  ['full_with_optional_username', ['first_name', 'last_name', 'username']],
  ['username_only', ['username']],
]
const TEST_IDS: Record<string, string> = {
  first_name: 'first-name-input',
  last_name: 'last-name-input',
  username: 'username-input',
}
const PLACEHOLDERS: Record<string, string> = { first_name: 'First name', last_name: 'Last name', username: 'Username' }
const VALUES: Record<string, string> = { first_name: 'Jane', last_name: 'Doe', username: 'jane' }
const inputOrder = () => screen.getAllByTestId(/-input$/).map((node) => node.props.testID)

describe('Signup', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirement = 'username_with_optional_full'
  })

  it('navigates to the authenticated home on a successful signup', async () => {
    mockSignup.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<Signup />)
    await fireEvent.changeText(screen.getByTestId('username-input'), 'jane')
    await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
    expect(mockSignup).toHaveBeenCalledWith({
      username: 'jane',
      first_name: '',
      last_name: '',
      email: 'jane@test.test',
      password: 'correct-horse',
    })
  })

  it('says signing up, by either route, is agreeing to the legal documents', async () => {
    process.env.EXPO_PUBLIC_AUTH_ORIGIN = 'http://auth.example.test'
    await render(<Signup />)
    expect(screen.getByTestId('legal-consent-notice')).toBeTruthy()
    expect(screen.getByTestId('legal-link-terms-of-service')).toBeTruthy()
  })

  it('starts with empty username, email and password fields', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('username-input').props.value).toBe('')
    expect(screen.getByTestId('email-input').props.value).toBe('')
    expect(screen.getByTestId('password-input').props.value).toBe('')
  })

  it('shows the heading and input placeholders', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-heading').props.children).toBe('Sign up')
    expect(screen.getByTestId('username-input').props.placeholder).toBe('Username')
    expect(screen.getByTestId('email-input').props.placeholder).toBe('Email')
    expect(screen.getByTestId('password-input').props.placeholder).toBe('Password')
  })

  it('shows the idle "Sign up" label before any submission', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-submit-label').props.children).toBe('Sign up')
  })

  it('falls back to a generic error message when errors is an empty array', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.children).toContain('Could not sign up')
  })

  it('clears a previous error message as soon as a new submission starts', async () => {
    mockSignup.mockResolvedValueOnce({
      data: undefined,
      error: { errors: [{ code: 'email_taken', param: 'email', message: 'That email is already in use.' }] },
    })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())

    let resolveSignup: (value: unknown) => void = () => undefined
    mockSignup.mockReturnValue(new Promise((resolve) => (resolveSignup = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.queryByTestId('signup-error')).toBeNull())
    resolveSignup({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('re-enables the submit button and resets its label after a failed submission', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('signup-submit-label').props.children).toBe('Sign up')
  })

  it('shows the server error message when signup fails with one', async () => {
    mockSignup.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'email_taken', param: 'email', message: 'That email is already in use.' }] },
    })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.children).toBe('That email is already in use.')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when the response carries none', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.children).toContain('Could not sign up')
  })

  it('shows a submitting state while the request is in flight', async () => {
    let resolveSignup: (value: unknown) => void = () => undefined
    mockSignup.mockReturnValue(new Promise((resolve) => (resolveSignup = resolve)))
    await render(<Signup />)
    // Not awaited: fireEvent's act() would wait on the never-resolving promise.
    fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByText('Signing up…')).toBeTruthy())
    resolveSignup({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('styles the form container', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-form').props.style).toEqual({
      flex: 1,
      justifyContent: 'center',
      padding: 24,
      gap: 12,
    })
  })

  it('styles the heading', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-heading').props.style).toEqual({ fontSize: 24, fontWeight: 'bold' })
  })

  it('styles the submit button and its label', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('signup-submit').props.style).toEqual({
      backgroundColor: 'black',
      borderRadius: 8,
      padding: 12,
      alignItems: 'center',
    })
    expect(screen.getByTestId('signup-submit-label').props.style).toEqual({ color: 'white' })
  })

  it('styles the username, email and password inputs identically', async () => {
    await render(<Signup />)
    const expected = { borderWidth: 1, borderRadius: 8, padding: 12 }
    expect(screen.getByTestId('username-input').props.style).toEqual(expected)
    expect(screen.getByTestId('email-input').props.style).toEqual(expected)
    expect(screen.getByTestId('password-input').props.style).toEqual(expected)
  })

  it('styles the error message red', async () => {
    mockSignup.mockResolvedValue({ data: undefined, error: {} })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() => expect(screen.getByTestId('signup-error')).toBeTruthy())
    expect(screen.getByTestId('signup-error').props.style).toEqual({ color: 'red' })
  })

  it('links to the login screen', async () => {
    await render(<Signup />)
    expect(screen.getByTestId('login-link')).toBeTruthy()
    expect(screen.getByText('Already have an account? Log in')).toBeTruthy()
  })

  it('says to wait when refused for coming too often', async () => {
    mockSignup.mockResolvedValue({
      data: undefined,
      error: { status: 429 },
      response: new Response(null, { status: 429 }),
    })
    await render(<Signup />)
    await fireEvent.press(screen.getByTestId('signup-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('signup-error').props.children).toBe(
        'Too many requests. Wait a moment, then try again.'
      )
    )
    expect(mockReplace).not.toHaveBeenCalled()
  })

  describe.each(OFFERED)('under %s', (name, offered) => {
    beforeEach(() => {
      mockRequirement = name
    })

    it('asks for exactly its names, in its order, before the email and password', async () => {
      await render(<Signup />)
      expect(inputOrder()).toEqual([...offered.map((field) => TEST_IDS[field]), 'email-input', 'password-input'])
      for (const field of offered) {
        expect(screen.getByTestId(TEST_IDS[field]).props.placeholder).toBe(PLACEHOLDERS[field])
        expect(screen.getByTestId(TEST_IDS[field]).props.value).toBe('')
        expect(screen.getByTestId(TEST_IDS[field]).props.autoCapitalize).toBe(field === 'username' ? 'none' : 'words')
      }
    })

    it('sends only its names, with the email and password', async () => {
      mockSignup.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await render(<Signup />)
      for (const field of offered) await fireEvent.changeText(screen.getByTestId(TEST_IDS[field]), VALUES[field])
      await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
      await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
      await fireEvent.press(screen.getByTestId('signup-submit'))
      await waitFor(() => expect(mockReplace).toHaveBeenCalled())
      expect(mockSignup).toHaveBeenCalledWith({
        email: 'jane@test.test',
        password: 'correct-horse',
        ...Object.fromEntries(offered.map((field) => [field, VALUES[field]])),
      })
    })
  })
})
