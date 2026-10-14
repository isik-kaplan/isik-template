import ApplicationPage from '@/app/applications/[id]/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
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
vi.mock('@/components/app-applications/EditApplicationForm', () => ({
  EditApplicationForm: ({ scopes }: { scopes: { name: string }[] }) => (
    <p>edit with {JSON.stringify(scopes.map((scope) => scope.name))}</p>
  ),
}))
vi.mock('@/components/app-applications/RotateSecretPanel', () => ({
  RotateSecretPanel: ({ applicationId, clientId }: { applicationId: number; clientId: string }) => (
    <p>
      rotate {applicationId} {clientId}
    </p>
  ),
}))
vi.mock('@/components/app-applications/ApplicationLifecycle', () => ({
  ApplicationLifecycle: ({ application }: { application: { approval: string } }) => (
    <p>lifecycle {application.approval}</p>
  ),
}))
const oauthApplication = vi.fn()
const delegatableScopes = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ oauthApplication, delegatableScopes }) }))

const ACME = {
  id: 7,
  name: 'Acme',
  description: 'Notes',
  client_id: 'acme-client',
  client_type: 'confidential',
  authorization_grant_type: 'authorization-code',
  approval: 'approved',
  requested_scopes: ['users:grant:rights', 'users:manage:user'],
  approved_scopes: ['users:manage:user'],
}

const page = (id = '7') => ApplicationPage({ params: Promise.resolve({ id }) })

describe('ApplicationPage', () => {
  beforeEach(() => {
    oauthApplication.mockResolvedValue({ data: ACME })
    delegatableScopes.mockResolvedValue({
      data: [
        { name: 'users:grant:rights', label: 'Grant' },
        { name: 'users:manage:user', label: 'Manage people' },
      ],
    })
  })

  it('reads the application the address names', async () => {
    render(await page('7'))

    expect(oauthApplication).toHaveBeenCalledWith(7)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Acme')
    expect(screen.getByTestId('description').textContent).toBe('Notes')
    expect(screen.getByRole('link', { name: 'Back to your apps' }).getAttribute('href')).toBe('/applications')
  })

  it('is not found when it is not one of theirs', async () => {
    oauthApplication.mockResolvedValue({ data: undefined })

    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('shows where it stands, its client id, what it was approved for and what still waits', async () => {
    render(await page())

    expect(screen.getByText('Approved')).toBeTruthy()
    expect(screen.getByText('Client ID').nextElementSibling?.textContent).toBe('acme-client')
    expect(screen.getByText('How it signs people in').nextElementSibling?.textContent).toBe(
      'Signs people in through their browser'
    )
    expect(screen.getByText('Approved to ask for').nextElementSibling?.textContent).toBe('Manage people')
    expect(screen.getByText('Waiting for a superuser before it can ask for: Grant')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Client secret' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Switching it off' })).toBeTruthy()
    expect(screen.getByText('edit with ["users:grant:rights","users:manage:user"]')).toBeTruthy()
    expect(screen.getByText('rotate 7 acme-client')).toBeTruthy()
    expect(screen.getByText('lifecycle approved')).toBeTruthy()
  })

  it('lists everything it was approved for, and everything that still waits', async () => {
    oauthApplication.mockResolvedValue({
      data: { ...ACME, requested_scopes: ['a:x:y', 'b:x:y', 'c:x:y', 'd:x:y'], approved_scopes: ['a:x:y', 'b:x:y'] },
    })

    render(await page())

    expect(screen.getByText('Approved to ask for').nextElementSibling?.textContent).toBe('a:x:y · b:x:y')
    expect(screen.getByText('Waiting for a superuser before it can ask for: c:x:y · d:x:y')).toBeTruthy()
  })

  it('says it signs people in and nothing more when it was approved for nothing beyond', async () => {
    oauthApplication.mockResolvedValue({ data: { ...ACME, requested_scopes: undefined, approved_scopes: [] } })
    delegatableScopes.mockResolvedValue({ data: undefined })

    render(await page())

    expect(screen.getByText('Signing people in, nothing more')).toBeTruthy()
    expect(screen.queryByText(/Waiting for a superuser/)).toBeNull()
    expect(screen.getByText('edit with []')).toBeTruthy()
  })

  it.each([
    ['urn:ietf:params:oauth:grant-type:device_code', 'Shows a code to enter here, like a command line'],
    [undefined, 'Signs people in through their browser'],
  ])('says how one signing people in with %s does it', async (grant, said) => {
    oauthApplication.mockResolvedValue({ data: { ...ACME, authorization_grant_type: grant } })

    render(await page())

    expect(screen.getByText('How it signs people in').nextElementSibling?.textContent).toBe(said)
  })

  it('has no secret to rotate for a public application', async () => {
    oauthApplication.mockResolvedValue({ data: { ...ACME, client_type: 'public' } })

    render(await page())

    expect(screen.queryByText(/rotate/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Client secret' })).toBeNull()
  })
})
