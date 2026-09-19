import ForgotPasswordPage from '@/app/auth/forgot-password/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

describe('ForgotPasswordPage', () => {
  it('renders the title, description and form', async () => {
    render(await ForgotPasswordPage())

    expect(screen.getByText('Forgot your password?')).toBeTruthy()
    expect(screen.getByText("We'll email you a link to reset it.")).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })
})
