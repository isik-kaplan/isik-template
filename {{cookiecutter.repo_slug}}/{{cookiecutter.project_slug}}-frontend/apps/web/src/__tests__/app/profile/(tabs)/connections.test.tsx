import ProfileConnectionsPage from '@/app/profile/(tabs)/connections/page'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const provider = { id: 'github', name: 'Github', icon: '' }
const configured = vi.hoisted(() => ({ providers: [] as { id: string; name: string; icon: string }[] }))
vi.mock('@/lib/socialProviders', () => ({ socialProviders: () => configured.providers }))

const providers = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({
  AuthApi,
  PROVIDER_REDIRECT_PATH: '/v0/browser/v1/auth/provider/redirect',
  SESSION_PATH: '/v0/browser/v1/auth/session',
}))
AuthApi.mockImplementation(() => ({ providers }))
let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => {
    const init: Record<string, string> = { host: '{{ cookiecutter.repo_slug }}.test' }
    if (cookieHeader !== undefined) init.cookie = cookieHeader
    return new Headers(init)
  },
}))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: '{{ cookiecutter.repo_slug }}.test' } }))
const replace = vi.hoisted(() => vi.fn())
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/profile/connections',
}))

const AUTH_ORIGIN = 'http://auth.{{ cookiecutter.repo_slug }}.test'
const connected = { id: 1, provider: { id: provider.id, name: provider.name }, uid: '123', display: { name: 'Jane' } }

describe('ProfileConnectionsPage', () => {
  beforeEach(() => {
    configured.providers = [provider]
  })

  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('renders the connected providers', async () => {
    providers.mockResolvedValue({ data: { data: [connected] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText(provider.name)).toBeTruthy()
  })

  it('says no provider is configured when the deployment has none', async () => {
    configured.providers = []
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('No social providers are configured.')).toBeTruthy()
  })

  it('still says so when the backend returns no data', async () => {
    configured.providers = []
    providers.mockResolvedValue({ data: undefined })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('No social providers are configured.')).toBeTruthy()
  })

  it('still clears a repeated error param off the address', async () => {
    configured.providers = []
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({ error: ['cancelled', 'other'] }) }))

    expect(replace).toHaveBeenCalledWith('/profile/connections')
  })

  it('renders no error message when there is none', async () => {
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.queryByText('Could not connect that account. Try again.')).toBeNull()
  })

  it('renders an empty list when the backend returns no data', async () => {
    providers.mockResolvedValue({ data: undefined })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText(provider.name)).toBeTruthy()
  })

  it('takes the first value when the error param repeats', async () => {
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({ error: ['cancelled', 'other'] }) }))

    expect(screen.getByText('Connection canceled.')).toBeTruthy()
  })

  it('builds the AuthApi client from the request origin, forwarding the incoming cookie header', async () => {
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(AuthApi).toHaveBeenCalledWith(AUTH_ORIGIN, {
      cookieHeader: 'sessionid=abc123',
      baseFetch: expect.any(Function),
    })
  })

  it('defaults cookieHeader to undefined when the request carries no cookie', async () => {
    providers.mockResolvedValue({ data: { data: [] } })
    cookieHeader = undefined

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(AuthApi).toHaveBeenCalledWith(AUTH_ORIGIN, {
      cookieHeader: undefined,
      baseFetch: expect.any(Function),
    })
    cookieHeader = 'sessionid=abc123'
  })

  it('builds the connect action and callback URL from the request origin', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    providers.mockResolvedValue({ data: { data: [] } })
    const user = userEvent.setup()
    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    const row = screen.getByText(provider.name).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Connect' }))

    const form = document.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe(`${AUTH_ORIGIN}/v0/browser/v1/auth/provider/redirect`)
    expect((form.elements.namedItem('callback_url') as HTMLInputElement).value).toBe(
      'http://{{ cookiecutter.repo_slug }}.test/profile/connections'
    )
  })
})
