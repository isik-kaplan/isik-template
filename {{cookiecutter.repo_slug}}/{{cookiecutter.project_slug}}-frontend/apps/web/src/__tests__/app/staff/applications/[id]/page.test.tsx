import ApplicationReviewPage from '@/app/staff/applications/[id]/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))
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
vi.mock('@/components/app-applications/ApprovalPanel', () => ({
  ApprovalPanel: ({ application, scopes }: { application: { id: number }; scopes: { name: string }[] }) => (
    <p>
      answer {application.id} with {JSON.stringify(scopes.map((scope) => scope.name))}
    </p>
  ),
}))
const me = vi.fn()
const oauthApplicationReview = vi.fn()
const delegatableScopes = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, oauthApplicationReview, delegatableScopes }) }))

const ACME = {
  id: 7,
  name: 'Acme',
  description: 'Notes',
  client_id: 'acme-client',
  approval: 'approved',
  owner: 'bob',
  authorization_grant_type: 'authorization-code',
  redirect_uris: ['https://a.test/cb', 'https://a.test/other'],
  requested_scopes: ['users:grant:rights', 'users:manage:user'],
  approved_scopes: [],
}
const page = (id = '7') => ApplicationReviewPage({ params: Promise.resolve({ id }) })

describe('ApplicationReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
    me.mockResolvedValue({ data: { is_superuser: true } })
    oauthApplicationReview.mockResolvedValue({ data: ACME })
    delegatableScopes.mockResolvedValue({
      data: [
        { name: 'users:grant:rights', label: 'Grant' },
        { name: 'users:manage:user', label: 'Manage people' },
      ],
    })
  })

  it('shows whose it is, where it signs people in to, and what it asked for and was let have', async () => {
    render(await page('7'))

    expect(oauthApplicationReview).toHaveBeenCalledWith(7)
    expect(screen.getByRole('heading').textContent).toBe('Acme')
    expect(screen.getByTestId('description').textContent).toBe('Notes')
    expect(screen.getByRole('link', { name: 'Back to app approvals' }).getAttribute('href')).toBe('/staff/applications')
    expect(screen.getByText('Approved')).toBeTruthy()
    const value = (label: string) => screen.getByText(label).nextElementSibling?.textContent
    expect(value('Registered by')).toBe('bob')
    expect(value('Client ID')).toBe('acme-client')
    expect(value('How it signs people in')).toBe('Signs people in through their browser')
    expect(value('Redirect URIs, one per line')).toBe('https://a.test/cb · https://a.test/other')
    expect(value('What it asks to do for the people who sign in')).toBe('Grant · Manage people')
    expect(value('Approved to ask for')).toBe('Signing people in, nothing more')
    expect(screen.getByText('answer 7 with ["users:grant:rights","users:manage:user"]')).toBeTruthy()
  })

  it('shows no redirect URIs for a device, which is sent back nowhere', async () => {
    oauthApplicationReview.mockResolvedValue({
      data: { ...ACME, authorization_grant_type: 'urn:ietf:params:oauth:grant-type:device_code', redirect_uris: [] },
    })

    render(await page())

    expect(screen.getByText('How it signs people in').nextElementSibling?.textContent).toBe(
      'Shows a code to enter here, like a command line'
    )
    expect(screen.queryByText('Redirect URIs, one per line')).toBeNull()
  })

  it('answers with no scopes to offer when they cannot be read', async () => {
    delegatableScopes.mockResolvedValue({ data: undefined })

    render(await page())

    expect(screen.getByText('answer 7 with []')).toBeTruthy()
    expect(screen.getByText('users:grant:rights · users:manage:user')).toBeTruthy()
  })

  it.each([
    ['nobody asking', { data: undefined }, { data: ACME }],
    ['nothing there', { data: { is_superuser: true } }, { data: undefined }],
    ['somebody not a superuser', { data: { is_superuser: false } }, { data: ACME }],
  ])('is not found for %s', async (_case, asking, read) => {
    me.mockResolvedValue(asking)
    oauthApplicationReview.mockResolvedValue(read)

    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
