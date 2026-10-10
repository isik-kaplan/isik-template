import { TotpSetup } from '@/components/app-auth/TotpSetup'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QRCode from 'qrcode'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }))

const toDataURL = QRCode.toDataURL as unknown as ReturnType<typeof vi.fn>

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

const TOTP = '/v0/browser/v1/account/authenticators/totp'
const RECOVERY = '/v0/browser/v1/account/authenticators/recovery-codes'

async function typeCode(code: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText('Digit 1 of 6'), code)
  return user
}

describe('TotpSetup', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    document.cookie = 'csrftoken=test-token'
    toDataURL.mockResolvedValue('data:image/png;base64,qr')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('draws the enrollment QR code and shows the key to type by hand', async () => {
    render(<TotpSetup active={false} secret="JBSWY3DP" totpUrl="otpauth://totp/x?secret=JBSWY3DP" />)

    expect(await screen.findByAltText('QR code for your authenticator app')).toHaveProperty(
      'src',
      'data:image/png;base64,qr'
    )
    expect(toDataURL).toHaveBeenCalledWith('otpauth://totp/x?secret=JBSWY3DP', { margin: 1, width: 200 })
    expect(screen.getByTestId('totp-secret').textContent).toBe('JBSWY3DP')
  })

  it('draws nothing without an enrollment url', () => {
    render(<TotpSetup active={false} secret="JBSWY3DP" />)

    expect(toDataURL).not.toHaveBeenCalled()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('keeps the newest QR code when an older drawing finishes last', async () => {
    let finishFirst: (url: string) => void = () => {}
    toDataURL.mockImplementationOnce(() => new Promise((resolve) => (finishFirst = resolve)))
    toDataURL.mockImplementationOnce(async () => 'data:second')
    const { rerender } = render(<TotpSetup active={false} secret="A" totpUrl="otpauth://first" />)

    rerender(<TotpSetup active={false} secret="B" totpUrl="otpauth://second" />)
    expect(await screen.findByRole('img')).toHaveProperty('src', 'data:second')
    await act(async () => finishFirst('data:first'))

    expect(screen.getByRole('img')).toHaveProperty('src', 'data:second')
  })

  it('refuses to submit until a code is typed', () => {
    render(<TotpSetup active={false} secret="A" />)

    expect(screen.getByRole('button', { name: 'Turn on' })).toHaveProperty('disabled', true)
  })

  it('turns TOTP on, then shows the recovery codes that came with it', async () => {
    serve(
      on('POST', TOTP, 200, { status: 200, data: { type: 'totp' } }),
      on('GET', RECOVERY, 200, { status: 200, data: { unused_codes: ['c0de-0001', 'c0de-0002'] } })
    )
    render(<TotpSetup active={false} secret="A" />)

    const user = await typeCode('123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    const [activation] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [Request]
    expect(await activation.json()).toEqual({ code: '123456' })
    expect(await screen.findByText('On')).toBeTruthy()
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['c0de-0001', 'c0de-0002'])
    expect(toast.success).toHaveBeenCalledWith('Two-factor authentication is on.')
    expect(refresh).toHaveBeenCalled()
  })

  it('still turns on when the recovery codes cannot be read back', async () => {
    serve(on('POST', TOTP, 200, { status: 200, data: { type: 'totp' } }), on('GET', RECOVERY, 404, { status: 404 }))
    render(<TotpSetup active={false} secret="A" />)

    const user = await typeCode('123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(await screen.findByText('On')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Your recovery codes' })).toBeNull()
    expect(refresh).toHaveBeenCalled()
  })

  it('shows a wrong code beside the boxes and stays on the form', async () => {
    serve(
      on('POST', TOTP, 400, {
        status: 400,
        errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }],
      })
    )
    render(<TotpSetup active={false} secret="A" />)

    const user = await typeCode('000000')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(await screen.findByText('Incorrect code.')).toBeTruthy()
    expect(screen.queryByText('On')).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('clears an earlier error when the next attempt starts', async () => {
    serve(
      on('POST', TOTP, 400, {
        status: 400,
        errors: [{ code: 'incorrect_code', param: 'code', message: 'Incorrect code.' }],
      })
    )
    render(<TotpSetup active={false} secret="A" />)
    const user = await typeCode('000000')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await screen.findByText('Incorrect code.')

    let finish: (response: Response) => void = () => {}
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))) as typeof fetch
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect(screen.queryByText('Incorrect code.')).toBeNull()
    await act(async () => finish(jsonResponse(500, {})))
  })

  it('turns an active TOTP off and goes back to enrollment', async () => {
    serve(on('DELETE', TOTP, 200, { status: 200 }))
    const user = userEvent.setup()
    render(<TotpSetup active secret="A" />)

    await user.click(screen.getByRole('button', { name: 'Turn off' }))

    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeTruthy()
    expect(toast.success).toHaveBeenCalledWith('Authenticator app removed.')
    expect(refresh).toHaveBeenCalled()
  })

  it('hides the codes from an earlier activation once TOTP is turned off', async () => {
    serve(
      on('POST', TOTP, 200, { status: 200, data: { type: 'totp' } }),
      on('GET', RECOVERY, 200, { status: 200, data: { unused_codes: ['c0de-0001'] } }),
      on('DELETE', TOTP, 200, { status: 200 })
    )
    render(<TotpSetup active={false} secret="A" />)
    const user = await typeCode('123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await screen.findByText('c0de-0001')

    await user.click(screen.getByRole('button', { name: 'Turn off' }))

    await screen.findByRole('button', { name: 'Turn on' })
    expect(screen.queryByText('c0de-0001')).toBeNull()
  })

  it('stays on when turning off is refused for a proof, going to prove it instead', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      value: {
        ...originalLocation,
        origin: originalLocation.origin,
        href: '',
        pathname: '/profile/two-factor',
        search: '',
      },
      writable: true,
    })
    serve(
      on('DELETE', TOTP, 401, {
        status: 401,
        data: { flows: [{ id: 'reauthenticate' }] },
        meta: { is_authenticated: true },
      })
    )
    const user = userEvent.setup()
    render(<TotpSetup active secret="A" />)

    await user.click(screen.getByRole('button', { name: 'Turn off' }))

    const sentTo = window.location.href
    Object.defineProperty(window, 'location', { value: originalLocation, writable: true })
    expect(sentTo).toBe('/auth/prove?next=%2Fprofile%2Ftwo-factor')
    expect(toast.error).not.toHaveBeenCalled()
    expect(screen.getByText('On')).toBeTruthy()
    expect(refresh).not.toHaveBeenCalled()
  })

  it("explains why enrolling is refused instead of offering a form that can't work", () => {
    render(<TotpSetup active={false} blockedReason="Verify your email first." />)

    expect(screen.getByText('Verify your email first.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Turn on' })).toBeNull()
  })

  it('shows an active TOTP as on even when enrolling would be refused', () => {
    render(<TotpSetup active blockedReason="Verify your email first." />)

    expect(screen.getByText('On')).toBeTruthy()
    expect(screen.queryByText('Verify your email first.')).toBeNull()
  })

  it('names its section, its hint, the key, and the code boxes', () => {
    render(<TotpSetup active={false} secret="A" />)

    expect(screen.getByRole('heading', { name: 'Authenticator app' })).toBeTruthy()
    expect(screen.getByText(/Scan this with an authenticator app/)).toBeTruthy()
    expect(screen.getByText('Setup key')).toBeTruthy()
    expect(screen.getByRole('group', { name: 'Authentication code' })).toBeTruthy()
  })

  it('toasts its own message when turning it on fails for no stated reason', async () => {
    serve(on('POST', TOTP, 500, {}))
    render(<TotpSetup active={false} secret="A" />)

    const user = await typeCode('123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not turn on two-factor authentication.'))
  })

  it('draws no error line until there is an error, and then a paragraph holding it', async () => {
    serve(
      on('POST', TOTP, 400, { status: 400, errors: [{ code: 'incorrect_code', param: 'code', message: 'Wrong.' }] })
    )
    const { container } = render(<TotpSetup active={false} secret="A" />)
    expect(container.querySelector('.text-destructive')).toBeNull()

    const user = await typeCode('123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))

    expect((await screen.findByText('Wrong.')).tagName).toBe('P')
  })

  it('reports a refused turn-off in its own words when the server gives none', async () => {
    serve(on('DELETE', TOTP, 500, {}))
    const user = userEvent.setup()
    render(<TotpSetup active secret="A" />)

    await user.click(screen.getByRole('button', { name: 'Turn off' }))

    expect(toast.error).toHaveBeenCalledWith('Could not remove the authenticator app.')
  })

  it('comes back to an empty code after turning on and off again', async () => {
    serve(
      on('POST', TOTP, 200, { status: 200, data: { type: 'totp' } }),
      on('GET', RECOVERY, 404, { status: 404 }),
      on('DELETE', TOTP, 200, { status: 200 })
    )
    render(<TotpSetup active={false} secret="A" />)
    const user = await typeCode('123456')
    await user.click(screen.getByRole('button', { name: 'Turn on' }))
    await user.click(await screen.findByRole('button', { name: 'Turn off' }))

    expect(await screen.findByRole('button', { name: 'Turn on' })).toHaveProperty('disabled', true)
  })
})
