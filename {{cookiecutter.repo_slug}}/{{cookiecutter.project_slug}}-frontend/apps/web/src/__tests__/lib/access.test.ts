import { applicationsAreOn, mayReviewApplications, maySeePeople } from '@/lib/access'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))

function me(fields: { is_staff?: boolean; is_superuser?: boolean; permissions?: string[] } = {}) {
  return { is_staff: false, is_superuser: false, permissions: [], ...fields } as unknown as Parameters<
    typeof maySeePeople
  >[0]
}

describe('access', () => {
  beforeEach(() => {
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
  })

  it.each([
    ['off', false],
    ['approval', true],
    ['auto', true],
  ])('has applications while the provider is %s: %s', (mode, on) => {
    CONFIG.OAUTH_PROVIDER.MODE = mode

    expect(applicationsAreOn()).toBe(on)
  })

  it('shows people to staff and to whoever may manage them, and to nobody else', () => {
    expect(maySeePeople(me({ is_staff: true }))).toBe(true)
    expect(maySeePeople(me({ permissions: ['users:manage:user'] }))).toBe(true)
    expect(maySeePeople(me({ permissions: ['users:grant:rights'] }))).toBe(false)
    expect(maySeePeople(me())).toBe(false)
  })

  it('has superusers review applications, while there are any', () => {
    expect(mayReviewApplications(me({ is_superuser: true }))).toBe(true)
    expect(mayReviewApplications(me({ is_staff: true }))).toBe(false)
    CONFIG.OAUTH_PROVIDER.MODE = 'off'
    expect(mayReviewApplications(me({ is_superuser: true }))).toBe(false)
  })
})
