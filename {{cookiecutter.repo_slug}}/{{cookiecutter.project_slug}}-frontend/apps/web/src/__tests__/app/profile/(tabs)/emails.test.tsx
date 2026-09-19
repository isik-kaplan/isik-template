import ProfileEmailsPage from '@/app/profile/(tabs)/emails/page'

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const emails = vi.fn()
const AuthApi = vi.hoisted(() => vi.fn())
vi.mock('@{{ cookiecutter.repo_slug }}/auth-api', () => ({ AuthApi }))
AuthApi.mockImplementation(() => ({ emails }))

let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => {
    const init: Record<string, string> = { host: 'test-project.test' }
    if (cookieHeader !== undefined) init.cookie = cookieHeader
    return new Headers(init)
  },
}))

describe('ProfileEmailsPage', () => {
  it("renders the visitor's email addresses", async () => {
    emails.mockResolvedValue({ data: { data: [{ email: 'jane@test.test', primary: true, verified: true }] } })

    render(await ProfileEmailsPage())

    expect(screen.getByText('jane@test.test')).toBeTruthy()
  })

  it('renders an empty list when the backend returns no data', async () => {
    emails.mockResolvedValue({ data: undefined })

    const { container } = render(await ProfileEmailsPage())

    expect(screen.getByPlaceholderText('Email')).toBeTruthy()
    expect(container.querySelectorAll('li')).toHaveLength(0)
  })

  it('builds the AuthApi client from the request origin, forwarding the incoming cookie header', async () => {
    emails.mockResolvedValue({ data: undefined })

    render(await ProfileEmailsPage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: 'sessionid=abc123' })
  })

  it('defaults cookieHeader to undefined when the request carries no cookie', async () => {
    emails.mockResolvedValue({ data: undefined })
    cookieHeader = undefined

    render(await ProfileEmailsPage())

    expect(AuthApi).toHaveBeenCalledWith('http://auth.test-project.test', { cookieHeader: undefined })
    cookieHeader = 'sessionid=abc123'
  })
})
