import { LoginForm } from '@/components/app-auth/LoginForm'

import { VERIFY_EMAIL_REQUIRED_PATH } from '@/lib/sessionChannel'

import { expectUniqueAccessibleNames } from '@isikk/core/testing'
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

describe('LoginForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    push.mockClear()
    refresh.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows the exact validation message for an empty login identifier', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Enter your username or email.')).toBeTruthy()
    expect(screen.queryByText('Enter your password.')).toBeNull()
  })

  it('shows the exact validation message for an empty password', async () => {
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Enter your password.')).toBeTruthy()
    expect(screen.queryByText('Enter your username or email.')).toBeNull()
  })

  it('starts both fields empty', () => {
    render(<LoginForm />)

    expect((screen.getByLabelText('Username or email') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe('')
  })

  it('defaults redirectTo to the home page when none is given', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/')
  })

  it('logs in with an email identifier and redirects on success', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<LoginForm redirectTo="/dashboard" />)

    await user.type(screen.getByLabelText('Username or email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/dashboard')
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Log in' })).toHaveProperty('disabled', true)
    expect(refresh).toHaveBeenCalled()
  })

  it('sends a plain identifier as `username`', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const [request] = calls[calls.length - 1]
    expect(await (request as Request).json()).toEqual({ username: 'jane', password: 'secret123' })
  })

  it('sends an email-shaped identifier as `email`, not `username`', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane@example.com')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls
    const [request] = calls[calls.length - 1]
    expect(await (request as Request).json()).toEqual({ email: 'jane@example.com', password: 'secret123' })
  })

  it('shows a server error message on invalid credentials', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'invalid_credentials', message: 'Invalid credentials.' }] })
    )
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Invalid credentials.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('redirects on a 409, since it means the visitor was already logged in', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(409, { status: 409 }))
    const user = userEvent.setup()
    render(<LoginForm redirectTo="/dashboard" />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/dashboard')
    expect(refresh).toHaveBeenCalled()
  })

  it('names every control uniquely', () => {
    render(<LoginForm />)

    expectUniqueAccessibleNames()
  })

  it('sends a right password for an unconfirmed address to the confirm-first page, not an error', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, {
        status: 401,
        data: { flows: [{ id: 'login' }, { id: 'verify_email', is_pending: true }] },
        meta: { is_authenticated: false },
      })
    )
    const user = userEvent.setup()
    render(<LoginForm redirectTo="/dashboard" />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith(VERIFY_EMAIL_REQUIRED_PATH)
    expect(push).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByText('Could not log you in.')).toBeNull()
  })

  it('still reports a 401 with no pending verify_email flow as a failure', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, {
        status: 401,
        data: { flows: [{ id: 'verify_email', is_pending: false }] },
        meta: { is_authenticated: false },
      })
    )
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not log you in.'))
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to a generic error message when the response has no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not log you in.'))
  })

  it('sends a right password with a factor still owed on to the two-factor step, keeping "next"', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, {
        status: 401,
        data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }] },
        meta: { is_authenticated: false },
      })
    )
    const user = userEvent.setup()
    render(<LoginForm redirectTo="/a b" />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'secret123')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(push).toHaveBeenCalledWith('/auth/two-factor?next=%2Fa%20b')
    expect(push).toHaveBeenCalledTimes(1)
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.queryByText('Could not log you in.')).toBeNull()
  })
})
