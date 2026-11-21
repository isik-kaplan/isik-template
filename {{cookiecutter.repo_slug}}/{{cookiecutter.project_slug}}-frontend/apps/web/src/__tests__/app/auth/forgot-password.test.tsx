import ForgotPasswordPage from '@/app/auth/forgot-password/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error('not found')
  },
}))
const passwords = vi.hoisted(() => ({ signIn: true }))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => passwords.signIn }))
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('ForgotPasswordPage', () => {
  it('renders the title, description and form', async () => {
    render(await ForgotPasswordPage())

    expect(screen.getByText('Forgot your password?')).toBeTruthy()
    expect(screen.getByText("We'll email you a link to reset it.")).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('is not found when nobody signs in with a password', async () => {
    passwords.signIn = false

    await expect(ForgotPasswordPage()).rejects.toThrow('not found')

    passwords.signIn = true
  })
})
