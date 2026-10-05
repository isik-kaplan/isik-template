import ProvePage from '@/app/auth/prove/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const reauthenticationFlows = vi.fn()
const Api = vi.hoisted(() => vi.fn())
const redirect = vi.hoisted(() => vi.fn())
const requireSession = vi.hoisted(() => vi.fn())

vi.mock('@{{ cookiecutter.repo_slug }}/api', () => ({ Api }))
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en', requireSession }))
vi.mock('next/navigation', () => ({ redirect, useRouter: () => ({ replace: vi.fn() }) }))
const HOST = '{{ cookiecutter.repo_slug }}.test'
let cookieHeader: string | undefined = 'sessionid=abc123'
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ host: HOST, ...(cookieHeader ? { cookie: cookieHeader } : {}) }),
}))
Api.mockImplementation(() => ({ reauthenticationFlows }))

describe('ProvePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    reauthenticationFlows.mockResolvedValue({ data: [{ id: 'reauthenticate' }] })
  })

  it('offers the ways this person can prove it, with a way back to where they were', async () => {
    render(await ProvePage({ searchParams: Promise.resolve({ next: '/profile/emails' }) }))

    expect(screen.getByText("Confirm it's you")).toBeTruthy()
    expect(screen.getByText("For your security, confirm it's you before you continue.")).toBeTruthy()
    expect(screen.getByLabelText('Password')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/profile/emails')
    expect(Api).toHaveBeenCalledWith(`http://api.${HOST}`, { cookieHeader: 'sessionid=abc123' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('forwards no cookie header when the request carries none', async () => {
    cookieHeader = undefined

    render(await ProvePage({ searchParams: Promise.resolve({}) }))

    expect(Api).toHaveBeenCalledWith(`http://api.${HOST}`, { cookieHeader: undefined })
    cookieHeader = 'sessionid=abc123'
  })

  it('sends somebody signed out to sign in first, and back here afterwards', async () => {
    render(await ProvePage({ searchParams: Promise.resolve({ next: '/profile/emails' }) }))

    expect(requireSession).toHaveBeenCalledWith('/auth/login?next=%2Fauth%2Fprove%3Fnext%3D%252Fprofile%252Femails')
  })

  it('goes straight on to where they were once a provider says it was them', async () => {
    await ProvePage({ searchParams: Promise.resolve({ next: '/profile/emails', proved: '1' }) })

    expect(redirect).toHaveBeenCalledWith('/profile/emails')
  })

  it('never sends anybody off the site, whatever the link says', async () => {
    render(await ProvePage({ searchParams: Promise.resolve({ next: 'https://elsewhere.example', proved: '1' }) }))

    expect(redirect).toHaveBeenCalledWith('/')
  })

  it('points a provider at this page to come back to, through the backend endpoint that sends them', async () => {
    HTMLFormElement.prototype.submit = vi.fn()
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 }))
    reauthenticationFlows.mockResolvedValue({
      data: [{ id: 'provider_reauthenticate', providers: [{ id: 'authentik', name: 'Authentik' }] }],
    })
    render(await ProvePage({ searchParams: Promise.resolve({ next: '/profile/emails' }) }))

    screen.getByRole('button', { name: 'Confirm with Authentik' }).click()
    await vi.waitFor(() => expect(document.querySelector('form')).toBeTruthy())

    const form = document.querySelector('form') as HTMLFormElement
    expect(form.getAttribute('action')).toBe(`http://auth.${HOST}/v0/browser/v1/auth/provider/reauthenticate`)
    expect((form.elements.namedItem('callback_url') as HTMLInputElement).value).toBe(
      `http://${HOST}/auth/prove?next=%2Fprofile%2Femails`
    )
    form.remove()
  })

  it('says when a provider came back without a proof, and copes with no answer at all', async () => {
    reauthenticationFlows.mockResolvedValue({ data: undefined })

    render(await ProvePage({ searchParams: Promise.resolve({ error: 'reauthentication_failed' }) }))

    expect(screen.getByText('We could not confirm it was you. Try again.')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/')
    expect(screen.getByText("There is no way to confirm it's you on this account. Contact support.")).toBeTruthy()
  })
})
