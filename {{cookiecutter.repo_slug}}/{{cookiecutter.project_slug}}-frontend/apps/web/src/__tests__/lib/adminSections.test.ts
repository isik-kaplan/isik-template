import { adminSections } from '@/lib/adminSections'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/public', () => ({ CONFIG: { OAUTH_PROVIDER: { MODE: 'approval' } } }))

type Me = Parameters<typeof adminSections>[0]
const me = (fields: Partial<Record<'is_staff' | 'is_superuser', boolean>> & { permissions?: string[] } = {}) =>
  ({ is_staff: false, is_superuser: false, permissions: [], ...fields }) as unknown as Me
const hrefs = (asked: Me) => adminSections(asked).map((section) => section.href)

describe('adminSections', () => {
  it('lists every part for a staff superuser, in order', () => {
    expect(hrefs(me({ is_staff: true, is_superuser: true }))).toEqual([
      '/people',
      '/groups',
      '/app-approvals',
      '/settings',
{%- if cookiecutter.background_jobs == "celery-with-beat" %}
      '/scheduled-tasks',
{%- endif %}
    ])
  })

  it('lists the people and groups alone for whoever only manages people', () => {
    expect(hrefs(me({ permissions: ['users:manage:user'] }))).toEqual(['/people', '/groups'])
  })

  it('lists nothing for somebody with no part of it', () => {
    expect(hrefs(me())).toEqual([])
  })
})
