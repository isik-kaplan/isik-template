import { AuthorizedApplicationsList } from '@/components/app-auth/AuthorizedApplicationsList'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const ACME = { id: 7, name: 'Acme Notes', scopes: ['email', 'openid'], granted_at: '2026-01-02T03:04:05Z' }
const MANAGE_PEOPLE = { 'users:manage:user': 'Manage people' }
const BETA = { id: 8, name: 'Beta Sync', scopes: ['custom'], granted_at: '2026-02-03T03:04:05Z' }

function rowOf(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

describe('AuthorizedApplicationsList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('says when no application can see the account', () => {
    render(<AuthorizedApplicationsList initialApplications={[]} />)

    expect(screen.getByText('Apps you let in')).toBeTruthy()
    expect(screen.getByText('No app can see your account.')).toBeTruthy()
  })

  it("words a permission an application acts with in the backend's words", () => {
    render(
      <AuthorizedApplicationsList
        initialApplications={[{ ...BETA, scopes: ['openid', 'users:manage:user'] }]}
        described={MANAGE_PEOPLE}
      />
    )

    expect(within(rowOf('Beta Sync')).getByText('Know who you are · Manage people')).toBeTruthy()
  })

  it('lists each application with what it can see and since when', () => {
    render(<AuthorizedApplicationsList initialApplications={[ACME, BETA]} />)

    const acme = rowOf('Acme Notes')
    expect(within(acme).getByText('See your email address · Know who you are')).toBeTruthy()
    const since = new Date(ACME.granted_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    expect(within(acme).getByText(`Since ${since}`)).toBeTruthy()
    expect(within(rowOf('Beta Sync')).getByText('custom')).toBeTruthy()
  })

  it('shuts one application out, leaving the others', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock
    render(<AuthorizedApplicationsList initialApplications={[ACME, BETA]} />)

    await userEvent.click(within(rowOf('Acme Notes')).getByRole('button', { name: 'Remove access' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('DELETE')
    expect(new URL(request.url).pathname).toBe('/v0/authorized-applications/7/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(screen.queryByText('Acme Notes')).toBeNull()
    expect(screen.getByText('Beta Sync')).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Access removed.')
  })

  it('tries a failed revoke again under the same key, so a lost answer is not acted on twice', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 500 }))
    globalThis.fetch = fetchMock
    render(<AuthorizedApplicationsList initialApplications={[ACME, BETA]} />)

    await userEvent.click(within(rowOf('Acme Notes')).getByRole('button', { name: 'Remove access' }))
    await userEvent.click(within(rowOf('Acme Notes')).getByRole('button', { name: 'Remove access' }))
    await userEvent.click(within(rowOf('Beta Sync')).getByRole('button', { name: 'Remove access' }))

    const [first, again, other] = fetchMock.mock.calls.map((call) =>
      (call as unknown as [Request])[0].headers.get('Idempotency-Key')
    )
    expect(again).toBe(first)
    expect(other).not.toBe(first)
  })

  it('says why the application could not be shut out, keeping it listed', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: 'Not now.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
    )
    render(<AuthorizedApplicationsList initialApplications={[ACME]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove access' }))

    expect(toast.error).toHaveBeenCalledWith('Not now.')
    expect(screen.getByText('Acme Notes')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Remove access' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('falls back to its own words when the refusal says nothing', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<AuthorizedApplicationsList initialApplications={[ACME]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Remove access' }))

    expect(toast.error).toHaveBeenCalledWith('Could not remove its access.')
  })

  it('holds the button while its own request is out, and only its own', async () => {
    let finish: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve)))
    render(<AuthorizedApplicationsList initialApplications={[ACME, BETA]} />)

    await userEvent.click(within(rowOf('Acme Notes')).getByRole('button', { name: 'Remove access' }))

    expect((within(rowOf('Acme Notes')).getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    expect((within(rowOf('Beta Sync')).getByRole('button') as HTMLButtonElement).disabled).toBe(false)
    finish(new Response(null, { status: 204 }))
  })
})
