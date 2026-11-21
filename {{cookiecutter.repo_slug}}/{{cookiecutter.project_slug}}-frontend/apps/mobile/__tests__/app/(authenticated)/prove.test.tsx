import Prove from '@/app/(authenticated)/prove'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockSession = jest.fn()
const mockReauthenticate = jest.fn()
const mockRequestPasswordReset = jest.fn()
const mockRequestCode = jest.fn()
const mockConfirmCode = jest.fn()
const mockBack = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    session: () => mockSession(),
    reauthenticate: (...args: unknown[]) => mockReauthenticate(...args),
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
    requestReauthenticationCode: (...args: unknown[]) => mockRequestCode(...args),
    confirmReauthenticationCode: (...args: unknown[]) => mockConfirmCode(...args),
  }),
}))
jest.mock('expo-router', () => ({ router: { back: () => mockBack() } }))

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => (resolve = settle))
  return { promise, resolve }
}

function signedIn(user: Record<string, unknown>) {
  mockSession.mockResolvedValue({ data: { data: { user } } })
}

describe('Prove', () => {
  beforeEach(() => jest.clearAllMocks())

  it('waits for the session before offering anything, and forgets it if the screen has gone', async () => {
    const session = deferred<unknown>()
    mockSession.mockReturnValue(session.promise)
    const { unmount } = await render(<Prove />)
    expect(screen.getByTestId('prove-loading')).toBeTruthy()

    await unmount()
    session.resolve({ data: { data: { user: { has_usable_password: true } } } })
    await session.promise
    expect(screen.queryByTestId('prove-form')).toBeNull()
  })

  it('goes back to whatever asked once the password proves it', async () => {
    signedIn({ email: 'alice@example.test', has_usable_password: true })
    mockReauthenticate.mockResolvedValue({ data: {}, error: undefined })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())
    expect(screen.getByTestId('prove-heading').props.children).toBe("Confirm it's you")
    expect(screen.getByTestId('prove-password-input').props.placeholder).toBe('Password')
    expect(screen.getByTestId('prove-password-input').props.value).toBe('')
    expect(screen.getByTestId('prove-submit-label').props.children).toBe('Confirm')

    await fireEvent.changeText(screen.getByTestId('prove-password-input'), 'correct-horse')
    await fireEvent.press(screen.getByTestId('prove-submit'))

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    expect(mockReauthenticate).toHaveBeenCalledWith('correct-horse')
    expect(screen.queryByTestId('prove-error')).toBeNull()
  })

  it('shows a pending label while it checks', async () => {
    signedIn({ has_usable_password: true })
    const answer = deferred<unknown>()
    mockReauthenticate.mockReturnValue(answer.promise)
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())

    fireEvent.press(screen.getByTestId('prove-submit'))

    await waitFor(() => expect(screen.getByTestId('prove-submit-label').props.children).toBe('Confirming…'))
    expect(screen.getByTestId('prove-submit').props.accessibilityState.disabled).toBe(true)
    answer.resolve({ data: {} })
    await waitFor(() => expect(mockBack).toHaveBeenCalled())
  })

  it("shows the server's own reason when the password is wrong, and stays put", async () => {
    signedIn({ has_usable_password: true })
    mockReauthenticate.mockResolvedValue({
      data: undefined,
      error: { errors: [{ code: 'incorrect_password', param: 'password', message: 'Incorrect password.' }] },
    })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())

    await fireEvent.press(screen.getByTestId('prove-submit'))

    await waitFor(() => expect(screen.getByTestId('prove-error').props.children).toBe('Incorrect password.'))
    expect(mockBack).not.toHaveBeenCalled()
    expect(screen.getByTestId('prove-submit-label').props.children).toBe('Confirm')
  })

  it('clears an earlier refusal once the password proves it', async () => {
    signedIn({ has_usable_password: true })
    mockReauthenticate.mockResolvedValueOnce({ data: undefined, error: {} })
    mockReauthenticate.mockResolvedValueOnce({ data: {}, error: undefined })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())

    await fireEvent.press(screen.getByTestId('prove-submit'))
    await waitFor(() => expect(screen.getByTestId('prove-error')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('prove-submit'))

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('prove-error')).toBeNull()
  })

  it('falls back to its own message when the server names no error', async () => {
    signedIn({ has_usable_password: true })
    mockReauthenticate.mockResolvedValue({ data: undefined, error: { errors: [] } })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())

    await fireEvent.press(screen.getByTestId('prove-submit'))

    await waitFor(() => expect(screen.getByTestId('prove-error').props.children).toBe('That password is not right.'))
  })

  it('falls back to its own message for an unreadable refusal too', async () => {
    signedIn({ has_usable_password: true })
    mockReauthenticate.mockResolvedValue({ data: undefined, error: {} })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())

    await fireEvent.press(screen.getByTestId('prove-submit'))

    await waitFor(() => expect(screen.getByTestId('prove-error').props.children).toBe('That password is not right.'))
  })

  it('treats a session it cannot read as one with a password', async () => {
    mockSession.mockResolvedValue({ data: undefined })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())
  })

  it('offers an account with no password a link to set one by email, and says where it went', async () => {
    signedIn({ email: 'alice@example.test', has_usable_password: false })
    mockRequestPasswordReset.mockResolvedValue({})
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-set-password')).toBeTruthy())
    expect(screen.getByTestId('prove-heading').props.children).toBe("Confirm it's you")
    expect(screen.getByTestId('prove-set-password-submit-label').props.children).toBe(
      'Email me a link to set a password'
    )
    expect(screen.getByTestId('prove-set-password-hint').props.children).toBe(
      'Your account has no password yet. We can email you a link to set one, and you can confirm with it afterwards.'
    )

    await fireEvent.press(screen.getByTestId('prove-set-password-submit'))

    await waitFor(() => expect(screen.getByTestId('prove-set-password-sent')).toBeTruthy())
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('alice@example.test')
    expect(screen.getByTestId('prove-set-password-sent').props.children).toBe(
      'We sent a link to alice@example.test. Set a password there, then come back to confirm with it.'
    )
  })

  it('cannot send the link twice while the first is on its way', async () => {
    signedIn({ has_usable_password: false })
    const sent = deferred<unknown>()
    mockRequestPasswordReset.mockReturnValue(sent.promise)
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-set-password')).toBeTruthy())

    fireEvent.press(screen.getByTestId('prove-set-password-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('prove-set-password-submit').props.accessibilityState.disabled).toBe(true)
    )
    expect(mockRequestPasswordReset).toHaveBeenCalledWith('')
    sent.resolve({})
    await waitFor(() => expect(screen.getByTestId('prove-set-password-sent')).toBeTruthy())
  })

  it('says to wait when refused for coming too often', async () => {
    signedIn({ has_usable_password: true })
    mockReauthenticate.mockResolvedValue({
      data: undefined,
      error: { status: 429 },
      response: new Response(null, { status: 429 }),
    })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-form')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('prove-submit'))
    await waitFor(() =>
      expect(screen.getByTestId('prove-error').props.children).toBe('Too many requests. Wait a moment, then try again.')
    )
    expect(mockBack).not.toHaveBeenCalled()
  })
})

describe('Prove without passwords', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'true'
    signedIn({ email: 'alice@example.test', has_usable_password: false })
  })
  afterEach(() => {
    process.env.EXPO_PUBLIC_SOCIAL_LOGIN_ONLY = 'false'
  })

  async function sendTheCode() {
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-code')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('prove-code-send'))
  }

  it('sends a code to the address, then goes back once it proves it', async () => {
    mockRequestCode.mockResolvedValue({ data: {}, error: undefined })
    mockConfirmCode.mockResolvedValue({ data: {}, error: undefined })
    await render(<Prove />)
    await waitFor(() => expect(screen.getByTestId('prove-code')).toBeTruthy())
    expect(screen.getByTestId('prove-code-send-label').props.children).toBe('Send a code to alice@example.test')

    await fireEvent.press(screen.getByTestId('prove-code-send'))
    await waitFor(() =>
      expect(screen.getByTestId('prove-code-sent').props.children).toBe(
        'We sent a code to alice@example.test. Enter it below.'
      )
    )
    expect(screen.getByTestId('prove-code-input').props.placeholder).toBe('Code')
    await fireEvent.changeText(screen.getByTestId('prove-code-input'), ' BCDF-GHJK ')
    await fireEvent.press(screen.getByTestId('prove-code-submit'))

    await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
    expect(mockRequestCode).toHaveBeenCalledWith({ email: 'alice@example.test' })
    expect(mockConfirmCode).toHaveBeenCalledWith('BCDF-GHJK')
    expect(mockReauthenticate).not.toHaveBeenCalled()
  })

  it.each([
    ['the server says why', { errors: [{ message: 'Address not verified.' }] }, 'Address not verified.'],
    ['the server gives no reason', {}, 'We could not send a code. Wait a moment and try again.'],
  ])('stays on the offer when the code is not sent and %s', async (_label, error, shown) => {
    mockRequestCode.mockResolvedValue({ data: undefined, error, response: new Response(null, { status: 400 }) })

    await sendTheCode()

    await waitFor(() => expect(screen.getByTestId('prove-error').props.children).toBe(shown))
    expect(screen.getByTestId('prove-code-send')).toBeTruthy()
    expect(screen.queryByTestId('prove-code-input')).toBeNull()
  })

  it.each([
    ['the server says why', { errors: [{ message: 'Incorrect code.' }] }, 'Incorrect code.'],
    ['the server gives no reason', {}, 'That code is not right, or it expired. Ask for a new one.'],
  ])('stays put on a code that proves nothing when %s', async (_label, error, shown) => {
    mockRequestCode.mockResolvedValue({ data: {}, error: undefined })
    mockConfirmCode.mockResolvedValue({ data: undefined, error, response: new Response(null, { status: 400 }) })

    await sendTheCode()
    await waitFor(() => expect(screen.getByTestId('prove-code-input')).toBeTruthy())
    await fireEvent.changeText(screen.getByTestId('prove-code-input'), 'WRONG')
    await fireEvent.press(screen.getByTestId('prove-code-submit'))

    await waitFor(() => expect(screen.getByTestId('prove-error').props.children).toBe(shown))
    expect(mockBack).not.toHaveBeenCalled()
  })

  it('says to wait when the code is asked for too often', async () => {
    mockRequestCode.mockResolvedValue({
      data: undefined,
      error: {},
      response: new Response(null, { status: 429, headers: { 'Retry-After': '30' } }),
    })

    await sendTheCode()

    await waitFor(() =>
      expect(screen.getByTestId('prove-error').props.children).toBe('Too many requests. Try again in 30 seconds.')
    )
  })

  it('says to wait when codes are tried too often', async () => {
    mockRequestCode.mockResolvedValue({ data: {}, error: undefined })
    mockConfirmCode.mockResolvedValue({ data: undefined, error: {}, response: new Response(null, { status: 429 }) })

    await sendTheCode()
    await waitFor(() => expect(screen.getByTestId('prove-code-input')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('prove-code-submit'))

    await waitFor(() =>
      expect(screen.getByTestId('prove-error').props.children).toBe('Too many requests. Wait a moment, then try again.')
    )
  })
})
