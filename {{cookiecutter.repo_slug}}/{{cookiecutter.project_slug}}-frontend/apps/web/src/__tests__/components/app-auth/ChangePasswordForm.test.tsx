import { ChangePasswordForm } from '@/components/app-auth/ChangePasswordForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('ChangePasswordForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts both fields empty', () => {
    render(<ChangePasswordForm />)

    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('')
  })

  it('shows the exact validation message for an empty current password', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Enter your password.')).toBeTruthy()
    expect(screen.queryByText('Use at least 8 characters.')).toBeNull()
  })

  it('shows the exact validation message for a too-short new password', async () => {
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Use at least 8 characters.')).toBeTruthy()
    expect(screen.queryByText('Enter your password.')).toBeNull()
  })

  it('shows a success toast and clears the form on success', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200 }))
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText('Current password'), 'old-password')
    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(toast.success).toHaveBeenCalledWith('Password changed.')
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe('')
  })

  it('shows a server error message when the current password is wrong, and no new-password error', async () => {
    // param: 'current_password' - matches allauth's own field name (and this form's state key); a
    // mock without it would silently mask a future regression back to a mismatched key.
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [{ code: 'enter_current_password', param: 'current_password', message: 'Wrong password.' }],
      })
    )
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText('Current password'), 'wrong')
    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Wrong password.')).toBeTruthy()
    expect(toast.success).not.toHaveBeenCalled()
    const newPasswordGroup = screen.getByLabelText('New password').closest('div') as HTMLElement
    expect(newPasswordGroup.querySelector('.text-destructive')).toBeNull()
  })

  it('falls back to a generic error message when the response has no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<ChangePasswordForm />)

    await user.type(screen.getByLabelText('Current password'), 'wrong')
    await user.type(screen.getByLabelText('New password'), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Could not change your password.')).toBeTruthy()
  })
})
