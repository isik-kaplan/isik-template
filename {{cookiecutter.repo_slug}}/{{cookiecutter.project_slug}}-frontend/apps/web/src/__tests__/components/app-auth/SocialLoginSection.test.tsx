import { SocialLoginSection } from '@/components/app-auth/SocialLoginSection'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const providers = vi.hoisted(() => [{ id: 'google', name: 'Google', icon: '' }])

const signInProviders = vi.hoisted(() => vi.fn((_admin: boolean) => providers))
vi.mock('@/lib/socialProviders', () => ({ signInProviders }))

const action = 'https://auth.example.test/v0/browser/auth/provider/redirect'
const callbackUrl = 'https://example.test/auth/callback-complete?next=%2F'

describe('SocialLoginSection', () => {
  it('renders the divider alongside the provider buttons when providers are configured', () => {
    render(<SocialLoginSection action={action} callbackUrl={callbackUrl} dividerText="or" />)

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.getByText('or')).toBeTruthy()
  })

  it('renders the buttons without a divider when nothing follows them', () => {
    const { container } = render(<SocialLoginSection action={action} callbackUrl={callbackUrl} />)

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(container.querySelector('[data-slot="separator"]')).toBeNull()
    expect(signInProviders).toHaveBeenLastCalledWith(false)
  })

  it("asks for the admin's providers on the admin's page", () => {
    signInProviders.mockClear()
    render(<SocialLoginSection action={action} callbackUrl={callbackUrl} admin />)

    expect(signInProviders.mock.calls.every(([admin]) => admin)).toBe(true)
  })
})

describe('SocialLoginSection with no providers configured', () => {
  it('renders neither buttons nor a bare divider', async () => {
    vi.resetModules()
    vi.doMock('@/lib/socialProviders', () => ({ signInProviders: () => [] }))
    const { SocialLoginSection: EmptySocialLoginSection } = await import('@/components/app-auth/SocialLoginSection')

    const { container } = render(<EmptySocialLoginSection action={action} callbackUrl={callbackUrl} dividerText="or" />)

    expect(container.firstChild).toBeNull()
  })
})
