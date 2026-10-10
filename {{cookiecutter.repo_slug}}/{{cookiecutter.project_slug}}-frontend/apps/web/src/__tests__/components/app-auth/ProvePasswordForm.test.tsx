import { ProvePasswordForm } from '@/components/app-auth/ProvePasswordForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const replace = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ProvePasswordForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    vi.clearAllMocks()
    document.cookie = 'csrftoken=token'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('asks for the password before sending anything', async () => {
    globalThis.fetch = vi.fn()
    const user = userEvent.setup()
    render(<ProvePasswordForm next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Enter your password.')).toBeTruthy()
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('goes back to where they were once the password proves it', async () => {
    const proved = { status: 200, data: { user: {} }, meta: {} }
    globalThis.fetch = vi.fn(async () => jsonResponse(200, proved))
    const user = userEvent.setup()
    render(<ProvePasswordForm next="/profile/emails" />)

    await user.type(screen.getByLabelText('Password'), 'correct-horse')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/profile/emails'))
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveProperty('disabled', true)
    const [request] = vi.mocked(globalThis.fetch).mock.calls[0] as [Request]
    expect(request.url).toContain('/v0/browser/v1/auth/reauthenticate')
    expect(await request.json()).toEqual({ password: 'correct-horse' })
  })

  it("shows the server's own reason when the password is wrong, and stays put", async () => {
    const wrong = {
      status: 400,
      errors: [{ code: 'incorrect_password', param: 'password', message: 'Incorrect password.' }],
    }
    globalThis.fetch = vi.fn(async () => jsonResponse(400, wrong))
    const user = userEvent.setup()
    render(<ProvePasswordForm next="/profile" />)

    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Incorrect password.')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('shows a refusal that names no field beneath the form', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'too_many', message: 'Slow down.' }] })
    )
    const user = userEvent.setup()
    render(<ProvePasswordForm next="/profile" />)

    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Slow down.')).toBeTruthy()
  })

  it('falls back to its own message when the server gives no reason', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(500, {}))
    const user = userEvent.setup()
    render(<ProvePasswordForm next="/profile" />)

    await user.type(screen.getByLabelText('Password'), 'whatever')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('That password is not right.'))
  })
})
