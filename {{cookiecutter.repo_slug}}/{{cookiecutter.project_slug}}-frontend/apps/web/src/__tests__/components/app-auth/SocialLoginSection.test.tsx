import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const providers = vi.hoisted(() => [{ id: 'google', name: 'Google', icon: '' }])

vi.mock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: providers }))

const action = 'https://auth.example.test/v0/browser/v1/auth/provider/redirect'
const callbackUrl = 'https://example.test/auth/callback-complete?next=%2F'

describe('SocialLoginSection', () => {
  it('renders the divider alongside the provider buttons when providers are configured', () => {
    render(<SocialLoginSection action={action} callbackUrl={callbackUrl} dividerText="or" />)

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.getByText('or')).toBeTruthy()
  })
})

describe('SocialLoginSection with no providers configured', () => {
  it('renders neither buttons nor a bare divider', async () => {
    vi.resetModules()
    vi.doMock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: [] }))
    const { SocialLoginSection: EmptySocialLoginSection } = await import('@/components/app-auth/SocialLoginSection')

    const { container } = render(<EmptySocialLoginSection action={action} callbackUrl={callbackUrl} dividerText="or" />)

    expect(container.firstChild).toBeNull()
  })
})
