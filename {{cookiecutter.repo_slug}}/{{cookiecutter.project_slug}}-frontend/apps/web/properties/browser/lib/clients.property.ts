import type { Translate } from '@/i18n/config'
import * as access from '@/lib/access'
import { applicationsAreOn, mayReviewApplications, maySeePeople } from '@/lib/access'
import { createApi, createAuthApi } from '@/lib/apiClients'
import { askedOf, destinationsFor, searchableResources } from '@/lib/searchableResources'

import { backend, world } from '../../support/backend'
import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

type Me = Parameters<typeof maySeePeople>[0]
// Absent from a project generated without webhooks, where nobody manages any.
const mayManageWebhooks = ((access as Record<string, unknown>).mayManageWebhooks ?? (() => false)) as (
  me: Me
) => boolean

const config = vi.hoisted(() => ({
  DOMAIN: 'test-project.test',
  OAUTH_PROVIDER: { MODE: 'approval' },
  SOCIAL_LOGIN: { PROVIDERS: [], ICONS: [], ADMIN_ONLY: [] },
}))
vi.mock('@/config/public', () => ({ CONFIG: config }))

const t = ((key: string) => key) as unknown as Translate

const mode = fc.constantFrom('off', 'approval', 'auto')

function withLocation(href: string) {
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { href, pathname: '/here', search: '?a=1', origin: 'http://test-project.test' },
  })
}

describe('a client the browser talks to the backend through', () => {
  test.prop([
    fc.constantFrom('X-Session-Cleared', 'X-Reauthentication-Required', 'X-Other'),
    fc.integer({ min: 200, max: 499 }).filter((status) => ![204, 205, 304].includes(status)),
  ])(
    'leaves for login when the session died, for the proof page when asked to prove it, and answers otherwise',
    async (header, status) => {
      withLocation('http://test-project.test/here?a=1')
      const answer = new Response('{}', { status, headers: { [header]: '1', 'Content-Type': 'application/json' } })
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => answer.clone())
      )
      const settled = vi.fn()

      void createApi('http://api.test-project.test').me().then(settled)
      void createAuthApi('http://auth.test-project.test').session().then(settled)
      await new Promise((resolve) => setTimeout(resolve, 10))

      if (header === 'X-Session-Cleared') {
        expect(window.location.href).toBe('/auth/login')
        expect(settled).toHaveBeenCalledTimes(2)
      } else if (header === 'X-Reauthentication-Required') {
        expect(window.location.href).toBe('/auth/prove?next=%2Fhere%3Fa%3D1')
        // Never settles, so no error flashes before the page leaves.
        expect(settled).not.toHaveBeenCalled()
      } else {
        expect(window.location.href).toBe('http://test-project.test/here?a=1')
        expect(settled).toHaveBeenCalledTimes(2)
      }
    }
  )
})

describe('the command palette', () => {
  test.prop([world, mode])('offers only the places this person may go', (w, provider) => {
    config.OAUTH_PROVIDER.MODE = provider
    const me = { ...w.me, permissions: w.me.permissions }
    const hrefs = destinationsFor(me as never, t).map((destination) => destination.href)
    expect(hrefs.slice(0, 3)).toEqual(['/', '/profile', '/profile/notifications'])
    expect(hrefs.includes('/applications')).toBe(applicationsAreOn())
    expect(hrefs.includes('/admin/people')).toBe(maySeePeople(me as never))
    expect(hrefs.includes('/admin/app-approvals')).toBe(mayReviewApplications(me as never))
    expect(hrefs.includes('/webhooks')).toBe(mayManageWebhooks(me as never))
    expect(destinationsFor(undefined, t).map((destination) => destination.href)).not.toContain('/admin/people')
  })

  // Every read answering: a failed one is the same as no collection, which each example asks for too.
  test.prop([world.map((w) => ({ ...w, down: [] })), mode])(
    'searches only what this person may read, and leads every hit to its own page',
    async (w, provider) => {
      for (const answering of ['everything', 'no collections'] as const) {
        config.OAUTH_PROVIDER.MODE = provider
        withLocation('http://test-project.test/')
        vi.stubGlobal('fetch', backend(w, 'staff', answering))
        const me = w.me as never
        const resources = searchableResources(me, t)
        const keys = resources.map((resource) => resource.key)

        expect(keys.includes('users')).toBe(maySeePeople(me))
        expect(keys.includes('applications')).toBe(applicationsAreOn())
        expect(keys.includes('applicationReviews')).toBe(mayReviewApplications(me))
        expect(keys.includes('webhooks')).toBe(mayManageWebhooks(me))
        expect(keys).toContain('notifications')

        for (const resource of resources) {
          const hits = await resource.search({ search: 'x' })
          const expected =
            answering === 'everything'
              ? {
                  users: w.people,
                  applications: w.applications,
                  applicationReviews: w.reviews,
                  notifications: w.inbox,
                  webhooks: w.endpoints,
                }[resource.key]!.length
              : 0
          expect(hits).toHaveLength(expected)
          for (const hit of hits)
            expect(hit.href).toMatch(
              /^\/(admin\/people|applications|admin\/app-approvals|profile\/notifications|webhooks)/
            )
        }
      }
    }
  )

  test.prop([world, fc.stringMatching(/^[a-z]{1,8}$/)])(
    'asks a resource whose grammar refuses what was typed nothing at all',
    (w, field) => {
      config.OAUTH_PROVIDER.MODE = 'approval'
      const resources = searchableResources({ ...w.me, is_staff: true, is_superuser: true } as never, t)
      for (const asked of askedOf(resources, `${field}zz:value`)) {
        expect(asked.query).toBeNull()
        expect(asked.problem?.field).toBe(`${field}zz`)
      }
      for (const asked of askedOf(resources, field)) expect(asked.query).toEqual({ search: field })
    }
  )
})
