import GroupsPage from '@/app/admin/groups/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/app/PageShell', async () => ({ PageShell: (await import('../shell')).TestPageShell }))
const ResourcePaginator = vi.fn(async ({ totalPages }: { totalPages: number }) => <p>pages {totalPages}</p>)
vi.mock('@/components/app/ResourcePaginator', () => ({
  ResourcePaginator: (props: { totalPages: number }) => ResourcePaginator(props),
}))
const me = vi.fn()
const groups = vi.fn()
const permissions = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, groups, permissions }) }))

const page = (asked: Record<string, string> = {}) => GroupsPage({ searchParams: Promise.resolve(asked) })
const links = () => screen.queryAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])

describe('GroupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: true, permissions: [] } })
    permissions.mockResolvedValue({ data: [{ name: 'users:manage:user', label: 'Manage people' }] })
    groups.mockResolvedValue({
      data: {
        total_pages: 2,
        results: [
          { id: 'g1', name: 'ops', permissions: ['users:grant:rights', 'users:manage:user'] },
          { id: 'g2', name: 'empty', permissions: [] },
          { id: 'g3', name: 'unsaid' },
        ],
      },
    })
  })

  it.each([{ data: undefined }, { data: { is_staff: false, is_superuser: false, permissions: [] } }])(
    'is not found for somebody who does not read everybody',
    async (answer) => {
      me.mockResolvedValue(answer)

      await expect(page()).rejects.toThrow('NEXT_NOT_FOUND')
      expect(groups).not.toHaveBeenCalled()
    }
  )

  it('lists every group and what it gives, a page at a time, with a way to make another', async () => {
    render(await page({ page: '2' }))

    expect(groups).toHaveBeenCalledWith({ page: 2, page_size: 25 })
    expect(screen.getByRole('heading').textContent).toBe('Groups')
    expect(screen.getByTestId('description').textContent).toBe('Everybody in a group holds what it gives.')
    // No filters on groups, so the pages carry none either.
    expect(ResourcePaginator).toHaveBeenCalledWith({ specs: [], asked: { page: '2' }, totalPages: 2 })
    expect(links()).toEqual([
      ['New group', '/groups/new'],
      ['ops', '/groups/g1'],
      ['empty', '/groups/g2'],
      ['unsaid', '/groups/g3'],
    ])
    // In the declarations' words, and a name nothing declares as it is.
    expect(screen.getByText('users:grant:rights · Manage people')).toBeTruthy()
    expect(screen.getAllByText('Gives nothing')).toHaveLength(2)
    expect(screen.getByText('pages 2')).toBeTruthy()
  })

  it('offers no new group to somebody who may only read them', async () => {
    me.mockResolvedValue({ data: { is_staff: false, is_superuser: false, permissions: ['users:manage:user'] } })

    render(await page())

    expect(screen.queryByRole('link', { name: 'New group' })).toBeNull()
  })

  it('says so when there are none, or the answer had none', async () => {
    groups.mockResolvedValue({ data: undefined })

    render(await page())

    expect(screen.getByText('No groups.')).toBeTruthy()
    expect(screen.getByText('pages 0')).toBeTruthy()
  })
})
