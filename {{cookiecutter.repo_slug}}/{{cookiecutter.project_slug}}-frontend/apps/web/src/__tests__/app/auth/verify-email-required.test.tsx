import VerifyEmailRequiredPage from '@/app/auth/verify-email-required/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('VerifyEmailRequiredPage', () => {
  it('says a fresh link is on its way and leads back to login', async () => {
    render(await VerifyEmailRequiredPage())

    expect(screen.getByText('Confirm your email address first')).toBeTruthy()
    expect(
      screen.getByText(
        "Your email address isn't confirmed yet. We've sent you a fresh confirmation link - open it, then log in again."
      )
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to login' }).getAttribute('href')).toBe('/auth/login')
  })
})
