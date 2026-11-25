import SiteSettingsPage from '@/app/admin/settings/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/app/PageShell', async () => ({ PageShell: (await import('../shell')).TestPageShell }))
vi.mock('@/components/app-admin/SiteSettingsForm', () => ({
  SiteSettingsForm: ({
    settings,
    etag,
    isSuperuser,
  }: {
    settings: { login_policy: string }
    etag: string
    isSuperuser: boolean
  }) => (
    <p>
      {settings.login_policy} at {etag}, {isSuperuser ? 'superuser' : 'staff'}
    </p>
  ),
}))
const me = vi.fn()
const siteSettings = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, siteSettings }) }))

const answered = (data: unknown) => ({ data, response: new Response(null, { headers: { ETag: '"2"' } }) })

describe('SiteSettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue({ data: { is_staff: true, is_superuser: false, permissions: [] } })
    siteSettings.mockResolvedValue(answered({ login_policy: 'staff' }))
  })

  it('offers staff the settings as they stand, against the version read', async () => {
    render(await SiteSettingsPage())

    expect(screen.getByRole('heading').textContent).toBe('Site settings')
    expect(screen.getByText('staff at "2", staff')).toBeTruthy()
  })

  it.each([
    ['nobody asking', { data: undefined }, answered({ login_policy: 'staff' })],
    [
      'settings that could not be read',
      { data: { is_staff: true, is_superuser: true, permissions: [] } },
      answered(undefined),
    ],
    ['somebody not staff', { data: { is_staff: false, is_superuser: false, permissions: [] } }, answered({})],
  ])('is not found for %s', async (_case, asking, read) => {
    me.mockResolvedValue(asking)
    siteSettings.mockResolvedValue(read)

    await expect(SiteSettingsPage()).rejects.toThrow('NEXT_NOT_FOUND')
  })
})
