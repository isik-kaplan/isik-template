import { PhoneSection } from '@/components/app-auth/PhoneSection'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function lastRequest() {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
  const [request] = calls[calls.length - 1]
  return request as Request
}

const NUMBER = { phone: '+14155550123', verified: true }
const UNVERIFIED = { phone: '+14155550123', verified: false }

describe('PhoneSection', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows the number and that it is verified, offering to change it', () => {
    render(<PhoneSection initialPhone={NUMBER} />)

    expect(screen.getByText('+14155550123')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Change number' })).toBeTruthy()
  })

  it('says a number is unverified', () => {
    render(<PhoneSection initialPhone={UNVERIFIED} />)

    expect(screen.getByText('Unverified')).toBeTruthy()
    expect(screen.queryByText('Verified')).toBeNull()
  })

  it('says the account has no number, offering to add one', () => {
    render(<PhoneSection initialPhone={null} />)

    expect(screen.getByText('This account has no phone number.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add number' })).toBeTruthy()
  })

  it('texts a new number, then saves it once its code comes back', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
    )
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={NUMBER} />)

    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Change number' }))

    expect(await screen.findByText('We texted a code to +14155550199.')).toBeTruthy()
    const change = await lastRequest()
    expect(new URL(change.url).pathname).toBe('/v0/browser/account/phone')
    expect(await change.json()).toEqual({ phone: '+14155550199' })
    // The old number stays until the new one is verified.
    expect(screen.getByText('+14155550123')).toBeTruthy()

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    await user.type(screen.getByLabelText('Code'), ' ABCD-EFGH ')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Phone number saved.'))
    const verify = await lastRequest()
    expect(new URL(verify.url).pathname).toBe('/v0/browser/auth/phone/verify')
    expect(await verify.json()).toEqual({ code: 'ABCD-EFGH' })
    expect(screen.getByText('+14155550199')).toBeTruthy()
    expect(screen.getByText('Verified')).toBeTruthy()
    expect(screen.queryByLabelText('Code')).toBeNull()
    expect((screen.getByLabelText('Phone number') as HTMLInputElement).value).toBe('')
  })

  it('refuses a number not in E.164 without asking the server', async () => {
    globalThis.fetch = vi.fn()
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={null} />)

    await user.type(screen.getByLabelText('Phone number'), '555 0199')
    await user.click(screen.getByRole('button', { name: 'Add number' }))

    expect(await screen.findByText('Enter the number with its + and country code, like +14155550123.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it("shows allauth's refusal of a number", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'phone_taken', param: 'phone', message: 'Taken.' }] })
    )
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={null} />)

    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Add number' }))

    expect(await screen.findByText('Taken.')).toBeTruthy()
    expect(screen.queryByLabelText('Code')).toBeNull()
  })

  it('keeps the code step up after a wrong code, and the old number', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
    )
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={NUMBER} />)
    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    await screen.findByLabelText('Code')

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }],
      })
    )
    await user.type(screen.getByLabelText('Code'), 'WRONG')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('Incorrect code.')).toBeTruthy()
    expect(screen.getByText('+14155550123')).toBeTruthy()
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('refuses an empty code without asking the server', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
    )
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={NUMBER} />)
    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    await screen.findByLabelText('Code')
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('Could not verify that code.')).toBeTruthy()
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls)
  })

  it('shows a refusal that names no field under the number, and under the code', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'limited', message: 'Not now.' }] })
    )
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={NUMBER} />)
    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    expect(await screen.findByText('Not now.')).toBeTruthy()

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
    )
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    await screen.findByLabelText('Code')
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'too_many_attempts', message: 'Too many attempts.' }] })
    )
    await user.type(screen.getByLabelText('Code'), 'WRONG')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('Too many attempts.')).toBeTruthy()
  })

  it('wears the filled badge for a verified number and the outlined one for an unverified', () => {
    const { unmount } = render(<PhoneSection initialPhone={NUMBER} />)
    expect(screen.getByText('Verified').className).toContain('bg-primary')
    unmount()

    render(<PhoneSection initialPhone={UNVERIFIED} />)
    expect(screen.getByText('Unverified').className).toContain('border-border')
  })

  it('falls back to its own words when a refusal carries none', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={NUMBER} />)
    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not change the phone number.'))

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
    )
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    await screen.findByLabelText('Code')
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    await user.type(screen.getByLabelText('Code'), 'WRONG')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not verify that code.'))
  })

  it('shows each refusal of a field on a line of its own', async () => {
    const two = [
      { code: 'a', param: 'phone', message: 'First.' },
      { code: 'b', param: 'phone', message: 'Second.' },
    ]
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400, errors: two }))
    const user = userEvent.setup()
    render(<PhoneSection initialPhone={NUMBER} />)
    await user.type(screen.getByLabelText('Phone number'), '+14155550199')
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    expect(await screen.findAllByText((_, node) => node?.textContent === 'First.\nSecond.')).not.toHaveLength(0)

    globalThis.fetch = vi.fn(async () =>
      jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
    )
    await user.click(screen.getByRole('button', { name: 'Change number' }))
    await screen.findByLabelText('Code')
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: two.map((error) => ({ ...error, param: 'code' })) })
    )
    await user.type(screen.getByLabelText('Code'), 'WRONG')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findAllByText((_, node) => node?.textContent === 'First.\nSecond.')).not.toHaveLength(0)
  })
})
