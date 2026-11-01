import { echoKeys } from '@/__tests__/support/translate'
import { askedOf, destinationsFor, searchableResources } from '@/lib/searchableResources'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CONFIG = vi.hoisted(() => ({ OAUTH_PROVIDER: { MODE: 'approval' } }))
vi.mock('@/config/public', () => ({ CONFIG }))

type Me = Parameters<typeof searchableResources>[0]

function me(fields: { is_staff?: boolean; is_superuser?: boolean; permissions?: string[] } = {}) {
  return { is_staff: false, is_superuser: false, permissions: [], ...fields } as unknown as Me
}

const t = echoKeys

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })
}

// Answers each list endpoint with its own rows.
const ROWS: Record<string, unknown[]> = {
  '/v0/users/': [{ id: 'u1', username: 'ada', email: 'ada@a.test' }],
  '/v0/oauth-applications/': [{ id: 7, name: 'Acme', client_id: 'acme-id' }],
  '/v0/oauth-application-reviews/': [{ id: 8, name: 'Beta', owner: 'bob' }],
  '/v0/notifications/inbox/': [
    { id: 'n1', kind: 'token_created', message: 'A token was made.' },
    { id: 'n2', kind: 'token_revoked', message: null },
  ],
{%- if cookiecutter.webhooks != "none" %}
  '/v0/notifications/endpoints/': [{ id: 'e1', url: 'https://a.test/hook' }],
{%- endif %}
}

let fetchMock: ReturnType<typeof vi.fn>

function asked(index = 0) {
  const [request] = fetchMock.mock.calls[index] as unknown as [Request]
  return new URL(request.url)
}

const keys = (resources: { key: string }[]) => resources.map((resource) => resource.key)

const forAnybody: string[] = {% if cookiecutter.webhooks == "users" %}['webhooks']{% else %}[]{% endif %}
const forStaff: string[] = {% if cookiecutter.webhooks != "none" %}['webhooks']{% else %}[]{% endif %}

describe('searchableResources', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
    fetchMock = vi.fn(async (request: Request) => jsonResponse({ results: ROWS[new URL(request.url).pathname] }))
    globalThis.fetch = fetchMock as never
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('searches only what a person may read', () => {
    expect(keys(searchableResources(me(), t))).toEqual(['applications', 'notifications', ...forAnybody])
    expect(keys(searchableResources(me({ is_staff: true, is_superuser: true }), t))).toEqual([
      'users',
      'applications',
      'applicationReviews',
      'notifications',
      ...forStaff,
    ])
    CONFIG.OAUTH_PROVIDER.MODE = 'off'
    expect(keys(searchableResources(me({ permissions: ['users:manage:user'] }), t))).toEqual([
      'users',
      'notifications',
      ...forAnybody,
    ])
  })

  it('heads each group with what it is', () => {
    expect(searchableResources(me({ is_staff: true, is_superuser: true }), t).map((each) => each.label)).toEqual([
      'auth:homePeopleLink',
      'auth:homeApplicationsLink',
      'auth:homeApplicationReviewsLink',
      'auth:profileNotificationsTab',
      ...forStaff.map(() => 'auth:homeWebhooksLink'),
    ])
  })

  it.each([
    ['users', '/v0/users/', [{ id: 'u1', title: 'ada', subtitle: 'ada@a.test', href: '/staff/people/u1' }]],
    [
      'applications',
      '/v0/oauth-applications/',
      [{ id: '7', title: 'Acme', subtitle: 'acme-id', href: '/applications/7' }],
    ],
    [
      'applicationReviews',
      '/v0/oauth-application-reviews/',
      [{ id: '8', title: 'Beta', subtitle: 'bob', href: '/staff/applications/8' }],
    ],
    [
      'notifications',
      '/v0/notifications/inbox/',
      [
        { id: 'n1', title: 'A token was made.', href: '/profile/notifications' },
        { id: 'n2', title: 'token_revoked', href: '/profile/notifications' },
      ],
    ],
{%- if cookiecutter.webhooks != "none" %}
    ['webhooks', '/v0/notifications/endpoints/', [{ id: 'e1', title: 'https://a.test/hook', href: '/webhooks' }]],
{%- endif %}
  ])('finds %s through %s, a glance at a time, narrowed as asked', async (key, path, hits) => {
    const resource = searchableResources(me({ is_staff: true, is_superuser: true }), t).find((each) => each.key === key)

    expect(await resource?.search({ search: 'a', flag: 'true' })).toEqual(hits)
    expect(asked().pathname).toBe(path)
    expect(Object.fromEntries(asked().searchParams)).toEqual({ search: 'a', flag: 'true', page_size: '5' })
  })

  it('finds nothing where the endpoint answered with nothing', async () => {
    fetchMock.mockImplementation(async () => new Response('{}', { status: 500 }))

    for (const resource of searchableResources(me({ is_staff: true, is_superuser: true }), t)) {
      expect(await resource.search({})).toEqual([])
    }
  })
})

describe('destinationsFor', () => {
  beforeEach(() => {
    CONFIG.OAUTH_PROVIDER.MODE = 'approval'
  })

  const hrefs = (person?: Me) => destinationsFor(person, t).map((each) => each.href)

  it('offers home, the profile and the inbox to anybody, before knowing who they are', () => {
    expect(destinationsFor(undefined, t)).toEqual([
      { href: '/', label: 'auth:paletteHome' },
      { href: '/profile', label: 'auth:homeProfileLink' },
      { href: '/profile/notifications', label: 'auth:profileNotificationsTab' },
      { href: '/applications', label: 'auth:homeApplicationsLink' },
    ])
  })

  it('adds the pages this person may reach', () => {
    expect(hrefs(me({ is_staff: true, is_superuser: true }))).toEqual([
      '/',
      '/profile',
      '/profile/notifications',
      '/applications',
      '/staff/people',
      '/staff/applications',
      ...forStaff.map(() => '/webhooks'),
    ])
    CONFIG.OAUTH_PROVIDER.MODE = 'off'
    expect(hrefs(me())).toEqual(['/', '/profile', '/profile/notifications', ...forAnybody.map(() => '/webhooks')])
  })

  it('names each as the home page does', () => {
    expect(
      destinationsFor(me({ is_staff: true, is_superuser: true }), t)
        .slice(4)
        .map((each) => each.label)
    ).toEqual([
      'auth:homePeopleLink',
      'auth:homeApplicationReviewsLink',
      ...forStaff.map(() => 'auth:homeWebhooksLink'),
    ])
  })
})

describe('askedOf', () => {
  it('asks each resource what its grammar makes of the words, or nothing where it refuses them', () => {
    const resources = searchableResources(me({ is_staff: true }), t)

    const asking = askedOf(resources, 'ada is_staff:true')

    expect(asking.map(({ resource, query, problem }) => [resource.key, query, problem?.field])).toEqual([
      ['users', { is_staff: 'true', search: 'ada' }, undefined],
      ['applications', null, 'is_staff'],
      ['notifications', null, 'is_staff'],
{%- if cookiecutter.webhooks != "none" %}
      ['webhooks', null, 'is_staff'],
{%- endif %}
    ])
  })
})
