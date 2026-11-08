import { VerifyPhoneForm } from '@/components/app-auth/VerifyPhoneForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const push = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function pending(flow: Record<string, unknown>) {
  return jsonResponse(401, { status: 401, data: { flows: [flow] }, meta: { is_authenticated: false } })
}

async function lastRequest() {
  const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
  const [request] = calls[calls.length - 1]
  return request as Request
}

const INVALID_NUMBER = 'Enter the number with its + and country code, like +14155550123.'

describe('VerifyPhoneForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  async function enter(code: string) {
    const user = userEvent.setup()
    render(<VerifyPhoneForm redirectTo="/a b" />)
    if (code) await user.type(screen.getByLabelText('Code'), code)
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    return user
  }

  it('asks for the code the phone can fill in by itself', () => {
    render(<VerifyPhoneForm redirectTo="/" />)

    const input = screen.getByLabelText('Code') as HTMLInputElement
    expect([input.autocomplete, input.value]).toEqual(['one-time-code', ''])
  })

  it('sends the code, trimmed, and signs in where it finishes the login', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )

    await enter('  ABCD-EFGH ')

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/a b'))
    expect(refresh).toHaveBeenCalled()
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true)
    const request = await lastRequest()
    expect(new URL(request.url).pathname).toBe('/v0/browser/auth/phone/verify')
    expect(await request.json()).toEqual({ code: 'ABCD-EFGH' })
  })

  it('goes on to the address after a signup', async () => {
    globalThis.fetch = vi.fn(async () => pending({ id: 'verify_email', is_pending: true }))

    await enter('ABCD-EFGH')

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/auth/signup-email-sent'))
    expect(push).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('goes on to the second factor after a login, keeping "next"', async () => {
    globalThis.fetch = vi.fn(async () => pending({ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }))

    await enter('ABCD-EFGH')

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith('/auth/two-factor?next=%2Fa%20b'))
    expect(push).toHaveBeenCalledTimes(1)
  })

  it("shows allauth's refusal of a wrong code under the field", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }],
      })
    )

    await enter('WRONG')

    expect(await screen.findByText('Incorrect code.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('shows a refusal that names no field under the code', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'too_many_attempts', message: 'Too many attempts.' }] })
    )

    await enter('WRONG')

    expect(await screen.findByText('Too many attempts.')).toBeTruthy()
  })

  it('shows each refusal of the code on a line of its own', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [
          { code: 'a', param: 'code', message: 'First.' },
          { code: 'b', param: 'code', message: 'Second.' },
        ],
      })
    )

    await enter('WRONG')

    expect(await screen.findAllByText((_, node) => node?.textContent === 'First.\nSecond.')).not.toHaveLength(0)
  })

  it('reports a 401 owing nothing it knows as a failure', async () => {
    globalThis.fetch = vi.fn(async () => pending({ id: 'login' }))

    await enter('ABCD-EFGH')

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not verify that code.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('refuses an empty code without asking the server', async () => {
    globalThis.fetch = vi.fn()

    await enter('')

    expect(await screen.findByText('Could not verify that code.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('sends a new code on request', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200 }))
    const user = userEvent.setup()
    render(<VerifyPhoneForm redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('A new code is on its way.'))
    expect(new URL((await lastRequest()).url).pathname).toBe('/v0/browser/auth/phone/verify/resend')
  })

  it('says so when no more codes may be sent', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(409, { status: 409 }))
    const user = userEvent.setup()
    render(<VerifyPhoneForm redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Send a new code' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not send a new code.'))
  })

  describe('a wrong number', () => {
    async function correct(number: string) {
      const user = userEvent.setup()
      render(<VerifyPhoneForm redirectTo="/" />)
      expect(screen.queryByLabelText('Phone number')).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Wrong number?' }))
      await user.type(screen.getByLabelText('Phone number'), number)
      await user.click(screen.getByRole('button', { name: 'Text this number instead' }))
    }

    it('is corrected, the new number texted, and the field put away', async () => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse(202, { status: 202, data: [{ phone: '+14155550199', verified: false }] })
      )

      await correct('+14155550199')

      await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('We texted a code to the new number.'))
      const request = await lastRequest()
      expect(new URL(request.url).pathname).toBe('/v0/browser/account/phone')
      expect(await request.json()).toEqual({ phone: '+14155550199' })
      expect(screen.queryByLabelText('Phone number')).toBeNull()
      expect(screen.getByRole('button', { name: 'Wrong number?' })).toBeTruthy()
    })

    it('is refused without asking the server when it is not in E.164', async () => {
      globalThis.fetch = vi.fn()

      await correct('555 0199')

      expect(await screen.findByText(INVALID_NUMBER)).toBeTruthy()
      expect(globalThis.fetch).not.toHaveBeenCalled()
    })

    it('shows a refusal that names no field under the number', async () => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse(400, { status: 400, errors: [{ code: 'max_changes', message: 'No more changes.' }] })
      )

      await correct('+14155550199')

      expect(await screen.findByText('No more changes.')).toBeTruthy()
    })

    it('falls back to its own words when a refusal carries none', async () => {
      globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))

      await correct('+14155550199')

      await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not change the number.'))
    })

    it('shows each refusal on a line of its own', async () => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse(400, {
          status: 400,
          errors: [
            { code: 'a', param: 'phone', message: 'First.' },
            { code: 'b', param: 'phone', message: 'Second.' },
          ],
        })
      )

      await correct('+14155550199')

      expect(await screen.findAllByText((_, node) => node?.textContent === 'First.\nSecond.')).not.toHaveLength(0)
    })

    it("keeps the field up with allauth's refusal", async () => {
      globalThis.fetch = vi.fn(async () =>
        jsonResponse(400, { status: 400, errors: [{ code: 'phone_taken', param: 'phone', message: 'Taken.' }] })
      )

      await correct('+14155550199')

      expect(await screen.findByText('Taken.')).toBeTruthy()
      expect(screen.getByLabelText('Phone number')).toBeTruthy()
    })
  })
})
