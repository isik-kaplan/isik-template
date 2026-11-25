import AdminHomePage from '@/app/admin/page'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const redirect = vi.fn()
vi.mock('next/navigation', () => ({
  redirect: (to: string) => redirect(to),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/config/public', () => ({ CONFIG: { OAUTH_PROVIDER: { MODE: 'approval' } } }))
const me = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me }) }))

describe('AdminHomePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    [
      'the people, for whoever reads them',
      { is_staff: false, is_superuser: false, permissions: ['users:manage:user'] },
      '/people',
    ],
    [
      'the app approvals, for a superuser who reads nobody',
      { is_staff: false, is_superuser: true, permissions: [] },
      '/app-approvals',
    ],
  ])('opens on %s', async (_case, data, to) => {
    me.mockResolvedValue({ data })

    await AdminHomePage()

    expect(redirect).toHaveBeenCalledWith(to)
  })

  it.each([
    ['nobody asking', undefined],
    ['somebody with no part of it to see', { is_staff: false, is_superuser: false, permissions: [] }],
  ])('is not found for %s', async (_case, data) => {
    me.mockResolvedValue({ data })

    await expect(AdminHomePage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(redirect).not.toHaveBeenCalled()
  })
})
