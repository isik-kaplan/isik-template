import { RegisterApplicationForm } from '@/components/app-auth/RegisterApplicationForm'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const name = () => screen.getByLabelText('Name') as HTMLInputElement
const uris = () => screen.getByLabelText('Redirect URIs, one per line') as HTMLTextAreaElement
const kind = () => screen.getByLabelText('Kind') as HTMLSelectElement

describe('RegisterApplicationForm', () => {
  const originalFetch = globalThis.fetch
  const onRegistered = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('offers both kinds of client, a server by default', () => {
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

    expect(kind().value).toBe('confidential')
    expect([...kind().options].map((option) => [option.value, option.textContent])).toEqual([
      ['confidential', 'A server, which keeps a secret'],
      ['public', 'A browser or mobile app'],
    ])
  })

  it('asks for a name and a redirect URI before sending anything', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

    await userEvent.type(name(), '   ')
    await userEvent.type(uris(), '  \n  ')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(screen.getByText('Give the app a name.')).toBeTruthy()
    expect(screen.getByText('Add at least one redirect URI.')).toBeTruthy()
    expect(uris().getAttribute('aria-invalid')).toBe('true')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends one redirect URI per line, trimmed, under an idempotency key, then starts over', async () => {
    const registered = { id: 1, name: 'Acme', client_type: 'public', redirect_uris: [], client_secret: null }
    const fetchMock = vi.fn(async () => jsonResponse(201, registered))
    globalThis.fetch = fetchMock
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

    await userEvent.type(name(), ' Acme ')
    await userEvent.selectOptions(kind(), 'public')
    await userEvent.type(uris(), ' https://a.test/cb \n\nhttps://a.test/other')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    const [request] = fetchMock.mock.calls[0] as unknown as [Request]
    expect(request.method).toBe('POST')
    expect(new URL(request.url).pathname).toBe('/v0/oauth-applications/')
    expect(request.headers.get('Idempotency-Key')).toBeTruthy()
    expect(await request.json()).toEqual({
      name: 'Acme',
      client_type: 'public',
      redirect_uris: ['https://a.test/cb', 'https://a.test/other'],
    })
    expect(onRegistered).toHaveBeenCalledWith(registered)
    expect(name().value).toBe('')
    expect(uris().value).toBe('')
    expect(kind().value).toBe('confidential')
  })

  it("shows the backend's word on a redirect URI it cannot return to", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(400, { redirect_uris: ['Enter a valid URL.'] }))
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

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
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(screen.getByText('You can register at most 10 applications.')).toBeTruthy()
  })

  it('says so in its own words when the registration fails with nothing to show', async () => {
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 500 }))
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect(toast.error).toHaveBeenCalledWith('Could not register the app.')
  })

  it('holds the button while the registration is out', async () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}))
    render(<RegisterApplicationForm onRegistered={onRegistered} />)

    await userEvent.type(name(), 'Acme')
    await userEvent.type(uris(), 'https://a.test/cb')
    await userEvent.click(screen.getByRole('button', { name: 'Register app' }))

    expect((screen.getByRole('button', { name: 'Register app' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
