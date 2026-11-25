import Login from '@/app/login'
import type { NameRequirement } from '@/lib/nameRequirement'
import type { Phone } from '@/lib/phoneOption'
import { look, themeOf } from '@/theme'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const LIGHT = themeOf('light')

let mockRequirement: NameRequirement = 'username_with_optional_full'
jest.mock('@/lib/nameRequirement', () => ({
  get NAME_REQUIREMENT() {
    return mockRequirement
  },
}))

let mockPhone: Phone = 'none'
jest.mock('@/lib/phoneOption', () => ({
  get PHONE() {
    return mockPhone
  },
}))

const mockLogin = jest.fn()
jest.mock('@/lib/session', () => ({ getAuthApi: () => ({ login: (...args: unknown[]) => mockLogin(...args) }) }))

const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    router: { replace: (...args: unknown[]) => mockReplace(...args), push: (...args: unknown[]) => mockPush(...args) },
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRequirement = 'full_only'
    mockPhone = 'none'
  })

  it('navigates to the authenticated home on a successful login', async () => {
    mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await render(<Login />)
    await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
    await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
    expect(mockLogin).toHaveBeenCalledWith({ email: 'jane@test.test', password: 'correct-horse' })
  })

  it('starts with empty email and password fields', async () => {
    await render(<Login />)
    expect(screen.getByTestId('email-input').props.value).toBe('')
    expect(screen.getByTestId('password-input').props.value).toBe('')
  })

  it('shows the heading and input placeholders', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-heading').props.children).toBe('Log in')
    expect(screen.getByTestId('email-input').props.placeholder).toBe('Email')
    expect(screen.getByTestId('password-input').props.placeholder).toBe('Password')
  })

  it('shows the idle "Log in" label before any submission', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-submit-label').props.children).toBe('Log in')
  })

  it('tells an unconfirmed address apart from a wrong password', async () => {
    mockLogin.mockResolvedValue({
      data: undefined,
      error: { status: 401, data: { flows: [{ id: 'verify_email', is_pending: true }] }, meta: {} },
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toContain('Confirm your email address first')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when errors is an empty array', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toContain('Could not log in')
  })

  it('clears a previous error message as soon as a new submission starts', async () => {
    mockLogin.mockResolvedValueOnce({
      data: undefined,
      error: { errors: [{ code: 'invalid_credentials', message: 'Incorrect email or password.' }] },
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())

    let resolveLogin: (value: unknown) => void = () => undefined
    mockLogin.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)))
    // Not awaited - see "shows a submitting state" below for why.
    fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.queryByTestId('login-error')).toBeNull())
    resolveLogin({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('re-enables the submit button and resets its label after a failed submission', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: {} })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-submit').props.accessibilityState.disabled).toBe(false)
    expect(screen.getByTestId('login-submit-label').props.children).toBe('Log in')
  })

  it('shows the server error message when login fails with one', async () => {
    mockLogin.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'invalid_credentials', message: 'Incorrect email or password.' }] },
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toBe('Incorrect email or password.')
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when the response carries none', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: {} })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.children).toContain('Could not log in')
  })

  it('shows a submitting state while the request is in flight', async () => {
    let resolveLogin: (value: unknown) => void = () => undefined
    mockLogin.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)))
    await render(<Login />)
    // Not awaited: fireEvent's act() would wait on the never-resolving promise.
    fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByText('Logging in…')).toBeTruthy())
    resolveLogin({ data: { meta: { is_authenticated: true } }, error: undefined })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('styles the form container', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-form').props.contentContainerStyle).toEqual(look.screen())
  })

  it('styles the heading', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-heading').props.style).toEqual(look.heading(LIGHT))
  })

  it('styles the submit button and its label', async () => {
    await render(<Login />)
    expect(screen.getByTestId('login-submit').props.style).toEqual(look.button(LIGHT))
    expect(screen.getByTestId('login-submit-label').props.style).toEqual(look.buttonLabel(LIGHT))
  })

  it('styles the email and password inputs identically', async () => {
    await render(<Login />)
    const expected = look.field(LIGHT)
    expect(screen.getByTestId('email-input').props.style).toEqual(expected)
    expect(screen.getByTestId('password-input').props.style).toEqual(expected)
  })

  it('styles the error message red', async () => {
    mockLogin.mockResolvedValue({ data: undefined, error: {} })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(screen.getByTestId('login-error')).toBeTruthy())
    expect(screen.getByTestId('login-error').props.style).toEqual(look.error(LIGHT))
  })

  it('links to the signup screen', async () => {
    await render(<Login />)
    expect(screen.getByTestId('signup-link')).toBeTruthy()
    expect(screen.getByText('Need an account? Sign up')).toBeTruthy()
  })

  it('links to the forgot-password screen', async () => {
    await render(<Login />)
    expect(screen.getByTestId('forgot-password-link')).toBeTruthy()
    expect(screen.getByText('Forgot password?')).toBeTruthy()
  })

  it('sends a right password with a second factor still owed on to the two-factor screen', async () => {
    mockLogin.mockResolvedValue({
      data: undefined,
      error: { status: 401, data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }] } },
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/two-factor'))
    expect(screen.queryByTestId('login-error')).toBeNull()
    expect(mockReplace).not.toHaveBeenCalled()
  })

  it('says to wait when refused for coming too often, rather than that the password was wrong', async () => {
    mockLogin.mockResolvedValue({
      data: undefined,
      error: { status: 429 },
      response: new Response(null, { status: 429 }),
    })
    await render(<Login />)
    await fireEvent.press(screen.getByTestId('login-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('login-error').props.children).toBe('Too many requests. Wait a moment, then try again.')
    )
    expect(mockReplace).not.toHaveBeenCalled()
  })

  describe.each<[NameRequirement, boolean]>([
    ['username_with_optional_full', true],
    ['full_only', false],
    ['full_and_username', true],
    ['full_with_optional_username', false],
    ['username_only', true],
  ])('under %s', (name, byHandle) => {
    beforeEach(() => {
      mockRequirement = name
    })

    it(byHandle ? 'asks for a username or an email' : 'asks for an email alone', async () => {
      await render(<Login />)
      expect(screen.getByTestId('email-input').props.placeholder).toBe(byHandle ? 'Username or email' : 'Email')
      expect(screen.getByTestId('email-input').props.keyboardType).toBe(byHandle ? 'default' : 'email-address')
    })

    it(byHandle ? 'sends a plain identifier as the username' : 'sends any identifier as the email', async () => {
      mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await render(<Login />)
      await fireEvent.changeText(screen.getByTestId('email-input'), 'jane')
      await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
      await fireEvent.press(screen.getByTestId('login-submit'))
      await waitFor(() => expect(mockReplace).toHaveBeenCalled())
      expect(mockLogin).toHaveBeenCalledWith({
        ...(byHandle ? { username: 'jane' } : { email: 'jane' }),
        password: 'correct-horse',
      })
    })

    it('sends an address as the email', async () => {
      mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await render(<Login />)
      await fireEvent.changeText(screen.getByTestId('email-input'), 'jane@test.test')
      await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
      await fireEvent.press(screen.getByTestId('login-submit'))
      await waitFor(() => expect(mockReplace).toHaveBeenCalled())
      expect(mockLogin).toHaveBeenCalledWith({ email: 'jane@test.test', password: 'correct-horse' })
    })
  })

  describe('with phone numbers', () => {
    async function logIn(login: string) {
      await render(<Login />)
      await fireEvent.changeText(screen.getByTestId('email-input'), login)
      await fireEvent.changeText(screen.getByTestId('password-input'), 'correct-horse')
      await fireEvent.press(screen.getByTestId('login-submit'))
    }

    it.each([
      ['full_only', 'Email or phone number'],
      ['username_only', 'Username, email or phone number'],
    ] as const)('names the ways in under %s, on a keypad that types a +', async (requirement, placeholder) => {
      mockRequirement = requirement
      mockPhone = 'required'
      await render(<Login />)
      const input = screen.getByTestId('email-input')
      expect([input.props.placeholder, input.props.keyboardType]).toEqual([placeholder, 'default'])
    })

    it('sends a number as `phone` where numbers sign in', async () => {
      mockPhone = 'required'
      mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await logIn('+14155550123')
      await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
      expect(mockLogin).toHaveBeenCalledWith({ phone: '+14155550123', password: 'correct-horse' })
    })

    it('sends a handle as `username` where numbers sign in too', async () => {
      mockRequirement = 'username_only'
      mockPhone = 'required'
      mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await logIn('jane')
      await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ username: 'jane', password: 'correct-horse' }))
    })

    it('sends a number as the address where numbers never sign in', async () => {
      mockPhone = 'optional'
      mockLogin.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
      await logIn('+14155550123')
      await waitFor(() => expect(mockLogin).toHaveBeenCalledWith({ email: '+14155550123', password: 'correct-horse' }))
    })

    it('sends a login by a number never verified on to the code step', async () => {
      mockPhone = 'required'
      mockLogin.mockResolvedValue({
        data: undefined,
        error: { status: 401, data: { flows: [{ id: 'verify_phone', is_pending: true }] } },
      })
      await logIn('+14155550123')
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/verify-phone'))
      expect(screen.queryByTestId('login-error')).toBeNull()
    })
  })
})

describe('Login without passwords', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'true'
  })
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'false'
  })

  it('asks for no password and offers no reset, only the providers and the way to sign up', async () => {
    await render(<Login />)

    for (const testID of ['email-input', 'password-input', 'login-submit', 'forgot-password-link']) {
      expect(screen.queryByTestId(testID)).toBeNull()
    }
    expect(screen.getByTestId('signup-link')).toBeTruthy()
  })
})
