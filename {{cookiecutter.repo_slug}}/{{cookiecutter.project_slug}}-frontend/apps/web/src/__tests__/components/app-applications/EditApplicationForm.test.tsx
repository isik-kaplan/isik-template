import { EditApplicationForm } from '@/components/app-applications/EditApplicationForm'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

const SCOPES = [
  { name: 'users:grant:rights', label: 'Grant' },
  { name: 'users:manage:user', label: 'Manage people' },
]
const ACME: ApiType<'Application'> = {
  id: 7,
  name: 'Acme',
  description: 'Notes',
  client_id: 'the-client',
  client_type: 'confidential',
  authorization_grant_type: 'authorization-code',
  redirect_uris: ['https://a.test/cb', 'https://a.test/other'],
  approval: 'approved',
  requested_scopes: ['users:manage:user'],
  approved_scopes: ['users:manage:user'],
  client_secret: null,
  created: '',
  updated: '',
}
// The read's ETag header, which the page hands the form beside the application.
const ETAG = '"1"'

// Never said what it does or asked for anything.
const UNSAID: ApiType<'Application'> = { ...ACME, description: undefined, requested_scopes: undefined }

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const name = () => screen.getByLabelText('Name') as HTMLInputElement
const uris = () => screen.getByLabelText('Redirect URIs, one per line') as HTMLTextAreaElement

describe('EditApplicationForm', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('starts from what the application says now', () => {
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    expect(name().value).toBe('Acme')
    expect((screen.getByLabelText('What it does') as HTMLTextAreaElement).value).toBe('Notes')
    expect(uris().value).toBe('https://a.test/cb\nhttps://a.test/other')
    expect(screen.getByRole('group', { name: 'What it asks to do for the people who sign in' })).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /Manage people/ }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Grant/ }) as HTMLInputElement).checked).toBe(false)
  })

  it('reads an application that never said what it does or asked for anything', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, ACME))
    globalThis.fetch = fetchMock
    render(<EditApplicationForm application={UNSAID} etag={ETAG} scopes={SCOPES} />)

    expect((screen.getByLabelText('What it does') as HTMLTextAreaElement).value).toBe('')
    expect(screen.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).checked)).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toMatchObject({ description: '', requested_scopes: [] })
  })

  it('saves the whole form and reads the page again', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, ACME))
    globalThis.fetch = fetchMock
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    await userEvent.clear(name())
    await userEvent.type(name(), ' Acme 2 ')
    await userEvent.type(screen.getByLabelText('What it does'), ' and more ')
    await userEvent.click(screen.getByRole('checkbox', { name: /Grant/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('PATCH')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-applications/7/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(request.headers.get('If-Match')).toBe('"1"')
    expect(await request.json()).toEqual({
      name: 'Acme 2',
      description: 'Notes and more',
      redirect_uris: ['https://a.test/cb', 'https://a.test/other'],
      requested_scopes: ['users:grant:rights', 'users:manage:user'],
    })
    expect(toast.success).toHaveBeenCalledWith('Saved.')
    expect(refresh).toHaveBeenCalled()
  })

  it('takes the version somebody else saved since it opened, redirect URIs one to a line', async () => {
    const theirs = { ...ACME, name: 'Acme Notes', redirect_uris: ['https://b.test/cb', 'https://b.test/two'] }
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(412, { detail: 'Changed.', code: 'precondition_failed', current: theirs })
    )
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    await userEvent.type(name(), ' 2')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await userEvent.click(screen.getByRole('button', { name: 'Use their version' }))

    expect(name().value).toBe('Acme Notes')
    expect(uris().value).toBe('https://b.test/cb\nhttps://b.test/two')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('offers a device no redirect URIs, and sends none for it', async () => {
    const device: ApiType<'Application'> = {
      ...ACME,
      client_type: 'public',
      authorization_grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      redirect_uris: [],
    }
    const fetchMock = vi.fn(async () => jsonResponse(200, device))
    globalThis.fetch = fetchMock
    render(<EditApplicationForm application={device} etag={ETAG} scopes={SCOPES} />)

    expect(screen.queryByLabelText('Redirect URIs, one per line')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({
      name: 'Acme',
      description: 'Notes',
      requested_scopes: ['users:manage:user'],
    })
  })

  it('reads an application whose redirect URIs were not answered as none', () => {
    const unanswered = { ...ACME, redirect_uris: undefined }
    render(<EditApplicationForm application={unanswered} etag={ETAG} scopes={SCOPES} />)

    expect(uris().value).toBe('')
  })

  it('asks for a name and a redirect URI before sending anything', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    await userEvent.clear(name())
    await userEvent.clear(uris())
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Give the app a name.')).toBeTruthy()
    expect(screen.getByText('Add at least one redirect URI.')).toBeTruthy()
    expect(uris().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows the backend's refusals where they belong", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { redirect_uris: ['Enter a valid URL.'], non_field_errors: ['Not like that.'] })
    )
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(screen.getByText('Enter a valid URL.')).toBeTruthy()
    expect(screen.getByText('Not like that.')).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('says so in its own words when saving fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(toast.error).toHaveBeenCalledWith('Could not save the app.')
  })

  it('holds the button while saving', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<EditApplicationForm application={ACME} etag={ETAG} scopes={SCOPES} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
