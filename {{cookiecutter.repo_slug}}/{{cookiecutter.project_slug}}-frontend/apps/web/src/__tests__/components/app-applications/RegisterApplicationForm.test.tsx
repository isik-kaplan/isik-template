import { RegisterApplicationForm } from '@/components/app-applications/RegisterApplicationForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const SCOPES = [{ name: 'users:manage:user', label: 'Manage people' }]

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const name = () => screen.getByLabelText('Name') as HTMLInputElement
const description = () => screen.getByLabelText('What it does') as HTMLTextAreaElement
const uris = () => screen.getByLabelText('Redirect URIs, one per line') as HTMLTextAreaElement
const kind = () => screen.getByLabelText('Kind') as HTMLSelectElement
const grant = () => screen.getByLabelText('How it signs people in') as HTMLSelectElement
const DEVICE = 'urn:ietf:params:oauth:grant-type:device_code'

describe('RegisterApplicationForm', () => {
  const originalFetch = globalThis.fetch
  const onRegistered = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('offers both kinds of client, a server by default, and the scopes it may ask for', () => {
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    expect(kind().value).toBe('confidential')
    expect([...kind().options].map((option) => [option.value, option.textContent])).toEqual([
      ['confidential', 'A server, which keeps a secret'],
      ['public', 'A browser or mobile app'],
    ])
    expect(screen.getByRole('group', { name: 'What it asks to do for the people who sign in' })).toBeTruthy()
  })

  it('offers both ways of signing people in, through the browser by default', () => {
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    expect(grant().value).toBe('authorization-code')
    expect([...grant().options].map((option) => [option.value, option.textContent])).toEqual([
      ['authorization-code', 'Signs people in through their browser'],
      [DEVICE, 'Shows a code to enter here, like a command line'],
    ])
    expect(screen.queryByText(/It shows people a code to enter at \/device/)).toBeNull()
  })

  it('registers a device with no redirect URIs typed at all', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { id: 1, client_secret: null }))
    globalThis.fetch = fetchMock
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), 'CLI')
    await userEvent.selectOptions(grant(), DEVICE)
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('asks a device for neither a kind nor redirect URIs, and registers it public and sent back nowhere', async () => {
    const registered = { id: 1, name: 'CLI', client_type: 'public', redirect_uris: [], client_secret: null }
    const fetchMock = vi.fn(async () => jsonResponse(201, registered))
    globalThis.fetch = fetchMock
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    // Typed before switching, and left behind by it.
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.type(name(), 'CLI')
    await userEvent.selectOptions(grant(), DEVICE)

    expect(
      screen.getByText(
        'It shows people a code to enter at /device. It keeps no secret and is sent back nowhere, so there is nothing else to set.'
      )
    ).toBeTruthy()
    expect(screen.queryByLabelText('Kind')).toBeNull()
    expect(screen.queryByLabelText('Redirect URIs, one per line')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(await request.json()).toEqual({
      name: 'CLI',
      description: '',
      authorization_grant_type: DEVICE,
      client_type: 'public',
      redirect_uris: [],
      requested_scopes: [],
    })
    expect(onRegistered).toHaveBeenCalledWith(registered)
  })

  it('asks for a name and a redirect URI before sending anything', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), '   ')
    await userEvent.type(uris(), '  \n  ')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(screen.getByText('Give the app a name.')).toBeTruthy()
    expect(screen.getByText('Add at least one redirect URI.')).toBeTruthy()
    expect(uris().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends what was typed and ticked, trimmed, under an idempotency key', async () => {
    const registered = { id: 1, name: 'Acme', client_type: 'public', redirect_uris: [], client_secret: null }
    const fetchMock = vi.fn(async () => jsonResponse(201, registered))
    globalThis.fetch = fetchMock
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), ' Acme ')
    await userEvent.type(description(), ' Notes ')
    await userEvent.selectOptions(kind(), 'public')
    await userEvent.type(uris(), ' https://a.test/cb \n\nhttps://a.test/other')
    await userEvent.click(screen.getByRole('checkbox', { name: /Manage people/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-applications/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request.json()).toEqual({
      name: 'Acme',
      description: 'Notes',
      authorization_grant_type: 'authorization-code',
      client_type: 'public',
      redirect_uris: ['https://a.test/cb', 'https://a.test/other'],
      requested_scopes: ['users:manage:user'],
    })
    expect(onRegistered).toHaveBeenCalledWith(registered)
  })

  it("shows the backend's word on a redirect URI it cannot return to", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { redirect_uris: ['Enter a valid URL.'] }))
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'ftp://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(screen.getByText('Enter a valid URL.')).toBeTruthy()
    expect(onRegistered).not.toHaveBeenCalled()
    expect(name().value).toBe('Acme')
  })

  it('shows a refusal about the whole application', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse(400, { non_field_errors: ['You can register at most 10 applications.'] })
    )
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(screen.getByText('You can register at most 10 applications.')).toBeTruthy()
  })

  it('says so in its own words when the registration fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(toast.error).toHaveBeenCalledWith('Could not register the app.')
  })

  it('holds the button while the registration is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<RegisterApplicationForm scopes={SCOPES} onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect((screen.getByRole('button', { name: 'Register app' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
