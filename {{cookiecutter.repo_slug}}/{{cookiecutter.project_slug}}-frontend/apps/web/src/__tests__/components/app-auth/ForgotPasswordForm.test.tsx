import { ForgotPasswordForm } from '@/components/app-auth/ForgotPasswordForm'

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

describe('ForgotPasswordForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    push.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('shows a validation error when submitted empty', async () => {
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(await screen.findByText('Enter a valid email address.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('always redirects to the confirmation page, regardless of whether the account exists', async () => {
    // Catches a real regression, not just this test's own assertions: an input whose initial
    // value is undefined rather than '' starts uncontrolled and switches to controlled the
    // moment something is typed into it, which React warns loudly about.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // allauth intentionally never reveals whether the address is registered.
    globalThis.fetch = vi.fn(async () => jsonResponse(200, {}))
    const user = userEvent.setup()
    render(<ForgotPasswordForm />)

    await user.type(screen.getByLabelText('Email'), 'someone@example.com')
    await user.click(screen.getByRole('button', { name: 'Send reset link' }))

    expect(push).toHaveBeenCalledWith('/auth/password-reset-email-sent')
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
