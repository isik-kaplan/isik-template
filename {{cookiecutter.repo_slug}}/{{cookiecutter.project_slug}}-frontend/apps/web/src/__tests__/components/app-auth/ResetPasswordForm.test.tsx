import { ResetPasswordForm } from '@/components/app-auth/ResetPasswordForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ResetPasswordForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    push.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows a validation error when submitted empty', async () => {
    const user = userEvent.setup()
    render(<ResetPasswordForm resetKey="abc:def" />)

    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('redirects home on a 200 (reset also completed a pending login)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(200, { status: 200, data: { user: {} }, meta: { is_authenticated: true } })
    )
    const user = userEvent.setup()
    render(<ResetPasswordForm resetKey="abc:def" />)

    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(push).toHaveBeenCalledWith('/')
  })

  it('redirects to login on a 401 with no errors array (valid key, separate login required)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } })
    )
    const user = userEvent.setup()
    render(<ResetPasswordForm resetKey="abc:def" />)

    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(push).toHaveBeenCalledWith('/auth/login')
  })

  it('shows an error message on an actually invalid/expired key', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'invalid_key', message: 'That key has expired.' }] })
    )
    const user = userEvent.setup()
    render(<ResetPasswordForm resetKey="abc:def" />)

    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Set new password' }))

    expect(await screen.findByText('That key has expired.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })
})
