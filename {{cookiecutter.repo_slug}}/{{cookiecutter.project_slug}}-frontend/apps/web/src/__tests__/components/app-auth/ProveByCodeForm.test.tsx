import { ProveByCodeForm } from '@/components/app-auth/ProveByCodeForm'

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

async function bodyOf(call: number) {
  const [request] = vi.mocked(globalThis.fetch).mock.calls[call] as [Request]
  return { url: request.url, body: await request.json() }
}

const recipients = [{ email: 'alice@example.test' }, { phone: '+14155550100' }]

describe('ProveByCodeForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'csrftoken=token'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends the code where it was asked for, then takes it and goes back to where they were', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(200, { status: 200, data: { user: {} }, meta: {} }))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile/emails" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to +14155550100' }))
    expect(await screen.findByText('We sent a code to +14155550100. Enter it below.')).toBeTruthy()
    await user.type(screen.getByLabelText('Code'), ' BCDF-GHJK ')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/profile/emails'))
    expect(await bodyOf(0)).toEqual({
      url: expect.stringContaining('/v0/browser/auth/reauthenticate/code/request'),
      body: { phone: '+14155550100' },
    })
    expect(await bodyOf(1)).toEqual({
      url: expect.stringContaining('/v0/browser/auth/reauthenticate/code/confirm'),
      body: { code: 'BCDF-GHJK' },
    })
  })

  it('sends to an address by its address', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200 }))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to alice@example.test' }))

    expect(await screen.findByText('We sent a code to alice@example.test. Enter it below.')).toBeTruthy()
    expect((await bodyOf(0)).body).toEqual({ email: 'alice@example.test' })
  })

  it('stays on the choice and says so when the code could not be sent', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(429, { status: 429 }))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to alice@example.test' }))

    expect(await screen.findByText('We could not send a code. Wait a moment and try again.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send a code to alice@example.test' })).toHaveProperty('disabled', false)
    expect(screen.queryByLabelText('Code')).toBeNull()
  })

  it('asks for the code before sending it', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200 }))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to alice@example.test' }))
    await user.click(await screen.findByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Enter the code we sent you.')).toBeTruthy()
    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
  })

  it("shows the server's reason for a wrong code, and stays put", async () => {
    const wrong = { status: 400, errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }] }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(400, wrong))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to alice@example.test' }))
    await user.type(await screen.findByLabelText('Code'), 'WRONG')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Incorrect code.')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('shows a refusal that names no field beneath the form', async () => {
    const refused = { status: 400, errors: [{ code: 'too_many_attempts', message: 'Too many attempts.' }] }
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(400, refused))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to alice@example.test' }))
    await user.type(await screen.findByLabelText('Code'), 'BCDF-GHJK')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Too many attempts.')).toBeTruthy()
    expect(replace).not.toHaveBeenCalled()
  })

  it('falls back to its own message when the server gives no reason', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { status: 200 }))
      .mockResolvedValueOnce(jsonResponse(409, {}))
    const user = userEvent.setup()
    render(<ProveByCodeForm recipients={recipients} next="/profile" />)

    await user.click(screen.getByRole('button', { name: 'Send a code to alice@example.test' }))
    await user.type(await screen.findByLabelText('Code'), 'BCDF-GHJK')
    await user.click(screen.getByRole('button', { name: 'Confirm' }))

    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('That code is not right, or it expired. Ask for a new one.')
    )
  })
})
