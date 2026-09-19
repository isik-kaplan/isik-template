import { ConnectionsList } from '@/components/app-auth/ConnectionsList'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Cookies from 'js-cookie'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const providers = vi.hoisted(() => [
  { id: 'google', name: 'Google', icon: '' },
  { id: 'github', name: 'Github', icon: '' },
])
const replace = vi.hoisted(() => vi.fn())

vi.mock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: providers }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('next/navigation', () => ({ usePathname: () => '/profile/connections', useRouter: () => ({ replace }) }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const googleConnection = {
  id: 1,
  provider: { id: 'google', name: 'Google' },
  uid: 'uid-1',
  display: { name: 'jane@gmail.com' },
}

describe('ConnectionsList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    // The connect flow appends a real hidden form to document.body outside React's tree (see
    // AutoFormButton) - render()'s own cleanup never touches it.
    document.querySelectorAll('form').forEach((form) => form.remove())
  })

  it('renders one row per configured provider, connected or not', () => {
    render(
      <ConnectionsList
        initialProviders={[googleConnection]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    const [googleRow, githubRow] = screen.getAllByRole('listitem')
    expect(within(googleRow).getByText('Connected')).toBeTruthy()
    expect(within(googleRow).getByRole('button', { name: 'Disconnect' })).toBeTruthy()
    expect(googleRow.querySelector('svg')).toBeTruthy()
    // The two badge variants map to disjoint class sets (see badge.tsx) - checking the actual
    // class distinguishes a real "outline" from a "default" mutated to match, not just the text.
    expect(within(googleRow).getByText('Connected').className).toContain('bg-primary')
    expect(within(githubRow).getByText('Not connected')).toBeTruthy()
    expect(within(githubRow).getByText('Not connected').className).toContain('border-border')
    expect(within(githubRow).getByRole('button', { name: 'Connect' })).toBeTruthy()
  })

  it('submits the connect form with the provider, callback URL, and process fields', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    Cookies.set('csrftoken', 'abc123')
    const user = userEvent.setup()
    render(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    const [googleRow] = screen.getAllByRole('listitem')
    await user.click(within(googleRow).getByRole('button', { name: 'Connect' }))

    const form = document.querySelector('form') as HTMLFormElement
    expect((form.elements.namedItem('provider') as HTMLInputElement).value).toBe('google')
    expect((form.elements.namedItem('callback_url') as HTMLInputElement).value).toBe(
      'https://example.test/profile/connections'
    )
    expect((form.elements.namedItem('process') as HTMLInputElement).value).toBe('connect')
    Cookies.remove('csrftoken')
  })

  it('disconnects a connected provider and updates the list from the response', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, data: [] }))
    const user = userEvent.setup()
    render(
      <ConnectionsList
        initialProviders={[googleConnection]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    const [googleRow] = screen.getAllByRole('listitem')
    await user.click(within(googleRow).getByRole('button', { name: 'Disconnect' }))

    expect(toast.success).toHaveBeenCalledWith('Account disconnected.')
    expect(within(googleRow).getByText('Not connected')).toBeTruthy()
  })

  it('shows a toast error when disconnecting fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, {
        status: 400,
        errors: [{ code: 'cannot', message: 'Cannot disconnect your only login method.' }],
      })
    )
    const user = userEvent.setup()
    render(
      <ConnectionsList
        initialProviders={[googleConnection]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    const [googleRow] = screen.getAllByRole('listitem')
    await user.click(within(googleRow).getByRole('button', { name: 'Disconnect' }))

    expect(toast.error).toHaveBeenCalledWith('Cannot disconnect your only login method.')
  })

  it('falls back to a generic error message when disconnecting fails with no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(
      <ConnectionsList
        initialProviders={[googleConnection]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    const [googleRow] = screen.getAllByRole('listitem')
    await user.click(within(googleRow).getByRole('button', { name: 'Disconnect' }))

    expect(toast.error).toHaveBeenCalledWith('Could not disconnect account.')
  })

  it('falls back to a generic error message when the errors array is empty', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400, errors: [] }))
    const user = userEvent.setup()
    render(
      <ConnectionsList
        initialProviders={[googleConnection]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    const [googleRow] = screen.getAllByRole('listitem')
    await user.click(within(googleRow).getByRole('button', { name: 'Disconnect' }))

    expect(toast.error).toHaveBeenCalledWith('Could not disconnect account.')
  })
})

describe('ConnectionsList connect-flow errors', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    ['cancelled', 'Connection canceled.'],
    ['connected_other', 'That account is already connected to a different user.'],
    ['reauthentication_required', 'Log in again to connect a new account.'],
    ['permission_denied', 'Log in to connect an account.'],
    ['unknown', 'Could not connect that account. Try again.'],
  ])('shows an inline error for connectError=%s and clears it from the URL', (connectError, message) => {
    render(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
        connectError={connectError}
      />
    )

    expect(screen.getByText(message)).toBeTruthy()
    expect(replace).toHaveBeenCalledWith('/profile/connections')
  })

  it('keeps showing the error message even after the URL is cleared', () => {
    const { rerender } = render(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
        connectError="cancelled"
      />
    )
    expect(screen.getByText('Connection canceled.')).toBeTruthy()

    // Simulates the re-render page.tsx triggers once router.replace() drops `error` from the URL.
    rerender(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )
    expect(screen.getByText('Connection canceled.')).toBeTruthy()
  })

  it('shows no error message and does not touch the URL when there is no connectError', () => {
    const { container } = render(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    // Not just "the default message is absent" - no error paragraph renders at all, ruling out
    // both a wrong fallback case and the LogicalOperator flip that always renders an empty one.
    expect(container.querySelector('.text-destructive')).toBeNull()
    expect(replace).not.toHaveBeenCalled()
  })

  it('re-runs the URL-clearing effect when a new connectError prop arrives after mount', () => {
    const { rerender } = render(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )
    expect(replace).not.toHaveBeenCalled()

    rerender(
      <ConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
        connectError="cancelled"
      />
    )

    expect(replace).toHaveBeenCalledWith('/profile/connections')
  })
})

describe('ConnectionsList with no providers configured', () => {
  it('shows an empty-state message instead of a list', async () => {
    vi.resetModules()
    vi.doMock('@/lib/socialProviders', () => ({ SOCIAL_PROVIDERS: [] }))
    const { ConnectionsList: EmptyConnectionsList } = await import('@/components/app-auth/ConnectionsList')

    render(
      <EmptyConnectionsList
        initialProviders={[]}
        connectAction="https://auth.example.test/v0/browser/v1/auth/provider/redirect"
        callbackUrl="https://example.test/profile/connections"
      />
    )

    expect(screen.getByText('No social providers are configured.')).toBeTruthy()
  })
})
