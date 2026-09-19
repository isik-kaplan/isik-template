import VerifyEmailPage from '@/app/auth/verify-email/[key]/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const verificationKeyProp = vi.fn()
vi.mock('@/components/app-auth/VerifyEmailButton', () => ({
  VerifyEmailButton: ({ verificationKey }: { verificationKey: string }) => {
    verificationKeyProp(verificationKey)
    return null
  },
}))

describe('VerifyEmailPage', () => {
  it('renders the title', async () => {
    render(await VerifyEmailPage({ params: Promise.resolve({ key: 'abc123' }) }))

    expect(screen.getByText('Confirm your email address')).toBeTruthy()
  })

  it('decodes a percent-encoded verification key before handing it to the button', async () => {
    render(await VerifyEmailPage({ params: Promise.resolve({ key: 'abc%3Adef' }) }))

    expect(verificationKeyProp).toHaveBeenCalledWith('abc:def')
  })
})
