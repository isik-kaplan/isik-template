import PasswordResetEmailSentPage from '@/app/auth/password-reset-email-sent/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('PasswordResetEmailSentPage', () => {
  it('renders the title and body', async () => {
    render(await PasswordResetEmailSentPage())

    expect(screen.getByText('Check your inbox')).toBeTruthy()
    expect(
      screen.getByText("If an account exists for that address, we've sent a link to reset your password.")
    ).toBeTruthy()
  })
})
