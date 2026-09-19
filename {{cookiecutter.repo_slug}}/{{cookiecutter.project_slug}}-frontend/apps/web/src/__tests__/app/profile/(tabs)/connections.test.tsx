import ProfileConnectionsPage from '@/app/profile/(tabs)/connections/page'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/profile/connections',
}))

describe('ProfileConnectionsPage', () => {
  afterEach(() => {
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('renders the connected providers', async () => {
    providers.mockResolvedValue({
      data: { data: [{ id: 1, provider: { id: 'google', name: 'Google' }, uid: '123', display: { name: 'Jane' } }] },
    })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Google')).toBeTruthy()
  })

  it('renders no error message when there is none', async () => {
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.queryByText('Could not connect that account. Try again.')).toBeNull()
  })

  it('renders an empty list when the backend returns no data', async () => {
    providers.mockResolvedValue({ data: undefined })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(screen.getByText('Google')).toBeTruthy()
  })

  it('takes the first value when the error param repeats', async () => {
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({ error: ['cancelled', 'other'] }) }))

    expect(screen.getByText('Connection canceled.')).toBeTruthy()
  })

  it('builds the AuthApi client from the request origin, forwarding the incoming cookie header', async () => {
    providers.mockResolvedValue({ data: { data: [] } })

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: 'sessionid=abc123' })
  })

  it('defaults cookieHeader to undefined when the request carries no cookie', async () => {
    providers.mockResolvedValue({ data: { data: [] } })
    cookieHeader = undefined

    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: undefined })
    cookieHeader = 'sessionid=abc123'
  })

  it('builds the connect action and callback URL from the request origin', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    providers.mockResolvedValue({
      data: { data: [{ id: 1, provider: { id: 'google', name: 'Google' }, uid: '123', display: { name: 'Jane' } }] },
    })
    const user = userEvent.setup()
    render(await ProfileConnectionsPage({ searchParams: Promise.resolve({}) }))

    const githubRow = screen.getByText('Github').closest('li') as HTMLElement
    await user.click(within(githubRow).getByRole('button', { name: 'Connect' }))

    const form = document.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe('http://auth.test-project.test/v0/browser/v1/auth/provider/redirect')
    expect((form.elements.namedItem('callback_url') as HTMLInputElement).value).toBe(
      'http://test-project.test/profile/connections'
    )
  })
})
