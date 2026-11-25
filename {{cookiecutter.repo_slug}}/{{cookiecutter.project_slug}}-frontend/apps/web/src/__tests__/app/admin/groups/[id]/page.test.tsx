import GroupPage from '@/app/admin/groups/[id]/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/app/PageShell', async () => ({ PageShell: (await import('../../shell')).TestPageShell }))
vi.mock('@/components/app-admin/GroupForm', () => ({
  GroupForm: ({ group, etag, permissions }: { group: { name: string }; etag: string; permissions: unknown }) => (
    <p>
      change {group.name} at {etag} with {JSON.stringify(permissions)}
    </p>
  ),
}))
const me = vi.fn()
const group = vi.fn()
const permissions = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, group, permissions }) }))

const OPS = { id: 'g1', name: 'ops', permissions: ['users:manage:user'] }
const page = (id = 'g1') => GroupPage({ params: Promise.resolve({ id }) })
const answered = (data: unknown) => ({ data, response: new Response(null, { headers: { ETag: '"5"' } }) })

describe('GroupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: true, permissions: [] } })
    group.mockResolvedValue(answered(OPS))
    permissions.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
  })

  it('lets whoever may grant change the group the address names, against the version read', async () => {
    render(await page('g1'))

    expect(group).toHaveBeenCalledWith('g1')
    expect(screen.getByRole('heading').textContent).toBe('ops')
    expect(
      screen.getByText('change ops at "5" with [{"name":"users:manage:user","label":"Manage people"}]')
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to groups' }).getAttribute('href')).toBe('/groups')
  })

  it('changes it with nothing to give when that cannot be read', async () => {
    permissions.mockResolvedValue({ data: undefined })

    render(await page())

    expect(screen.getByText(/with \[\]/)).toBeTruthy()
  })

  it('only shows what it gives to somebody who may read but not grant', async () => {
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: false, permissions: [] } })
    group.mockResolvedValue(answered({ ...OPS, permissions: ['users:grant:rights', 'users:manage:user'] }))

    render(await page())

    expect(screen.getByText('users:grant:rights · users:manage:user')).toBeTruthy()
    expect(screen.queryByText(/change ops/)).toBeNull()
  })

  it.each([[[]], [undefined]])('says a group giving %s gives nothing', async (given) => {
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: false, permissions: [] } })
    group.mockResolvedValue(answered({ ...OPS, permissions: given }))

    render(await page())

    expect(screen.getByText('Gives nothing')).toBeTruthy()
  })

  it.each([
    ['nobody asking', { data: undefined }, answered(OPS)],
    ['no such group', { data: { is_staff: true, is_superuser: true, permissions: [] } }, answered(undefined)],
    ['somebody who reads nobody', { data: { is_staff: false, is_superuser: false, permissions: [] } }, answered(OPS)],
  ])('is not found for %s', async (_case, asking, read) => {
    me.mockResolvedValue(asking)
    group.mockResolvedValue(read)

    await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
