import NewGroupPage from '@/app/admin/groups/new/page'

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
  GroupForm: ({ permissions }: { permissions: unknown }) => <p>new group of {JSON.stringify(permissions)}</p>,
}))
const me = vi.fn()
const permissions = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, permissions }) }))

describe('NewGroupPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: true, permissions: [] } })
    permissions.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
  })

  it('offers a new group of what there is to give, and the way back', async () => {
    render(await NewGroupPage())

    expect(screen.getByRole('heading').textContent).toBe('New group')
    expect(screen.getByText('new group of [{"name":"users:manage:user","label":"Manage people"}]')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Back to groups' }).getAttribute('href')).toBe('/groups')
  })

  it('offers nothing to give when that cannot be read', async () => {
    permissions.mockResolvedValue({ data: undefined })

    render(await NewGroupPage())

    expect(screen.getByText('new group of []')).toBeTruthy()
  })

  it.each([{ data: undefined }, { data: { is_staff: true, is_superuser: false, permissions: [] } }])(
    'is not found for somebody who may not grant',
    async (answer) => {
      me.mockResolvedValue(answer)

      await expect(NewGroupPage()).rejects.toThrow('NEXT_NOT_FOUND')
    }
  )
})
