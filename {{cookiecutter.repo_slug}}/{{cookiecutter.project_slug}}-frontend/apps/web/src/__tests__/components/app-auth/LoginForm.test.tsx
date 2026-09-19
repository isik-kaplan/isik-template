import { LoginForm } from '@/components/app-auth/LoginForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

  it('falls back to a generic error message when the response has no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username or email'), 'jane')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Could not log you in.')).toBeTruthy()
  })
})
