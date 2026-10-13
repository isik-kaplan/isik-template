import ApplicationsPage from '@/app/applications/page'
import auth from '@/locales/en/auth.json'

import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('@/components/app/PageShell', () => ({
  PageShell: ({
    title,
    description,
    backHref,
    backLabel,
    children,
  }: {
    title: string
    description?: string
    backHref: string
    backLabel: string
    children: React.ReactNode
  }) => (
    <main>
      <h1>{title}</h1>
      <p data-testid="description">{description}</p>
      <a href={backHref}>{backLabel}</a>
      {children}
    </main>
  ),
}))
const oauthApplications = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ oauthApplications }) }))

describe('ApplicationsPage', () => {
  beforeEach(() => {
    oauthApplications.mockResolvedValue({
      data: {
        results: [
          { id: 7, name: 'Acme', approval: 'approved', client_id: 'acme-client' },
          { id: 8, name: 'Beta', approval: 'pending', client_id: 'beta-client' },
        ],
      },
    })
  })

  it('lists each application with where it stands, and how to register another', async () => {
    render(await ApplicationsPage())

    expect(screen.getByRole('heading').textContent).toBe('Your apps')
    expect(screen.getByTestId('description').textContent).toBe(
      `Register an app so its users can sign in with their ${auth.appTitle} account, and let it act for them if they agree.`
    )
    expect(screen.getByRole('link', { name: 'Back to home' }).getAttribute('href')).toBe('/')
    expect(screen.getByRole('link', { name: 'Register an app' }).getAttribute('href')).toBe('/applications/new')
    const acme = screen.getByRole('link', { name: 'Acme' })
    expect(acme.getAttribute('href')).toBe('/applications/7')
    const row = within(acme.closest('li') as HTMLElement)
    expect(row.getByText('Approved')).toBeTruthy()
    expect(row.getByText('acme-client')).toBeTruthy()
    expect(
      within(screen.getByRole('link', { name: 'Beta' }).closest('li') as HTMLElement).getByText('Waiting for approval')
    ).toBeTruthy()
  })

  it.each([{ data: { results: [] } }, { data: undefined }])('says when there is none', async (answer) => {
    oauthApplications.mockResolvedValue(answer)

    render(await ApplicationsPage())

    expect(screen.getByText('You have not registered an app.')).toBeTruthy()
    expect(screen.queryByRole('list')).toBeNull()
  })
})
