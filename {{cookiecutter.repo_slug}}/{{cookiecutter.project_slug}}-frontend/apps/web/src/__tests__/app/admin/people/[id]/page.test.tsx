import PersonPage from '@/app/admin/people/[id]/page'

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
vi.mock('@/components/app-people/ManageUserForm', () => ({
  ManageUserForm: ({
    user,
    permissions,
    groups,
  }: {
    user: { username: string }
    permissions: unknown
    groups: unknown
  }) => (
    <p>
      manage {user.username} with {JSON.stringify(permissions)} in {JSON.stringify(groups)}
    </p>
  ),
}))
const me = vi.fn()
const user = vi.fn()
const permissions = vi.fn()
const groups = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, user, permissions, groups }) }))

const BOB = { id: 'u2', username: 'bob', email: 'bob@x.test', terms_version: 'abc123', terms_accepted_at: '2026-01-02' }
const page = (id = 'u2') => PersonPage({ params: Promise.resolve({ id }) })

describe('PersonPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue({ data: { id: 'u1', is_staff: false, permissions: ['users:manage:user'] } })
    user.mockResolvedValue({ data: BOB })
    permissions.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
    groups.mockResolvedValue({ data: { results: [{ id: 'g1', name: 'ops', permissions: [] }] } })
  })

  it('reads the account the address names', async () => {
    render(await page('u2'))

    expect(user).toHaveBeenCalledWith('u2')
    expect(screen.getByRole('heading').textContent).toBe('bob')
    expect(screen.getByTestId('description').textContent).toBe('bob@x.test')
    expect(screen.getByRole('link', { name: 'Back to people' }).getAttribute('href')).toBe('/people')
  })

  it('lets whoever manages people change it', async () => {
    render(await page())

    expect(
      screen.getByText(
        'manage bob with [{"name":"users:manage:user","label":"Manage people"}] in [{"id":"g1","name":"ops"}]'
      )
    ).toBeTruthy()
    expect(groups).toHaveBeenCalledWith({ page_size: 100 })
  })

  it('manages with no permissions or groups to offer when they cannot be read', async () => {
    permissions.mockResolvedValue({ data: undefined })
    groups.mockResolvedValue({ data: undefined })

    render(await page())

    expect(screen.getByText('manage bob with [] in []')).toBeTruthy()
  })

  it('shows which terms they accepted, and when', async () => {
    render(await page())

    expect(screen.getByText('Terms accepted').nextElementSibling?.textContent).toBe('abc123')
    expect(screen.getByText('Accepted at').nextElementSibling?.textContent).toBe('2026-01-02')
  })

  it('says so where they accepted none', async () => {
    user.mockResolvedValue({ data: { ...BOB, terms_version: '', terms_accepted_at: null } })

    render(await page())

    expect(screen.getAllByText('None')).toHaveLength(2)
  })

  it('only shows it to staff who may read but not manage', async () => {
    me.mockResolvedValue({ data: { id: 'u1', is_staff: true, permissions: [] } })

    render(await page())

    expect(screen.getByText('You can read this account, but not change it.')).toBeTruthy()
    expect(screen.queryByText(/manage bob/)).toBeNull()
  })

  it('says somebody else changes your own', async () => {
    me.mockResolvedValue({ data: { id: 'u2', is_staff: true, permissions: ['users:manage:user'] } })

    render(await page())

    expect(screen.getByText('This is you. Somebody else changes what you may do.')).toBeTruthy()
    expect(screen.queryByText(/manage bob/)).toBeNull()
  })

  it.each([
    ['nobody asking', { data: undefined }, { data: BOB }],
    ['nobody there', { data: { id: 'u1', is_staff: true, permissions: [] } }, { data: undefined }],
    ['somebody who reads nobody', { data: { id: 'u1', is_staff: false, permissions: [] } }, { data: BOB }],
  ])('is not found for %s', async (_case, asking, read) => {
    me.mockResolvedValue(asking)
    user.mockResolvedValue(read)

    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
