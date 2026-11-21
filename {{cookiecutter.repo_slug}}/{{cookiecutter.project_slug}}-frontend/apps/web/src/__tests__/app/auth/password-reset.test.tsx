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
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
const passwords = vi.hoisted(() => ({ signIn: true }))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => passwords.signIn }))

describe('PasswordResetPage', () => {
  it('renders the title', async () => {
    render(await PasswordResetPage({ params: Promise.resolve({ key: 'abc123' }) }))

    expect(screen.getByText('Set a new password')).toBeTruthy()
  })

  it('decodes a percent-encoded reset key before handing it to the form', async () => {
    render(await PasswordResetPage({ params: Promise.resolve({ key: 'abc%3Adef' }) }))

    expect(resetKeyProp).toHaveBeenCalledWith('abc:def')
  })

  it('is not found when nobody signs in with a password', async () => {
    passwords.signIn = false

    await expect(PasswordResetPage({ params: Promise.resolve({ key: 'abc123' }) })).rejects.toThrow('not found')

    passwords.signIn = true
  })
})
