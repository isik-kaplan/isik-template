import { SessionsList } from '@/components/app-auth/SessionsList'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Cookies from 'js-cookie'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const CHROME_ON_MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const currentSession = {
  id: 1,
  ip: '127.0.0.1',
  is_current: true,
  user_agent: CHROME_ON_MAC_UA,
  created_at: 1700000000,
}
const otherSession = { id: 2, ip: '10.0.0.1', is_current: false, user_agent: '', created_at: 1700000000 }

describe('SessionsList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('renders every session, marking the current one, parsing its user agent, and falling back for a blank one', () => {
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    const [firstRow, secondRow] = screen.getAllByRole('listitem')
    expect(within(firstRow).getByText('Chrome on macOS')).toBeTruthy()
    expect(within(firstRow).getByText('This device')).toBeTruthy()
    expect(within(secondRow).getByText('Unknown device')).toBeTruthy()
    expect(within(secondRow).queryByText('This device')).toBeNull()
  })

  it('titles the device name with the raw user agent string, when there is one', () => {
    render(<SessionsList initialSessions={[currentSession]} />)

    expect(screen.getByText('Chrome on macOS').getAttribute('title')).toBe(CHROME_ON_MAC_UA)
  })

  it('omits the title attribute entirely for a blank user agent', () => {
    render(<SessionsList initialSessions={[otherSession]} />)

    expect(screen.getByText('Unknown device').hasAttribute('title')).toBe(false)
  })

  it('shows the IP and exact date for each session', () => {
    render(<SessionsList initialSessions={[currentSession]} />)

    expect(screen.getByText(/127\.0\.0\.1/)).toBeTruthy()
    // created_at is Unix seconds - multiplied by 1000 for Date's milliseconds, this lands on
    // Nov 14, 2023; dividing instead would land in 1970, and dropping the day/month/year format
    // options would print a locale-default (numeric month/day) string instead.
    expect(screen.getByText(/Nov 14, 2023/)).toBeTruthy()
  })

  it('hides the "sign out other devices" button when this is the only session', () => {
    render(<SessionsList initialSessions={[currentSession]} />)

    expect(screen.queryByRole('button', { name: /other device/ })).toBeNull()
  })

  it('shows a count-aware "sign out other devices" button when other sessions exist', () => {
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    expect(screen.getByRole('button', { name: 'Sign out 1 other device' })).toBeTruthy()
  })

  it('revokes only the clicked session, showing a pending state and refreshing the router on success', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, data: [currentSession] }))
    const user = userEvent.setup()
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    const [, secondRow] = screen.getAllByRole('listitem')
    await user.click(within(secondRow).getByRole('button', { name: 'Sign out' }))

    expect(toast.success).toHaveBeenCalledWith('Signed out of that device.')
    expect(refresh).toHaveBeenCalled()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    const [request] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [Request]
    expect(await (request as Request).json()).toEqual({ sessions: [otherSession.id] })
  })

  it('shows a pending, disabled state on the row being revoked and disables the others-button too', async () => {
    Cookies.set('csrftoken', 'abc123')
    let resolveFetch: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (resolveFetch = resolve)))
    const user = userEvent.setup()
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    const [, secondRow] = screen.getAllByRole('listitem')
    await user.click(within(secondRow).getByRole('button', { name: 'Sign out' }))

    expect((within(secondRow).getByRole('button', { name: 'Signing out…' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Sign out 1 other device' }) as HTMLButtonElement).disabled).toBe(true)

    resolveFetch(jsonResponse(200, { status: 200, data: [currentSession] }))
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalled())
    Cookies.remove('csrftoken')
  })

  it('revokes every other session at once', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(200, { status: 200, data: [currentSession] }))
    const user = userEvent.setup()
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    await user.click(screen.getByRole('button', { name: 'Sign out 1 other device' }))

    expect(toast.success).toHaveBeenCalledWith('Signed out of all other devices.')
    const [request] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1) as [Request]
    expect(await (request as Request).json()).toEqual({ sessions: [otherSession.id] })
  })

  it('shows a toast error when revoking fails', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { status: 400, errors: [{ code: 'not_found', message: 'That session no longer exists.' }] })
    )
    const user = userEvent.setup()
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    const [, secondRow] = screen.getAllByRole('listitem')
    await user.click(within(secondRow).getByRole('button', { name: 'Sign out' }))

    expect(toast.error).toHaveBeenCalledWith('That session no longer exists.')
  })

  it('falls back to a generic error message when revoking fails with an empty errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400, errors: [] }))
    const user = userEvent.setup()
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    const [, secondRow] = screen.getAllByRole('listitem')
    await user.click(within(secondRow).getByRole('button', { name: 'Sign out' }))

    expect(toast.error).toHaveBeenCalledWith('Unable to sign out of that device.')
  })

  it('falls back to a generic error message when revoking fails with no errors array', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { status: 400 }))
    const user = userEvent.setup()
    render(<SessionsList initialSessions={[currentSession, otherSession]} />)

    const [, secondRow] = screen.getAllByRole('listitem')
    await user.click(within(secondRow).getByRole('button', { name: 'Sign out' }))

    expect(toast.error).toHaveBeenCalledWith('Unable to sign out of that device.')
  })
})
