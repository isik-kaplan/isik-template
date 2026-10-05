import Prove from '@/app/(authenticated)/prove'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockSession = jest.fn()
const mockReauthenticate = jest.fn()
const mockRequestPasswordReset = jest.fn()
const mockBack = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    session: () => mockSession(),
    reauthenticate: (...args: unknown[]) => mockReauthenticate(...args),
    requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
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
})
