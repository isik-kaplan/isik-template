import PasswordResetEmailSentPage from '@/app/auth/password-reset-email-sent/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
const passwords = vi.hoisted(() => ({ signIn: true }))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => passwords.signIn }))

describe('PasswordResetEmailSentPage', () => {
  it('renders the title and body', async () => {
    render(await PasswordResetEmailSentPage())

    expect(screen.getByText('Check your inbox')).toBeTruthy()
    expect(
      screen.getByText("If an account exists for that address, we've sent a link to reset your password.")
    ).toBeTruthy()
  })

  it('is not found when nobody signs in with a password', async () => {
    passwords.signIn = false

    await expect(PasswordResetEmailSentPage()).rejects.toThrow('not found')

    passwords.signIn = true
  })
})
