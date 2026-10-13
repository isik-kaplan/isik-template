import ProfileApplicationsPage from '@/app/profile/(tabs)/applications/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
const authorizedApplications = vi.fn()
const delegatableScopes = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ authorizedApplications, delegatableScopes }) }))
vi.mock('@/components/app-auth/AuthorizedApplicationsList', () => ({
  AuthorizedApplicationsList: ({
    initialApplications,
    described,
  }: {
    initialApplications: { name: string }[]
    described: Record<string, string>
  }) => (
    <>
      <p>authorized: {initialApplications.map((application) => application.name).join(',')}</p>
      <p data-testid="authorized-count">{initialApplications.length}</p>
      <p>described: {JSON.stringify(Object.entries(described))}</p>
    </>
  ),
}))

describe('ProfileApplicationsPage', () => {
  beforeEach(() => {
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
    authorizedApplications.mockResolvedValue({ data: [{ name: 'Acme' }] })
    delegatableScopes.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
  })

  it('is not found while the backend is not an OAuth provider', async () => {
    CONFIG.OAUTH_PROVIDER.MODE = 'off'

    await expect(ProfileApplicationsPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(authorizedApplications).not.toHaveBeenCalled()
  })

  it("shows the applications let in, in the backend's words, and where to register one", async () => {
    render(await ProfileApplicationsPage())

    expect(screen.getByText('authorized: Acme')).toBeTruthy()
    expect(screen.getByText('described: [["users:manage:user","Manage people"]]')).toBeTruthy()
    const register = screen.getByRole('link', { name: 'Register it' })
    expect(register.getAttribute('href')).toBe('/applications')
    expect(register.parentElement?.textContent).toBe(
      'Building an app that signs people in with this account? Register it'
    )
  })

  it('still renders when nothing could be read', async () => {
    authorizedApplications.mockResolvedValue({ data: undefined })
    delegatableScopes.mockResolvedValue({ data: undefined })

    render(await ProfileApplicationsPage())

    expect(screen.getByTestId('authorized-count').textContent).toBe('0')
    expect(screen.getByText('described: []')).toBeTruthy()
  })
})
