import { PersonalAccessTokensList, hasPassed } from '@/components/app-auth/PersonalAccessTokensList'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SCOPES = [{ name: 'users:manage:user', label: 'Manage people' }]
const LATER = '2999-01-02T03:04:05Z'
const EARLIER = '2001-01-02T03:04:05Z'

function token(fields: Record<string, unknown>) {
  return {
    id: 't1',
    name: 'CI',
    scopes: [],
    expires_at: null,
    last_used_at: null,
    token: null,
    created_at: EARLIER,
    updated_at: EARLIER,
    ...fields,
  } as unknown as Parameters<typeof PersonalAccessTokensList>[0]['initialTokens'][number]
}

function day(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function rowOf(name: string) {
  return screen.getByText(name).closest('li') as HTMLElement
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('hasPassed', () => {
  it('is true from the moment itself on', () => {
    expect(hasPassed('1970-01-01T00:00:01Z', 1_000)).toBe(true)
    expect(hasPassed('1970-01-01T00:00:01Z', 1_001)).toBe(true)
    expect(hasPassed('1970-01-01T00:00:01Z', 999)).toBe(false)
  })

  it('reads the clock unless told the time', () => {
    expect(hasPassed(EARLIER)).toBe(true)
    expect(hasPassed(LATER)).toBe(false)
  })
})

describe('PersonalAccessTokensList', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('says what a token is for, and when there are none', () => {
    render(<PersonalAccessTokensList initialTokens={[]} scopes={SCOPES} />)

    expect(screen.getByText('Personal access tokens')).toBeTruthy()
    expect(
      screen.getByText(
        'A token lets a script or a command line call the API as you, with only what you give it. Keep it like a password.'
      )
    ).toBeTruthy()
    expect(screen.getByText('You have no tokens.')).toBeTruthy()
  })

  it('lists each token with what it may do, how long it lasts and when it was last used', () => {
    render(
      <PersonalAccessTokensList
        initialTokens={[
          token({ id: 'a', name: 'Deploys', scopes: ['users:manage:user', 'other:read:x'], expires_at: LATER }),
          token({ id: 'b', name: 'Cron', last_used_at: EARLIER }),
          token({ id: 'c', name: 'Old', expires_at: EARLIER }),
        ]}
        scopes={SCOPES}
      />
    )

    const deploys = rowOf('Deploys')
    expect(within(deploys).getByText('Manage people · other:read:x')).toBeTruthy()
    expect(within(deploys).getByText(`Expires ${day(LATER)} · Never used`)).toBeTruthy()
    const cron = rowOf('Cron')
    expect(within(cron).getByText('Only what needs no permission')).toBeTruthy()
    expect(within(cron).getByText(`Never expires · Last used ${day(EARLIER)}`)).toBeTruthy()
    expect(within(rowOf('Old')).getByText(`Expired ${day(EARLIER)} · Never used`)).toBeTruthy()
  })

  it('reads a token whose scopes were not answered as one given none', () => {
    render(<PersonalAccessTokensList initialTokens={[token({ name: 'Bare', scopes: undefined })]} scopes={SCOPES} />)

    expect(within(rowOf('Bare')).getByText('Only what needs no permission')).toBeTruthy()
  })

  it('deletes one, leaving the others', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock
    render(
      <PersonalAccessTokensList
        initialTokens={[token({ id: 'a', name: 'Deploys' }), token({ id: 'b', name: 'Cron' })]}
        scopes={SCOPES}
      />
    )

    await userEvent.click(within(rowOf('Deploys')).getByRole('button', { name: 'Delete' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('DELETE')
    expect(new URL(request.url).pathname).toBe('/v0/personal-access-tokens/a/')
    expect(screen.queryByText('Deploys')).toBeNull()
    expect(screen.getByText('Cron')).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Token deleted.')
  })

  it("keeps a token it could not delete, with the backend's word or its own", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(404, { detail: 'Not found.' }))
    render(<PersonalAccessTokensList initialTokens={[token({ name: 'Deploys' })]} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(screen.getByText('Deploys')).toBeTruthy()
    expect(toast.error).toHaveBeenCalledWith('Not found.')

    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(toast.error).toHaveBeenLastCalledWith('Could not delete the token.')
  })

  it('holds the delete button down only while that token is going', async () => {
    let answer: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (answer = resolve)))
    render(
      <PersonalAccessTokensList
        initialTokens={[token({ id: 'a', name: 'Deploys' }), token({ id: 'b', name: 'Cron' })]}
        scopes={SCOPES}
      />
    )

    await userEvent.click(within(rowOf('Deploys')).getByRole('button', { name: 'Delete' }))

    expect((within(rowOf('Deploys')).getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(rowOf('Cron')).getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(false)
    answer(new Response(null, { status: 500 }))
    await vi.waitFor(() =>
      expect((within(rowOf('Deploys')).getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(
        false
      )
    )
  })

  it('makes one, shows its token once and lists it first', async () => {
    const made = token({ id: 'n', name: 'New one', token: 'pat_the-token' })
    globalThis.fetch = vi.fn(async () => jsonResponse(201, made))
    render(<PersonalAccessTokensList initialTokens={[token({ name: 'Cron' })]} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'New token' }))
    await userEvent.type(screen.getByLabelText('Name'), 'New one')
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    const issued = await screen.findByRole('status')
    expect(within(issued).getByText('Copy your token now')).toBeTruthy()
    expect(
      within(issued).getByText('It is shown this once: only its checksum is kept. If you lose it, make another.')
    ).toBeTruthy()
    expect(within(issued).getByText('pat_the-token')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((row) => row.querySelector('.font-medium')?.textContent)).toEqual([
      'New one',
      'Cron',
    ])
    expect(screen.queryByLabelText('Name')).toBeNull()

    await userEvent.click(within(issued).getByRole('button', { name: 'Done' }))

    expect(screen.queryByText('pat_the-token')).toBeNull()
  })

  it('shows no token when the answer carried none', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(201, token({ id: 'n', name: 'New one' })))
    render(<PersonalAccessTokensList initialTokens={[]} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'New token' }))
    await userEvent.type(screen.getByLabelText('Name'), 'New one')
    await userEvent.click(screen.getByRole('button', { name: 'Make token' }))

    expect(await screen.findByText('New one')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('puts the form away again without making anything', async () => {
    render(<PersonalAccessTokensList initialTokens={[]} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'New token' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Name')).toBeNull()
    expect(screen.getByRole('button', { name: 'New token' })).toBeTruthy()
  })
})
