import { RegisteredApplications } from '@/components/app-auth/RegisteredApplications'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const MINE = {
  id: 3,
  name: 'My Notes',
  client_id: 'my-client-id',
  client_type: 'confidential' as const,
  redirect_uris: ['https://notes.example.test/cb', 'https://notes.example.test/other'],
  client_secret: null,
  created: '2026-01-01T00:00:00Z',
  updated: '2026-01-01T00:00:00Z',
}

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

async function register(name: string) {
  await userEvent.type(screen.getByLabelText('Name'), name)
  await userEvent.type(screen.getByLabelText('Redirect URIs, one per line'), 'https://new.example.test/cb')
  await userEvent.click(screen.getByRole('button', { name: 'Register app' }))
}

describe('RegisteredApplications', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('says when nothing is registered yet, and what registering is for', () => {
    render(<RegisteredApplications initialApplications={[]} />)

    expect(screen.getByText('Your apps')).toBeTruthy()
    expect(screen.getByText(/Register an app so its users can sign in with their .* account\./)).toBeTruthy()
    expect(screen.getByText('You have not registered an app.')).toBeTruthy()
  })

  it('lists each application with its client id and every redirect URI', () => {
    render(<RegisteredApplications initialApplications={[MINE]} />)

    const row = screen.getByText('My Notes').closest('li') as HTMLElement
    expect(within(row).getByText('my-client-id')).toBeTruthy()
    expect(within(row).getByText('https://notes.example.test/cb')).toBeTruthy()
    expect(within(row).getByText('https://notes.example.test/other')).toBeTruthy()
  })

  it('deletes one', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    globalThis.fetch = fetchMock
    render(<RegisteredApplications initialApplications={[MINE]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('DELETE')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-applications/3/')
    expect(screen.queryByText('My Notes')).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('App deleted.')
  })

  it('says why one could not be deleted, keeping it', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { detail: 'Not now.' }))
    render(<RegisteredApplications initialApplications={[MINE]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(toast.error).toHaveBeenCalledWith('Not now.')
    expect(screen.getByText('My Notes')).toBeTruthy()
  })

  it('falls back to its own words when a refused delete says nothing', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<RegisteredApplications initialApplications={[MINE]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(toast.error).toHaveBeenCalledWith('Could not delete the app.')
  })

  it('holds the delete button while its request is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<RegisteredApplications initialApplications={[MINE]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows a newly registered application first, with its secret this once', async () => {
    const issued = { ...MINE, id: 4, name: 'New One', client_id: 'new-client-id', client_secret: 'the-secret' }
    globalThis.fetch = vi.fn(async () => jsonResponse(201, issued))
    render(<RegisteredApplications initialApplications={[MINE]} />)

    await register('New One')

    const status = screen.getByRole('status')
    expect(within(status).getByText('Copy the client secret now')).toBeTruthy()
    expect(within(status).getByText(/It is shown this once/)).toBeTruthy()
    expect(within(status).getByText('new-client-id')).toBeTruthy()
    expect(within(status).getByText('the-secret')).toBeTruthy()
    expect(screen.getAllByRole('listitem')[0].textContent).toContain('New One')

    await userEvent.click(within(status).getByRole('button', { name: 'I have copied it' }))
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByText('the-secret')).toBeNull()
  })

  it('shows no secret for a public client, which was issued none', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(201, { ...MINE, id: 4, name: 'Mobile', client_type: 'public' }))
    render(<RegisteredApplications initialApplications={[]} />)

    await register('Mobile')

    expect(screen.getByText('Mobile')).toBeTruthy()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
