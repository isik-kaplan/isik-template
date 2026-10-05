import { PasskeyList } from '@/components/app-auth/PasskeyList'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Route = (request: Request) => Response | undefined

function serve(...routes: Route[]) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const request = input as Request
    for (const route of routes) {
      const response = route(request)
      if (response) return response
    }
    throw new Error(`unexpected ${request.method} ${request.url}`)
  }) as typeof fetch
}

function on(method: string, path: string, status: number, body: unknown): Route {
  return (request) =>
    request.method === method && new URL(request.url).pathname === path ? jsonResponse(status, body) : undefined
}

function requests() {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([request]) => request as Request)
}

const WEBAUTHN = '/v0/browser/v1/account/authenticators/webauthn'
const RECOVERY = '/v0/browser/v1/account/authenticators/recovery-codes'
const CREATION_OPTIONS = {
  status: 200,
  data: {
    creation_options: { publicKey: { challenge: 'aGk', user: { id: 'aGk', name: 'jane', displayName: 'Jane' } } },
  },
}
const CREDENTIAL = {
  id: 'credential-id',
  rawId: new Uint8Array([104, 105]).buffer,
  type: 'public-key',
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: new Uint8Array([104, 105]).buffer,
    attestationObject: new Uint8Array([104, 105]).buffer,
    getTransports: () => ['internal'],
  },
}
const LAPTOP = { id: 7, name: 'Laptop', createdAt: 1700000000 }

describe('PasskeyList', () => {
  const originalFetch = globalThis.fetch
  const create = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'csrftoken=test-token'
    Object.defineProperty(window, 'PublicKeyCredential', { value: function () {}, configurable: true })
    Object.defineProperty(navigator, 'credentials', { value: { create }, configurable: true })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
  })

  it('lists every passkey by name and the day it was added', () => {
    render(<PasskeyList passkeys={[LAPTOP, { id: 8, name: 'Phone', createdAt: 1700000000 }]} />)

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('.font-medium')?.textContent)).toEqual(['Laptop', 'Phone'])
    expect(rows[0].textContent).toContain(`Added ${new Date(1700000000 * 1000).toLocaleDateString()}`)
  })

  it('draws no list at all with no passkeys yet', () => {
    render(<PasskeyList passkeys={[]} />)

    expect(screen.queryByRole('list')).toBeNull()
  })

  it('removes a passkey by its id and refreshes the list', async () => {
    serve(on('DELETE', WEBAUTHN, 200, { status: 200 }))
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[LAPTOP]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Laptop' }))

    expect(await requests()[0].json()).toEqual({ authenticators: [7] })
    expect(toast.success).toHaveBeenCalledWith('Passkey removed.')
    expect(refresh).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Remove Laptop' })).toHaveProperty('disabled', false)
  })

  it('holds every remove button while one removal is in flight', async () => {
    let finish: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))) as typeof fetch
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[LAPTOP, { id: 8, name: 'Phone', createdAt: 1700000000 }]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Laptop' }))

    expect(screen.getByRole('button', { name: 'Remove Phone' })).toHaveProperty('disabled', true)
    await act(async () => finish(jsonResponse(200, { status: 200 })))
  })

  it('reports a refused removal and leaves the list alone', async () => {
    serve(on('DELETE', WEBAUTHN, 500, {}))
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[LAPTOP]} />)

    await user.click(screen.getByRole('button', { name: 'Remove Laptop' }))

    expect(toast.error).toHaveBeenCalledWith('Could not remove the passkey.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('enrolls a passkey through the browser and registers it', async () => {
    serve(
      on('GET', WEBAUTHN, 200, CREATION_OPTIONS),
      on('POST', WEBAUTHN, 200, { status: 200, data: {}, meta: { recovery_codes_generated: false } })
    )
    create.mockResolvedValue(CREDENTIAL)
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    const { publicKey } = create.mock.calls[0][0]
    expect(Array.from(new Uint8Array(publicKey.challenge))).toEqual([104, 105])
    const registered = await requests()[1].json()
    expect(registered.credential.rawId).toBe('aGk')
    expect(registered.credential.response.transports).toEqual(['internal'])
    expect(toast.success).toHaveBeenCalledWith('Passkey added.')
    expect(refresh).toHaveBeenCalled()
    expect(requests()).toHaveLength(2)
    expect(screen.queryByRole('region', { name: 'Your recovery codes' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toHaveProperty('disabled', false)
  })

  it('shows the recovery codes a first factor generated', async () => {
    serve(
      on('GET', WEBAUTHN, 200, CREATION_OPTIONS),
      on('POST', WEBAUTHN, 200, { status: 200, data: {}, meta: { recovery_codes_generated: true } }),
      on('GET', RECOVERY, 200, { status: 200, data: { unused_codes: ['c0de-0001'] } })
    )
    create.mockResolvedValue(CREDENTIAL)
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(await screen.findByText('c0de-0001')).toBeTruthy()
  })

  it('stops quietly when the browser prompt is dismissed', async () => {
    serve(on('GET', WEBAUTHN, 200, CREATION_OPTIONS))
    create.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(requests()).toHaveLength(1)
    expect(toast.error).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Add a passkey' })).toHaveProperty('disabled', false)
  })

  it('stops quietly when the browser hands back no credential', async () => {
    serve(on('GET', WEBAUTHN, 200, CREATION_OPTIONS))
    create.mockResolvedValue(null)
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(requests()).toHaveLength(1)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('never opens the browser prompt when the options are refused', async () => {
    serve(on('GET', WEBAUTHN, 409, { status: 409, errors: [{ code: 'unverified_email', message: 'Verify first.' }] }))
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(create).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Verify first.')
  })

  it('reports a credential the server refuses to register', async () => {
    serve(on('GET', WEBAUTHN, 200, CREATION_OPTIONS), on('POST', WEBAUTHN, 400, { status: 400 }))
    create.mockResolvedValue(CREDENTIAL)
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(toast.error).toHaveBeenCalledWith('Could not add the passkey.')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('holds the enroll button while an enrollment is under way', async () => {
    let finish: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))) as typeof fetch
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(screen.getByRole('button', { name: 'Add a passkey' })).toHaveProperty('disabled', true)
    await act(async () => finish(jsonResponse(500, {})))
  })

  it('says the browser cannot do passkeys when it cannot, on a secure page', () => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true })
    render(<PasskeyList passkeys={[]} />)

    expect(screen.getByText("This browser can't use passkeys.")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).toBeNull()
  })

  it('blames the address rather than the browser on plain http', () => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    render(<PasskeyList passkeys={[]} />)

    expect(screen.getByText('Passkeys only work over a secure (https) connection.')).toBeTruthy()
  })

  it('heads its section and explains what a passkey is for here', () => {
    render(<PasskeyList passkeys={[LAPTOP]} />)

    expect(screen.getByRole('heading', { name: 'Passkeys' })).toBeTruthy()
    expect(screen.getByText('Use a passkey or security key as your second step when you log in.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Laptop' }).textContent).toBe('Remove')
  })

  it('reports options refused without a reason in its own words', async () => {
    serve(on('GET', WEBAUTHN, 500, {}))
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(toast.error).toHaveBeenCalledWith('Could not add the passkey.')
  })

  it('still finishes enrolling when the generated recovery codes cannot be read back', async () => {
    serve(
      on('GET', WEBAUTHN, 200, CREATION_OPTIONS),
      on('POST', WEBAUTHN, 200, { status: 200, data: {}, meta: { recovery_codes_generated: true } }),
      on('GET', RECOVERY, 404, { status: 404 })
    )
    create.mockResolvedValue(CREDENTIAL)
    const user = userEvent.setup()
    render(<PasskeyList passkeys={[]} />)

    await user.click(screen.getByRole('button', { name: 'Add a passkey' }))

    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByRole('region', { name: 'Your recovery codes' })).toBeNull()
  })
})
