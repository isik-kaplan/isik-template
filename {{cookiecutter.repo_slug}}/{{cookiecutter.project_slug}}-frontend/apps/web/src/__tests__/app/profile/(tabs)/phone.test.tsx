import ProfilePhonePage from '@/app/profile/(tabs)/phone/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const phone = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({ AuthApi }))
AuthApi.mockImplementation(() => ({ phone }))

let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => {
    const init: Record<string, string> = { host: 'test-project.test' }
    if (cookieHeader !== undefined) init.cookie = cookieHeader
    return new Headers(init)
  },
}))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'test-project.test' } }))

describe('ProfilePhonePage', () => {
  it("shows the account's number", async () => {
    phone.mockResolvedValue({ data: { data: [{ phone: '+14155550123', verified: true }] } })

    render(await ProfilePhonePage())

    expect(screen.getByText('+14155550123')).toBeTruthy()
  })

  it('shows no number when the account has none', async () => {
    phone.mockResolvedValue({ data: { data: [] } })

    render(await ProfilePhonePage())

    expect(screen.getByText('This account has no phone number.')).toBeTruthy()
  })

  it('shows no number when the backend answers nothing', async () => {
    phone.mockResolvedValue({ data: undefined })

    render(await ProfilePhonePage())

    expect(screen.getByText('This account has no phone number.')).toBeTruthy()
  })

  it('builds the AuthApi client from the request origin, forwarding the incoming cookie header', async () => {
    phone.mockResolvedValue({ data: undefined })

    render(await ProfilePhonePage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', {
      cookieHeader: 'sessionid=abc123',
      baseFetch: expect.any(Function),
    })
  })

  it('defaults cookieHeader to undefined when the request carries no cookie', async () => {
    cookieHeader = undefined
    phone.mockResolvedValue({ data: undefined })

    render(await ProfilePhonePage())

    expect(AuthApi).toHaveBeenLastCalledWith('http://auth.test-project.test', {
      cookieHeader: undefined,
      baseFetch: expect.any(Function),
    })
  })
})
