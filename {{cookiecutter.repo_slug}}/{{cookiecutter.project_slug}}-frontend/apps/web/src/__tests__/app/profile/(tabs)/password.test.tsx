import ProfilePasswordPage from '@/app/profile/(tabs)/password/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not found')
  },
}))
const passwords = vi.hoisted(() => ({ signIn: true }))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => passwords.signIn }))

describe('ProfilePasswordPage', () => {
  it('renders the change-password form', () => {
    render(<ProfilePasswordPage />)

    expect(screen.getByLabelText('Current password')).toBeTruthy()
    expect(screen.getByLabelText('New password')).toBeTruthy()
  })

  it('is not found when nobody signs in with a password', () => {
    passwords.signIn = false

    expect(() => ProfilePasswordPage()).toThrow('not found')

    passwords.signIn = true
  })
})
