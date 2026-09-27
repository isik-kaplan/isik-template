import SignupEmailSentPage from '@/app/auth/signup-email-sent/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('SignupEmailSentPage', () => {
  it('renders the title and body', async () => {
    render(await SignupEmailSentPage())

    expect(screen.getByText('Confirm your email')).toBeTruthy()
    expect(screen.getByText("We've sent a confirmation link to your email address.")).toBeTruthy()
  })
})
