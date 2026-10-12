import ProfileApplicationsPage from '@/app/profile/(tabs)/applications/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'public' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
const authorizedApplications = vi.fn()
const oauthApplications = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ authorizedApplications, oauthApplications }) }))
vi.mock('@/components/app-auth/AuthorizedApplicationsList', () => ({
  AuthorizedApplicationsList: ({ initialApplications }: { initialApplications: { name: string }[] }) => (
    <p>authorized: {initialApplications.map((application) => application.name).join(',')}</p>
  ),
}))
vi.mock('@/components/app-auth/RegisteredApplications', () => ({
  RegisteredApplications: ({ initialApplications }: { initialApplications: { name: string }[] }) => (
    <p>registered: {initialApplications.map((application) => application.name).join(',')}</p>
  ),
}))

describe('ProfileApplicationsPage', () => {
  beforeEach(() => {
    CONFIG.OAUTH_PROVIDER.MODE = 'public'
    authorizedApplications.mockResolvedValue({ data: [{ name: 'Acme' }] })
    oauthApplications.mockResolvedValue({ data: { results: [{ name: 'Mine' }] } })
  })

  it('is not found while the backend is not an OAuth provider', async () => {
    CONFIG.OAUTH_PROVIDER.MODE = 'off'

    await expect(ProfileApplicationsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(authorizedApplications).not.toHaveBeenCalled()
  })

  it('shows the applications let in and the ones registered', async () => {
    render(await ProfileApplicationsPage())

    expect(screen.getByText('authorized: Acme')).toBeTruthy()
    expect(screen.getByText('registered: Mine')).toBeTruthy()
  })

  it('leaves out registering for somebody the mode does not let register', async () => {
    oauthApplications.mockResolvedValue({ data: undefined, error: { detail: 'no' } })

    render(await ProfileApplicationsPage())

    expect(screen.getByText('authorized: Acme')).toBeTruthy()
    expect(screen.queryByText(/registered:/)).toBeNull()
  })

  it('still renders when the applications let in cannot be read', async () => {
    authorizedApplications.mockResolvedValue({ data: undefined })

    render(await ProfileApplicationsPage())

    expect(screen.getByText('authorized:')).toBeTruthy()
  })
})
