import { MfaChallengeForm } from '@/components/app-auth/MfaChallengeForm'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const push = vi.fn()
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

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

const AUTHENTICATE = '/v0/browser/v1/auth/2fa/authenticate'
const WEBAUTHN = '/v0/browser/v1/auth/webauthn/authenticate'
const REAUTHENTICATE = '/v0/browser/v1/auth/2fa/reauthenticate'
const WEBAUTHN_REAUTHENTICATE = '/v0/browser/v1/auth/webauthn/reauthenticate'
const SIGNED_IN = { status: 200, data: { user: {} }, meta: { is_authenticated: true } }
const INCORRECT = { status: 400, errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }] }
const ASSERTION = {
  id: 'credential-id',
  rawId: new Uint8Array([104, 105]).buffer,
  type: 'public-key',
  getClientExtensionResults: () => ({}),
  response: {
    clientDataJSON: new Uint8Array([104, 105]).buffer,
    authenticatorData: new Uint8Array([104, 105]).buffer,
    signature: new Uint8Array([104, 105]).buffer,
    userHandle: null,
  },
}

describe('MfaChallengeForm', () => {
  const originalFetch = globalThis.fetch
  const get = vi.fn()

  beforeEach(() => {
    vi.mocked(toast.error).mockClear()
    vi.clearAllMocks()
    document.cookie = 'csrftoken=test-token'
    Object.defineProperty(window, 'PublicKeyCredential', { value: function () {}, configurable: true })
    Object.defineProperty(navigator, 'credentials', { value: { get }, configurable: true })
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
  })

  it('takes the authenticator code in boxes and finishes the login with it', async () => {
    serve(on('POST', AUTHENTICATE, 200, SIGNED_IN))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['totp', 'recovery_codes']} redirectTo="/dashboard" />)

    expect(document.activeElement).toBe(screen.getByLabelText('Digit 1 of 6'))
    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await requests()[0].json()).toEqual({ code: '123456' })
    expect(push).toHaveBeenCalledWith('/dashboard')
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true)
    expect(refresh).toHaveBeenCalled()
  })

  it('refuses to submit until something is typed', () => {
    render(<MfaChallengeForm types={['totp']} redirectTo="/" />)

    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true)
  })

  it('shows a wrong code where it was typed and stays put', async () => {
    serve(on('POST', AUTHENTICATE, 400, INCORRECT))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['totp']} redirectTo="/" />)

    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await screen.findByText('Incorrect code.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('falls back to its own message when the refusal names no reason', async () => {
    serve(on('POST', AUTHENTICATE, 409, { status: 409 }))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['totp']} redirectTo="/" />)

    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("That code didn't work. Try again."))
  })

  it('switches to a recovery code, trimming what is pasted in', async () => {
    serve(on('POST', AUTHENTICATE, 200, SIGNED_IN))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['totp', 'recovery_codes']} redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Use a recovery code instead' }))
    await user.type(screen.getByLabelText('Recovery code'), '  ab12-cd34  ')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await requests()[0].json()).toEqual({ code: 'ab12-cd34' })
    expect(push).toHaveBeenCalledWith('/')
  })

  it('switching back and forth starts each mode empty and without the old error', async () => {
    serve(on('POST', AUTHENTICATE, 400, INCORRECT))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['totp', 'recovery_codes']} redirectTo="/" />)
    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await screen.findByText('Incorrect code.')

    await user.click(screen.getByRole('button', { name: 'Use a recovery code instead' }))
    expect(screen.queryByText('Incorrect code.')).toBeNull()
    await user.type(screen.getByLabelText('Recovery code'), 'x')
    await user.click(screen.getByRole('button', { name: 'Use your authenticator app instead' }))

    expect(screen.getByLabelText('Digit 1 of 6')).toHaveProperty('value', '')
    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true)
  })

  it('starts on the recovery code for an account with no authenticator app', () => {
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    expect(screen.getByLabelText('Recovery code')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /instead/ })).toBeNull()
  })

  it('offers no recovery code switch to an account without codes', () => {
    render(<MfaChallengeForm types={['totp']} redirectTo="/" />)

    expect(screen.queryByRole('button', { name: /instead/ })).toBeNull()
  })

  it('offers a passkey only to an account that has one', () => {
    render(<MfaChallengeForm types={['totp', 'recovery_codes']} redirectTo="/" />)

    expect(screen.queryByRole('button', { name: 'Use a passkey' })).toBeNull()
  })

  it('offers no passkey in a browser that cannot use one', () => {
    delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    expect(screen.queryByRole('button', { name: 'Use a passkey' })).toBeNull()
  })

  it('finishes the login with a passkey', async () => {
    serve(
      on('GET', WEBAUTHN, 200, { status: 200, data: { request_options: { publicKey: { challenge: 'aGk' } } } }),
      on('POST', WEBAUTHN, 200, SIGNED_IN)
    )
    get.mockResolvedValue(ASSERTION)
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/next" />)

    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    expect(Array.from(new Uint8Array(get.mock.calls[0][0].publicKey.challenge))).toEqual([104, 105])
    const answered = await requests()[1].json()
    expect(answered.credential.response.signature).toBe('aGk')
    expect(push).toHaveBeenCalledWith('/next')
    // The screen is leaving, so the button stays shut rather than offering a second submit.
    expect(screen.getByRole('button', { name: 'Use a passkey' })).toHaveProperty('disabled', true)
  })

  it('proves it is them with the authenticator code, for the act that asked', async () => {
    serve(on('POST', REAUTHENTICATE, 200, SIGNED_IN))
    const user = userEvent.setup()
    render(<MfaChallengeForm purpose="prove" types={['totp']} redirectTo="/profile/emails" />)

    await user.keyboard('123456')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(await requests()[0].json()).toEqual({ code: '123456' })
    expect(push).toHaveBeenCalledWith('/profile/emails')
  })

  it('proves it is them with a passkey, for the act that asked', async () => {
    serve(
      on('GET', WEBAUTHN_REAUTHENTICATE, 200, {
        status: 200,
        data: { request_options: { publicKey: { challenge: 'aGk' } } },
      }),
      on('POST', WEBAUTHN_REAUTHENTICATE, 200, SIGNED_IN)
    )
    get.mockResolvedValue(ASSERTION)
    const user = userEvent.setup()
    render(<MfaChallengeForm purpose="prove" types={['webauthn']} redirectTo="/profile/emails" />)

    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    expect(requests().map((request) => new URL(request.url).pathname)).toEqual([
      WEBAUTHN_REAUTHENTICATE,
      WEBAUTHN_REAUTHENTICATE,
    ])
    expect((await requests()[1].json()).credential.response.signature).toBe('aGk')
    expect(push).toHaveBeenCalledWith('/profile/emails')
  })

  it('reports a passkey the server refuses', async () => {
    serve(
      on('GET', WEBAUTHN, 200, { status: 200, data: { request_options: { publicKey: { challenge: 'aGk' } } } }),
      on('POST', WEBAUTHN, 400, { status: 400 })
    )
    get.mockResolvedValue(ASSERTION)
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("That passkey couldn't be verified."))
    expect(push).not.toHaveBeenCalled()
  })

  it('shows why the server refused a passkey where the code would go', async () => {
    serve(
      on('GET', WEBAUTHN, 200, { status: 200, data: { request_options: { publicKey: { challenge: 'aGk' } } } }),
      on('POST', WEBAUTHN, 400, { status: 400, errors: [{ code: 'incorrect_code', message: 'Not that one.' }] })
    )
    get.mockResolvedValue(ASSERTION)
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    expect(await screen.findByText('Not that one.')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
  })

  it('goes back to the other factors quietly when the passkey prompt is dismissed', async () => {
    serve(on('GET', WEBAUTHN, 200, { status: 200, data: { request_options: { publicKey: { challenge: 'aGk' } } } }))
    get.mockRejectedValue(new DOMException('cancelled', 'NotAllowedError'))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    expect(requests()).toHaveLength(1)
    expect(push).not.toHaveBeenCalled()
  })

  it('never opens the prompt when the challenge cannot be fetched', async () => {
    serve(on('GET', WEBAUTHN, 409, { status: 409 }))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    expect(get).not.toHaveBeenCalled()
  })

  it('clears an old error as a passkey attempt starts', async () => {
    serve(on('POST', AUTHENTICATE, 400, INCORRECT))
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)
    await user.type(screen.getByLabelText('Recovery code'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Verify' }))
    await screen.findByText('Incorrect code.')

    let finish: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))) as typeof fetch
    await user.click(screen.getByRole('button', { name: 'Use a passkey' }))

    expect(screen.queryByText('Incorrect code.')).toBeNull()
    await act(async () => finish(jsonResponse(409, { status: 409 })))
  })

  it('holds both ways in while a code is being checked', async () => {
    let finish: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))) as typeof fetch
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    await user.type(screen.getByLabelText('Recovery code'), 'abcd')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Use a passkey' })).toHaveProperty('disabled', true)
    await act(async () => finish(jsonResponse(400, INCORRECT)))
  })

  it('explains each mode in words', async () => {
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['totp', 'recovery_codes']} redirectTo="/" />)

    expect(screen.getByText('Enter the 6-digit code from your authenticator app.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Use a recovery code instead' }))
    expect(screen.getByText('Enter one of the recovery codes you saved. Each one works once.')).toBeTruthy()
  })

  it('refuses a recovery code that is only blanks', async () => {
    const user = userEvent.setup()
    render(<MfaChallengeForm types={['webauthn', 'recovery_codes']} redirectTo="/" />)

    await user.type(screen.getByLabelText('Recovery code'), '   ')

    expect(screen.getByRole('button', { name: 'Verify' })).toHaveProperty('disabled', true)
  })

  it('draws no error line until there is an error, and then a paragraph holding it', async () => {
    serve(on('POST', AUTHENTICATE, 400, INCORRECT))
    const user = userEvent.setup()
    const { container } = render(<MfaChallengeForm types={['totp']} redirectTo="/" />)
    expect(container.querySelector('.text-destructive')).toBeNull()

    await user.keyboard('000000')
    await user.click(screen.getByRole('button', { name: 'Verify' }))

    expect((await screen.findByText('Incorrect code.')).tagName).toBe('P')
  })
})
