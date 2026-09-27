import VerifyEmailDeclinedPage from '@/app/auth/verify-email-declined/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))

describe('VerifyEmailDeclinedPage', () => {
  it('renders the title and body', async () => {
    render(await VerifyEmailDeclinedPage())

    expect(screen.getByText('Verification declined')).toBeTruthy()
    expect(screen.getByText('That email address was not confirmed.')).toBeTruthy()
  })
})
