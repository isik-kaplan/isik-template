import AdminLayout from '@/app/admin/layout'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireSession = vi.fn()
vi.mock('@/lib/getSession', () => ({ requireSession: () => requireSession(), getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ host: 'admin.example.test' }) }))
vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'example.test', OAUTH_PROVIDER: { MODE: 'approval' } } }))
vi.mock('@/lib/sessionChannel', () => ({ LOGIN_PATH: '/auth/login', onSessionCleared: () => () => {} }))
const me = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me }) }))

const links = () => screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])

describe('AdminLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requires a session, then lists the parts of the admin and the way back to the app', async () => {
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: true, permissions: [] } })

    render(await AdminLayout({ children: <p>content</p> }))

    expect(requireSession).toHaveBeenCalledOnce()
    expect(screen.getByRole('navigation', { name: 'Admin' })).toBeTruthy()
    expect(links()).toEqual([
      ['People', '/people'],
      ['Groups', '/groups'],
      ['App approvals', '/app-approvals'],
      ['Site settings', '/settings'],
      ['Back to the app', 'http://example.test'],
    ])
    expect(screen.getByText('content')).toBeTruthy()
  })

  it.each([
    ['nobody asking', undefined],
    ['somebody with no part of it to see', { is_staff: false, is_superuser: false, permissions: [] }],
  ])('is not found for %s', async (_case, data) => {
    me.mockResolvedValue({ data })

    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
