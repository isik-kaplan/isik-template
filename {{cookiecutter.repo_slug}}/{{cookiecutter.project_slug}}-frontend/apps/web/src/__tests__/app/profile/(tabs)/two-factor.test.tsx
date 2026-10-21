import ProfileTwoFactorPage from '@/app/profile/(tabs)/two-factor/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const totpStatus = vi.fn()
const authenticators = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  AuthApi,
}))
AuthApi.mockImplementation(() => ({ totpStatus, authenticators }))

let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => {
    const init: Record<string, string> = { host: 'test-project.test' }
    if (cookieHeader !== undefined) init.cookie = cookieHeader
    return new Headers(init)
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:qr') } }))

const NOT_SET_UP = { data: undefined, error: { status: 404, meta: { secret: 'JBSWY3DP', totp_url: 'otpauth://x' } } }

describe('ProfileTwoFactorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticators.mockResolvedValue({ data: { status: 200, data: [] } })
  })

  it('builds the AuthApi client from the request origin, forwarding the cookie', async () => {
    totpStatus.mockResolvedValue(NOT_SET_UP)

    render(await ProfileTwoFactorPage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', {
      cookieHeader: 'sessionid=abc123',
      baseFetch: expect.any(Function),
    })
  })

  it('forwards no cookie header when the request carries none', async () => {
    totpStatus.mockResolvedValue(NOT_SET_UP)
    cookieHeader = undefined

    render(await ProfileTwoFactorPage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', {
      cookieHeader: undefined,
      baseFetch: expect.any(Function),
    })
    cookieHeader = 'sessionid=abc123'
  })

  it('offers enrollment with the secret allauth just issued, and no recovery codes yet', async () => {
    totpStatus.mockResolvedValue(NOT_SET_UP)

    render(await ProfileTwoFactorPage())

    expect(screen.getByTestId('totp-secret').textContent).toBe('JBSWY3DP')
    expect(screen.queryByText('Recovery codes')).toBeNull()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('shows an active TOTP, the codes left, and every passkey', async () => {
    totpStatus.mockResolvedValue({ data: { status: 200, data: { type: 'totp' } } })
    authenticators.mockResolvedValue({
      data: {
        status: 200,
        data: [
          { type: 'totp', created_at: 1, last_used_at: null },
          { type: 'recovery_codes', created_at: 1, last_used_at: null, unused_code_count: 9, total_code_count: 10 },
          { type: 'webauthn', id: 4, name: 'Laptop', created_at: 1700000000, last_used_at: null },
        ],
      },
    })

    render(await ProfileTwoFactorPage())

    expect(screen.getByText('On')).toBeTruthy()
    expect(screen.getByText('9 of 10 codes left.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove Laptop' })).toBeTruthy()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it("passes on allauth's reason when enrolling is refused", async () => {
    totpStatus.mockResolvedValue({
      data: undefined,
      error: { status: 409, errors: [{ code: 'unverified_email', message: 'Verify your email first.' }] },
    })

    render(await ProfileTwoFactorPage())

    expect(screen.getByText('Verify your email first.')).toBeTruthy()
  })

  it('asks for a proof before handing out a secret when the backend wants one first', async () => {
    totpStatus.mockResolvedValue({
      data: undefined,
      // A reason alongside the demand is not shown: the proof comes first, and the page asks again after.
      error: { status: 401, errors: [{ code: 'x', message: 'Not this.' }], meta: { is_authenticated: true } },
      response: new Response(null, { status: 401, headers: { 'X-Reauthentication-Required': '1' } }),
    })

    render(await ProfileTwoFactorPage())

    expect(screen.getByRole('link', { name: 'Turn on' }).getAttribute('href')).toBe(
      '/auth/prove?next=%2Fprofile%2Ftwo-factor'
    )
    expect(screen.queryByText('Not this.')).toBeNull()
    expect(screen.queryByTestId('totp-secret')).toBeNull()
  })

  it('reads only the gate saying so as a demand for a proof', async () => {
    totpStatus.mockResolvedValue({
      ...NOT_SET_UP,
      response: new Response(null, { status: 404, headers: { 'X-Reauthentication-Required': '0' } }),
    })

    render(await ProfileTwoFactorPage())

    expect(screen.queryByRole('link', { name: 'Turn on' })).toBeNull()
    expect(screen.getByTestId('totp-secret').textContent).toBe('JBSWY3DP')
  })

  it('treats a failed authenticator listing as having none', async () => {
    totpStatus.mockResolvedValue(NOT_SET_UP)
    authenticators.mockResolvedValue({ data: undefined })

    render(await ProfileTwoFactorPage())

    expect(screen.queryByRole('list')).toBeNull()
  })

  it('still offers enrollment when a refusal carries an empty error list', async () => {
    totpStatus.mockResolvedValue({ data: undefined, error: { status: 409, errors: [] } })

    render(await ProfileTwoFactorPage())

    expect(screen.getByRole('button', { name: 'Turn on' })).toBeTruthy()
  })
})
