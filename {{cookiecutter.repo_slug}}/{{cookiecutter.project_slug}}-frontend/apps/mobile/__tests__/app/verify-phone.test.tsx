import VerifyPhone from '@/app/verify-phone'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockVerifyPhone = jest.fn()
const mockResendPhoneCode = jest.fn()
const mockChangePhone = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    verifyPhone: (...args: unknown[]) => mockVerifyPhone(...args),
    resendPhoneCode: () => mockResendPhoneCode(),
    changePhone: (...args: unknown[]) => mockChangePhone(...args),
  }),
}))

const mockReplace = jest.fn()
const mockPush = jest.fn()
jest.mock('expo-router', () => {
  const { Text } = jest.requireActual('react-native')
  return {
    router: { replace: (...args: unknown[]) => mockReplace(...args), push: (...args: unknown[]) => mockPush(...args) },
    Link: ({ children, testID }: { children: unknown; testID?: string }) => <Text testID={testID}>{children}</Text>,
  }
})

const pending = (flow: Record<string, unknown>) => ({
  data: undefined,
  error: { status: 401, data: { flows: [flow] } },
  response: new Response(null, { status: 401 }),
})

async function enter(code: string) {
  await render(<VerifyPhone />)
  await fireEvent.changeText(screen.getByTestId('verify-phone-code-input'), code)
  await fireEvent.press(screen.getByTestId('verify-phone-submit'))
}

describe('VerifyPhone', () => {
  beforeEach(() => jest.clearAllMocks())

  it('asks for the code the phone can fill in by itself, and offers a way back', async () => {
    await render(<VerifyPhone />)
    expect(screen.getByTestId('verify-phone-heading').props.children).toBe('Enter the code we texted you')
    const input = screen.getByTestId('verify-phone-code-input')
    expect([input.props.autoComplete, input.props.textContentType, input.props.value]).toEqual([
      'one-time-code',
      'oneTimeCode',
      '',
    ])
    expect(screen.getByTestId('verify-phone-login-link')).toBeTruthy()
  })

  it('cannot be sent empty, or as only spaces', async () => {
    await render(<VerifyPhone />)
    expect(screen.getByTestId('verify-phone-submit').props.accessibilityState.disabled).toBe(true)
    await fireEvent.changeText(screen.getByTestId('verify-phone-code-input'), '   ')
    expect(screen.getByTestId('verify-phone-submit').props.accessibilityState.disabled).toBe(true)
  })

  it('sends the code, trimmed, and lands on home where it finishes the login', async () => {
    mockVerifyPhone.mockResolvedValue({ data: { meta: { is_authenticated: true } }, error: undefined })
    await enter(' ABCD-EFGH ')
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(authenticated)/home'))
    expect(mockVerifyPhone).toHaveBeenCalledWith('ABCD-EFGH')
  })

  it('says the address is owed next after a signup', async () => {
    mockVerifyPhone.mockResolvedValue(pending({ id: 'verify_email', is_pending: true }))
    await enter('ABCD-EFGH')
    expect((await screen.findByTestId('verify-phone-notice')).props.children).toBe(
      "Number verified. Now confirm your email address - we've sent you a link."
    )
    expect(mockReplace).not.toHaveBeenCalled()
    expect(screen.queryByTestId('verify-phone-error')).toBeNull()
  })

  it('goes on to the second factor after a login', async () => {
    mockVerifyPhone.mockResolvedValue(pending({ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }))
    await enter('ABCD-EFGH')
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/two-factor'))
  })

  it("shows allauth's refusal of a wrong code", async () => {
    mockVerifyPhone.mockResolvedValue({
      data: undefined,
      error: { status: 400, errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }] },
      response: new Response(null, { status: 400 }),
    })
    await enter('WRONG')
    expect((await screen.findByTestId('verify-phone-error')).props.children).toBe('Incorrect code.')
  })

  it('falls back to its own words when allauth gives none', async () => {
    mockVerifyPhone.mockResolvedValue(pending({ id: 'login' }))
    await enter('ABCD-EFGH')
    expect((await screen.findByTestId('verify-phone-error')).props.children).toBe("That code didn't work. Try again.")
  })

  it('says how long to wait when throttled', async () => {
    mockVerifyPhone.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 429, headers: { 'Retry-After': '12' } }),
    })
    await enter('ABCD-EFGH')
    expect((await screen.findByTestId('verify-phone-error')).props.children).toBe(
      'Too many requests. Try again in 12 seconds.'
    )
  })

  it('shows it is verifying, and clears an old error and notice, while the code is out', async () => {
    mockVerifyPhone.mockResolvedValueOnce(pending({ id: 'login' }))
    await enter('ABCD-EFGH')
    await waitFor(() => expect(screen.getByTestId('verify-phone-error')).toBeTruthy())

    let finish: (value: unknown) => void = () => undefined
    mockVerifyPhone.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    // Not awaited: fireEvent's act() would wait on the held-open promise.
    fireEvent.press(screen.getByTestId('verify-phone-submit'))
    await waitFor(() => expect(screen.getByText('Verifying…')).toBeTruthy())
    expect(screen.queryByTestId('verify-phone-error')).toBeNull()
    expect(screen.getByTestId('verify-phone-submit').props.accessibilityState.disabled).toBe(true)
    finish({ data: { meta: { is_authenticated: true } } })
    await waitFor(() => expect(mockReplace).toHaveBeenCalled())
  })

  it('sends a new code on request', async () => {
    mockResendPhoneCode.mockResolvedValue({ response: new Response(null, { status: 200 }) })
    await render(<VerifyPhone />)
    await fireEvent.press(screen.getByTestId('verify-phone-resend'))
    expect((await screen.findByTestId('verify-phone-notice')).props.children).toBe('A new code is on its way.')
  })

  it.each([
    [409, 'Could not send a new code.'],
    [429, 'Too many requests. Wait a moment, then try again.'],
  ])('says so when a new code is refused with a %s', async (status, message) => {
    mockResendPhoneCode.mockResolvedValue({ response: new Response(null, { status }) })
    await render(<VerifyPhone />)
    await fireEvent.press(screen.getByTestId('verify-phone-resend'))
    expect((await screen.findByTestId('verify-phone-error')).props.children).toBe(message)
    expect(screen.queryByTestId('verify-phone-notice')).toBeNull()
  })

  describe('a wrong number', () => {
    async function correct(number: string) {
      await render(<VerifyPhone />)
      expect(screen.getByTestId('verify-phone-change').props.accessibilityState.disabled).toBe(true)
      await fireEvent.changeText(screen.getByTestId('verify-phone-number-input'), number)
      await fireEvent.press(screen.getByTestId('verify-phone-change'))
    }

    it('is corrected, the new number texted, and the field emptied', async () => {
      mockChangePhone.mockResolvedValue({ data: { data: [{ phone: '+14155550199', verified: false }] } })
      await correct('+14155550199')
      expect((await screen.findByTestId('verify-phone-notice')).props.children).toBe(
        'We texted a code to the new number.'
      )
      expect(mockChangePhone).toHaveBeenCalledWith('+14155550199')
      expect(screen.getByTestId('verify-phone-number-input').props.value).toBe('')
    })

    it("shows allauth's refusal", async () => {
      mockChangePhone.mockResolvedValue({
        data: undefined,
        error: { status: 400, errors: [{ code: 'invalid', param: 'phone', message: 'Not a number.' }] },
        response: new Response(null, { status: 400 }),
      })
      await correct('0415')
      expect((await screen.findByTestId('verify-phone-error')).props.children).toBe('Not a number.')
    })

    it('falls back to its own words, or the wait, when allauth gives none', async () => {
      mockChangePhone.mockResolvedValue({
        data: undefined,
        error: undefined,
        response: new Response(null, { status: 500 }),
      })
      await correct('+14155550199')
      expect((await screen.findByTestId('verify-phone-error')).props.children).toBe('Could not change the number.')

      mockChangePhone.mockResolvedValue({
        data: undefined,
        error: undefined,
        response: new Response(null, { status: 429 }),
      })
      await fireEvent.changeText(screen.getByTestId('verify-phone-number-input'), '+14155550199')
      await fireEvent.press(screen.getByTestId('verify-phone-change'))
      await waitFor(() =>
        expect(screen.getByTestId('verify-phone-error').props.children).toBe(
          'Too many requests. Wait a moment, then try again.'
        )
      )
    })
  })

  it('labels every control', async () => {
    await render(<VerifyPhone />)
    expect(screen.getByTestId('verify-phone-code-input').props.placeholder).toBe('Code')
    expect(screen.getByTestId('verify-phone-submit-label').props.children).toBe('Verify')
    expect(screen.getByText('Send a new code')).toBeTruthy()
    expect(screen.getByTestId('verify-phone-number-input').props.placeholder).toBe(
      'Phone number, with its + and country code'
    )
    expect(screen.getByText('Text this number instead')).toBeTruthy()
    expect(screen.getByText('Back to log in')).toBeTruthy()
  })

  it('clears an old notice when the code goes out', async () => {
    mockResendPhoneCode.mockResolvedValue({ response: new Response(null, { status: 200 }) })
    mockVerifyPhone.mockResolvedValue(pending({ id: 'login' }))
    await render(<VerifyPhone />)
    await fireEvent.press(screen.getByTestId('verify-phone-resend'))
    await screen.findByTestId('verify-phone-notice')
    await fireEvent.changeText(screen.getByTestId('verify-phone-code-input'), 'WRONG')
    await fireEvent.press(screen.getByTestId('verify-phone-submit'))
    await screen.findByTestId('verify-phone-error')
    expect(screen.queryByTestId('verify-phone-notice')).toBeNull()
  })

  it('clears an old error when a new code, or a corrected number, goes through', async () => {
    mockResendPhoneCode.mockResolvedValueOnce({ response: new Response(null, { status: 409 }) })
    await render(<VerifyPhone />)
    await fireEvent.press(screen.getByTestId('verify-phone-resend'))
    await screen.findByTestId('verify-phone-error')

    mockResendPhoneCode.mockResolvedValueOnce({ response: new Response(null, { status: 200 }) })
    await fireEvent.press(screen.getByTestId('verify-phone-resend'))
    await waitFor(() => expect(screen.queryByTestId('verify-phone-error')).toBeNull())

    mockResendPhoneCode.mockResolvedValueOnce({ response: new Response(null, { status: 409 }) })
    await fireEvent.press(screen.getByTestId('verify-phone-resend'))
    await screen.findByTestId('verify-phone-error')
    mockChangePhone.mockResolvedValue({ data: { data: [{ phone: '+14155550199', verified: false }] } })
    await fireEvent.changeText(screen.getByTestId('verify-phone-number-input'), '+14155550199')
    await fireEvent.press(screen.getByTestId('verify-phone-change'))
    await waitFor(() => expect(screen.queryByTestId('verify-phone-error')).toBeNull())
  })

  it('falls back to its own words when allauth lists no error', async () => {
    const empty = { data: undefined, error: { status: 400, errors: [] }, response: new Response(null, { status: 400 }) }
    mockVerifyPhone.mockResolvedValue(empty)
    mockChangePhone.mockResolvedValue(empty)
    await enter('WRONG')
    expect((await screen.findByTestId('verify-phone-error')).props.children).toBe("That code didn't work. Try again.")

    await fireEvent.changeText(screen.getByTestId('verify-phone-number-input'), '+14155550199')
    await fireEvent.press(screen.getByTestId('verify-phone-change'))
    await waitFor(() =>
      expect(screen.getByTestId('verify-phone-error').props.children).toBe('Could not change the number.')
    )
  })
})
