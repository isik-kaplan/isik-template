/// <reference types="vite/client" />
import { type Drawn } from '../../support/arbitraries'
import { type Answers, type Visitor, type World, backend, world } from '../../support/backend'
import { freshDom } from '../../support/dom'
import { requestCookies, requestHeaders } from '../../support/requests'
import { resolveServerTree } from '../../support/serverTree'
import { test } from '@fast-check/vitest'
import { render } from '@testing-library/react'
import fc from 'fast-check'
import { beforeAll, describe, expect, vi } from 'vitest'

// Applications switched off, a legal document missing or only in English, and sign-in through providers
// only: none is drawn by the backend.
const project = vi.hoisted(() => ({
  applications: true,
  passwords: true,
  legal: 'translated' as 'translated' | 'in another language' | 'unwritten',
}))
vi.mock('@/lib/access', async (actual) => ({
  ...(await actual<typeof import('@/lib/access')>()),
  applicationsAreOn: () => project.applications,
}))
vi.mock('@/lib/passwords', () => ({ passwordsSignIn: () => project.passwords }))
// The document in a language other than the reader's, even where the project speaks one only.
const otherThan = vi.hoisted(() => (language: string) => (language === 'en' ? 'xx' : 'en'))
vi.mock('@/lib/readLegalDocument', () => ({
  readLegalDocument: async (_slug: string, language: string) =>
    project.legal === 'unwritten'
      ? null
      : { content: '# Terms', language: project.legal === 'in another language' ? otherThan(language) : language },
}))

// Globbed rather than listed: a route added without an entry in a list is exactly the route nothing
// here would have said anything about.
const pages = import.meta.glob('../../../src/app/**/page.tsx')

const routes = Object.entries(pages).map(([file, load]) => ({
  route: file.replace('../../../src/app/', '').replace('/page.tsx', '').replace('page.tsx', ''),
  load: load as () => Promise<{
    default: (props: never) => unknown
    generateMetadata?: (props: never) => Promise<unknown>
  }>,
}))

// One value, or the same field repeated in the address, which Next hands over as a list.
const repeatable = (value: fc.Arbitrary<string>) =>
  fc.option(fc.oneof(value, fc.array(value, { minLength: 1, maxLength: 2 })), { nil: undefined })

// Every address-bar field some route reads, each drawn present or absent.
const asked = fc.record(
  {
    page: fc.integer({ min: 1, max: 50 }).map(String),
    next: fc.constantFrom('/profile', '/applications', 'https://elsewhere.test/'),
    code: repeatable(fc.oneof(fc.constant(' '), fc.stringMatching(/^[A-Z]{4}-[A-Z]{4}$/))),
    error: repeatable(fc.constantFrom('cancelled', 'logins_closed', 'unknown')),
    error_process: repeatable(fc.constantFrom('connect', 'login')),
    proved: fc.constantFrom('1', '0'),
    application_name: repeatable(fc.stringMatching(/^[A-Z][a-z]{2,8}$/)),
    application_description: fc.stringMatching(/^[A-Z][a-z]{2,8}$/),
    client_id: fc.stringMatching(/^[A-Za-z0-9]{8}$/),
    scope: fc.subarray(['users.view_user', 'openid', 'users.manage_user']).map((scopes) => scopes.join(' ')),
    // The backend's wording as JSON, as something that is not JSON, or as JSON that is not a list.
    scopes_descriptions: fc.constantFrom('["Read people"]', '["Read people", null, "Change people"]', 'not json', '{}'),
  },
  { requiredKeys: [] }
)

type Given = {
  applications: boolean
  passwords: boolean
  legal: typeof project.legal
  visitor: Visitor
  answering: Answers
  id: string
  secret: string
  doc: string
  cookie: boolean
  asked: Drawn<typeof asked>
  w: World
}

async function visit(route: (typeof routes)[number], given: Given) {
  freshDom()
  project.applications = given.applications
  project.passwords = given.passwords
  project.legal = given.legal
  requestHeaders.value = new Headers({
    host: 'test-project.test',
    ...(given.cookie ? { cookie: 'sessionid=abc' } : {}),
  })
  requestCookies.value = given.cookie ? { sessionid: 'abc' } : {}
  vi.stubGlobal('fetch', backend(given.w, given.visitor, given.answering) as unknown as typeof fetch)
  const params = Promise.resolve({ id: given.id, key: given.secret, doc: given.doc })
  const searchParams = Promise.resolve(given.asked)
  try {
    const { default: Page, generateMetadata } = await route.load()
    await generateMetadata?.({ params } as never)
    const node = await Page({ params, searchParams } as never)
    const { container } = render(<>{(await resolveServerTree(node as React.ReactNode)) as React.ReactNode}</>)
    return { stopped: false, markup: container.innerHTML }
  } catch (error) {
    // notFound() and redirect() are how a route stops a render; a gate that fired is an answer.
    const message = (error as Error).message
    if (message !== 'NEXT_NOT_FOUND' && !message.startsWith('NEXT_REDIRECT')) {
      throw new Error(`${route.route}: ${message}`, { cause: error })
    }
    return { stopped: true, markup: '' }
  }
}

const given = fc.record({
  applications: fc.boolean(),
  passwords: fc.boolean(),
  legal: fc.constantFrom<Given['legal']>('translated', 'in another language', 'unwritten'),
  visitor: fc.constantFrom<Visitor>('anonymous', 'member', 'staff', 'superuser', 'finishing signup', 'owing a factor'),
  answering: fc.constantFrom<Answers>('everything', 'no collections', 'nothing at all'),
  id: fc.uuid(),
  secret: fc.stringMatching(/^[A-Za-z0-9:_-]{1,40}$/),
  doc: fc.constantFrom('terms-of-service', 'privacy-policy', 'no-such-document'),
  cookie: fc.boolean(),
  asked,
  w: world,
})

describe('every route', () => {
  beforeAll(async () => {
    // The first import of each is ten times the rest.
    await Promise.all(routes.map((route) => route.load()))
  })

  test('is found by the sweep at all', () => {
    expect(routes.length).toBeGreaterThan(30)
  })

  test.prop([given])(
    'renders or stops the render as Next does, whoever asks and whatever the backend answers',
    async (g) => {
      for (const route of routes) {
        const visited = await visit(route, g)
        expect(visited.stopped || visited.markup.length > 0, route.route).toBe(true)
      }
    }
  )
})
