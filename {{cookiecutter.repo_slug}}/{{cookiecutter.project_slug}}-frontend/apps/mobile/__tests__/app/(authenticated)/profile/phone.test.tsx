import ProfilePhone from '@/app/(authenticated)/profile/phone'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPhone = jest.fn()
const mockChangePhone = jest.fn()
const mockVerifyPhone = jest.fn()
jest.mock('@/lib/session', () => ({
  getAuthApi: () => ({
    phone: () => mockPhone(),
    changePhone: (...args: unknown[]) => mockChangePhone(...args),
    verifyPhone: (...args: unknown[]) => mockVerifyPhone(...args),
  }),
}))

const VERIFIED = { data: { data: [{ phone: '+14155550123', verified: true }] } }
const SENT = { data: { data: [{ phone: '+14155550199', verified: false }] } }

async function sendTo(number: string) {
  await fireEvent.changeText(screen.getByTestId('profile-phone-number-input'), number)
  await fireEvent.press(screen.getByTestId('profile-phone-send'))
}

describe('ProfilePhone', () => {
  beforeEach(() => jest.clearAllMocks())

  it('shows the number once loaded', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    await render(<ProfilePhone />)
    await waitFor(() => expect(screen.getByTestId('profile-phone-current').props.children).toBe('+14155550123'))
    expect(screen.getByTestId('profile-phone-heading').props.children).toBe('Phone number')
  })

  it('marks an unverified number', async () => {
    mockPhone.mockResolvedValue({ data: { data: [{ phone: '+14155550123', verified: false }] } })
    await render(<ProfilePhone />)
    await waitFor(() =>
      expect(screen.getByTestId('profile-phone-current').props.children).toBe('+14155550123 (unverified)')
    )
  })

  it.each([{ data: { data: [] } }, { data: undefined }])('says the account has no number (%j)', async (answer) => {
    mockPhone.mockResolvedValue(answer)
    await render(<ProfilePhone />)
    await waitFor(() => expect(mockPhone).toHaveBeenCalled())
    expect(screen.getByTestId('profile-phone-current').props.children).toBe('This account has no phone number.')
  })

  it('cannot send an empty number', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    await render(<ProfilePhone />)
    expect(screen.getByTestId('profile-phone-send').props.accessibilityState.disabled).toBe(true)
  })

  it('texts a new number, then saves it once its code comes back', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    mockChangePhone.mockResolvedValue(SENT)
    mockVerifyPhone.mockResolvedValue({ data: { meta: { is_authenticated: true } } })
    await render(<ProfilePhone />)
    await waitFor(() => expect(screen.getByTestId('profile-phone-current').props.children).toBe('+14155550123'))

    await sendTo('+14155550199')

    expect((await screen.findByTestId('profile-phone-code-sent')).props.children).toBe(
      'We texted a code to +14155550199.'
    )
    expect(mockChangePhone).toHaveBeenCalledWith('+14155550199')
    // The old number stays until the new one is verified.
    expect(screen.getByTestId('profile-phone-current').props.children).toBe('+14155550123')
    expect(screen.getByTestId('profile-phone-verify').props.accessibilityState.disabled).toBe(true)

    await fireEvent.changeText(screen.getByTestId('profile-phone-code-input'), ' ABCD-EFGH ')
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))

    expect((await screen.findByTestId('profile-phone-saved')).props.children).toBe('Phone number saved.')
    expect(mockVerifyPhone).toHaveBeenCalledWith('ABCD-EFGH')
    expect(screen.getByTestId('profile-phone-current').props.children).toBe('+14155550199')
    expect(screen.queryByTestId('profile-phone-code-input')).toBeNull()
    expect(screen.getByTestId('profile-phone-number-input').props.value).toBe('')
  })

  it("shows allauth's refusal of a number, its own words when there is none, or the wait", async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    await render(<ProfilePhone />)

    mockChangePhone.mockResolvedValue({
      data: undefined,
      error: { status: 400, errors: [{ code: 'phone_taken', param: 'phone', message: 'Taken.' }] },
      response: new Response(null, { status: 400 }),
    })
    await sendTo('+14155550199')
    expect((await screen.findByTestId('profile-phone-error')).props.children).toBe('Taken.')

    mockChangePhone.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 500 }),
    })
    await sendTo('+14155550199')
    await waitFor(() =>
      expect(screen.getByTestId('profile-phone-error').props.children).toBe('Could not change the phone number.')
    )

    mockChangePhone.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 429 }),
    })
    await sendTo('+14155550199')
    await waitFor(() =>
      expect(screen.getByTestId('profile-phone-error').props.children).toBe(
        'Too many requests. Wait a moment, then try again.'
      )
    )
    expect(screen.queryByTestId('profile-phone-code-input')).toBeNull()
  })

  it('keeps the code step up after a wrong code, with the refusal, its own words, or the wait', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    mockChangePhone.mockResolvedValue(SENT)
    await render(<ProfilePhone />)
    await sendTo('+14155550199')
    await screen.findByTestId('profile-phone-code-input')
    await fireEvent.changeText(screen.getByTestId('profile-phone-code-input'), 'WRONG')

    mockVerifyPhone.mockResolvedValue({
      data: undefined,
      error: { status: 400, errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }] },
      response: new Response(null, { status: 400 }),
    })
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    expect((await screen.findByTestId('profile-phone-error')).props.children).toBe('Incorrect code.')

    mockVerifyPhone.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 409 }),
    })
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    await waitFor(() =>
      expect(screen.getByTestId('profile-phone-error').props.children).toBe("That code didn't work. Try again.")
    )

    mockVerifyPhone.mockResolvedValue({
      data: undefined,
      error: undefined,
      response: new Response(null, { status: 429 }),
    })
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    await waitFor(() =>
      expect(screen.getByTestId('profile-phone-error').props.children).toBe(
        'Too many requests. Wait a moment, then try again.'
      )
    )
    expect(screen.getByTestId('profile-phone-current').props.children).toBe('+14155550123')
    expect(screen.queryByTestId('profile-phone-saved')).toBeNull()
  })

  it('sets nothing once the screen has gone', async () => {
    let answer: (value: unknown) => void = () => undefined
    mockPhone.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    const { unmount } = await render(<ProfilePhone />)
    await unmount()
    answer(VERIFIED)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByText('+14155550123')).toBeNull()
  })

  it('labels every control, and says nothing is saved yet', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    mockChangePhone.mockResolvedValue(SENT)
    await render(<ProfilePhone />)
    expect(screen.getByTestId('profile-phone-number-input').props.placeholder).toBe(
      'New phone number, with its + and country code'
    )
    expect(screen.getByText('Text it a code')).toBeTruthy()
    expect(screen.queryByTestId('profile-phone-saved')).toBeNull()

    await sendTo('+14155550199')
    expect((await screen.findByTestId('profile-phone-code-input')).props.placeholder).toBe('Code')
    expect(screen.getByText('Save number')).toBeTruthy()
  })

  it('cannot save a code of only spaces', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    mockChangePhone.mockResolvedValue(SENT)
    await render(<ProfilePhone />)
    await sendTo('+14155550199')
    await fireEvent.changeText(await screen.findByTestId('profile-phone-code-input'), '   ')
    expect(screen.getByTestId('profile-phone-verify').props.accessibilityState.disabled).toBe(true)
  })

  it('starts the next change with an empty code', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    mockChangePhone.mockResolvedValue(SENT)
    mockVerifyPhone.mockResolvedValue({ data: { meta: { is_authenticated: true } } })
    await render(<ProfilePhone />)
    await sendTo('+14155550199')
    await fireEvent.changeText(await screen.findByTestId('profile-phone-code-input'), 'ABCD-EFGH')
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    await screen.findByTestId('profile-phone-saved')

    await sendTo('+14155550188')
    expect((await screen.findByTestId('profile-phone-code-input')).props.value).toBe('')
  })

  it('clears an old error once a number, or a code, goes through', async () => {
    mockPhone.mockResolvedValue(VERIFIED)
    const refused = { data: undefined, error: undefined, response: new Response(null, { status: 500 }) }
    await render(<ProfilePhone />)
    mockChangePhone.mockResolvedValueOnce(refused)
    await sendTo('+14155550199')
    await screen.findByTestId('profile-phone-error')
    mockChangePhone.mockResolvedValueOnce(SENT)
    await sendTo('+14155550199')
    await screen.findByTestId('profile-phone-code-input')
    expect(screen.queryByTestId('profile-phone-error')).toBeNull()

    await fireEvent.changeText(screen.getByTestId('profile-phone-code-input'), 'WRONG')
    mockVerifyPhone.mockResolvedValueOnce(refused)
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    await screen.findByTestId('profile-phone-error')
    mockVerifyPhone.mockResolvedValueOnce({ data: { meta: { is_authenticated: true } } })
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    await screen.findByTestId('profile-phone-saved')
    expect(screen.queryByTestId('profile-phone-error')).toBeNull()
  })

  it('falls back to its own words when allauth lists no error', async () => {
    const empty = { data: undefined, error: { status: 400, errors: [] }, response: new Response(null, { status: 400 }) }
    mockPhone.mockResolvedValue(VERIFIED)
    await render(<ProfilePhone />)
    mockChangePhone.mockResolvedValueOnce(empty)
    await sendTo('+14155550199')
    expect((await screen.findByTestId('profile-phone-error')).props.children).toBe('Could not change the phone number.')

    mockChangePhone.mockResolvedValueOnce(SENT)
    await sendTo('+14155550199')
    await fireEvent.changeText(await screen.findByTestId('profile-phone-code-input'), 'WRONG')
    mockVerifyPhone.mockResolvedValueOnce(empty)
    await fireEvent.press(screen.getByTestId('profile-phone-verify'))
    await waitFor(() =>
      expect(screen.getByTestId('profile-phone-error').props.children).toBe("That code didn't work. Try again.")
    )
  })
})
