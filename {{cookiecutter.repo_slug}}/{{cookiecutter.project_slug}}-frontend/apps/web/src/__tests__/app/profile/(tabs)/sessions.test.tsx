import ProfileSessionsPage from '@/app/profile/(tabs)/sessions/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const sessions = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({ AuthApi }))
AuthApi.mockImplementation(() => ({ sessions }))

let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => {
    const init: Record<string, string> = { host: 'test-project.test' }
    if (cookieHeader !== undefined) init.cookie = cookieHeader
    return new Headers(init)
  },
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

describe('ProfileSessionsPage', () => {
  it("renders the visitor's sessions", async () => {
    sessions.mockResolvedValue({
      data: { data: [{ id: 1, is_current: true, ip: '127.0.0.1', user_agent: '', created_at: 1700000000 }] },
    })

    render(await ProfileSessionsPage())

    expect(screen.getByText(/127\.0\.0\.1/)).toBeTruthy()
  })

  it('renders an empty list when the backend returns no data', async () => {
    sessions.mockResolvedValue({ data: undefined })

    const { container } = render(await ProfileSessionsPage())

    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('builds the AuthApi client from the request origin, forwarding the incoming cookie header', async () => {
    sessions.mockResolvedValue({ data: undefined })

    render(await ProfileSessionsPage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: 'sessionid=abc123' })
  })

  it('defaults cookieHeader to undefined when the request carries no cookie', async () => {
    sessions.mockResolvedValue({ data: undefined })
    cookieHeader = undefined

    render(await ProfileSessionsPage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: undefined })
    cookieHeader = 'sessionid=abc123'
  })
})
