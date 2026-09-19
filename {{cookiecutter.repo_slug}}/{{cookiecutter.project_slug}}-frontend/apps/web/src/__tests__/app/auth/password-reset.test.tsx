import PasswordResetPage from '@/app/auth/password-reset/[key]/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const resetKeyProp = vi.fn()
vi.mock('@/components/app-auth/ResetPasswordForm', () => ({
  ResetPasswordForm: ({ resetKey }: { resetKey: string }) => {
    resetKeyProp(resetKey)
    return null
  },
}))

describe('PasswordResetPage', () => {
  it('renders the title', async () => {
    render(await PasswordResetPage({ params: Promise.resolve({ key: 'abc123' }) }))

    expect(screen.getByText('Set a new password')).toBeTruthy()
  })

  it('decodes a percent-encoded reset key before handing it to the form', async () => {
    render(await PasswordResetPage({ params: Promise.resolve({ key: 'abc%3Adef' }) }))

    expect(resetKeyProp).toHaveBeenCalledWith('abc:def')
  })
})
