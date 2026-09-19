import { SocialLoginButtons } from '@/components/app-auth/SocialLoginButtons'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Cookies from 'js-cookie'
import { afterEach, describe, expect, it, vi } from 'vitest'

const providers = vi.hoisted(() => [
  { id: 'google', name: 'Google', icon: '' },
  { id: 'github', name: 'Github', icon: '' },
  { id: 'okta', name: 'Okta', icon: 'https://example.test/okta.svg' },
])

vi.mock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: providers }))

const action = 'https://auth.example.test/v0/browser/v1/auth/provider/redirect'
const callbackUrl = 'https://example.test/auth/callback-complete?next=%2F'

describe('SocialLoginButtons', () => {
  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('submits the login form with the provider, callback URL, and process fields', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    Cookies.set('csrftoken', 'abc123')
    const user = userEvent.setup()
    render(<SocialLoginButtons action={action} callbackUrl={callbackUrl} />)

    await user.click(screen.getByRole('button', { name: 'Continue with Google' }))

    const form = document.querySelector('form') as HTMLFormElement
    expect((form.elements.namedItem('provider') as HTMLInputElement).value).toBe('google')
    expect((form.elements.namedItem('callback_url') as HTMLInputElement).value).toBe(callbackUrl)
    expect((form.elements.namedItem('process') as HTMLInputElement).value).toBe('login')
    Cookies.remove('csrftoken')
  })

  it('renders one button per configured provider, labelled "Continue with <name>"', () => {
    render(<SocialLoginButtons action={action} callbackUrl={callbackUrl} />)

    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Continue with Github' })).toBeTruthy()
  })

  it("shows each provider's icon - bundled brand icon or configured iconUrl", () => {
    render(<SocialLoginButtons action={action} callbackUrl={callbackUrl} />)

    const googleButton = screen.getByRole('button', { name: 'Continue with Google' })
    expect(googleButton.querySelector('svg')).toBeTruthy()

    const oktaButton = screen.getByRole('button', { name: 'Continue with Okta' })
    expect(oktaButton.querySelector('img')?.getAttribute('src')).toBe('https://example.test/okta.svg')
  })
})

describe('SocialLoginButtons with no providers configured', () => {
  it('renders nothing', async () => {
    vi.resetModules()
    vi.doMock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: [] }))
    const { SocialLoginButtons: EmptySocialLoginButtons } = await import('@/components/app-auth/SocialLoginButtons')

    const { container } = render(<EmptySocialLoginButtons action={action} callbackUrl={callbackUrl} />)

    expect(container.firstChild).toBeNull()
  })
})
