import ApplicationPage from '@/app/applications/[id]/page'
import ApplicationsLayout from '@/app/applications/layout'
import ApplicationsPage from '@/app/applications/page'
import CallbackCompletePage from '@/app/auth/callback-complete/page'
import CompleteSignupPage from '@/app/auth/complete-signup/page'
import DeletionScheduledPage from '@/app/auth/deletion-scheduled/page'
import OAuthAuthorizePage from '@/app/auth/oauth/authorize/page'
import ProvePage from '@/app/auth/prove/page'
import ProviderErrorPage from '@/app/auth/provider-error/page'
import TwoFactorPage from '@/app/auth/two-factor/page'
import DevicePage from '@/app/device/page'
import LegalDocumentPage from '@/app/legal/[doc]/page'
import HomePage from '@/app/page'
import ProfileDetailsPage from '@/app/profile/(tabs)/details/page'
import SettingsPage from '@/app/profile/(tabs)/settings/page'
import ProfileTwoFactorPage from '@/app/profile/(tabs)/two-factor/page'
import ReviewPage from '@/app/staff/applications/[id]/page'
import ReviewsPage from '@/app/staff/applications/page'
import PersonPage from '@/app/staff/people/[id]/page'
import PeoplePage from '@/app/staff/people/page'
import { languages } from '@/i18n/config'

import { type Visitor, type World, backend, world } from '../../support/backend'
import { freshDom } from '../../support/dom'
import { navigation, requestCookies, requestHeaders } from '../../support/requests'
import { resolveServerTree } from '../../support/serverTree'
import { test } from '@fast-check/vitest'
import { render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

// The sweep in routes.property draws everything at once, so a page's body behind several gates is one
// example in dozens. Here each page is opened past its gates, varying only what that page reads.
const project = vi.hoisted(() => ({
  applications: true,
  legal: 'translated' as 'translated' | 'in another language' | 'unwritten',
}))
vi.mock('@/lib/access', async (actual) => ({
  ...(await actual<typeof import('@/lib/access')>()),
  applicationsAreOn: () => project.applications,
}))
// The document in a language other than the reader's, even where the project speaks one only.
const otherThan = vi.hoisted(() => (language: string) => (language === 'en' ? 'xx' : 'en'))
vi.mock('@/lib/readLegalDocument', () => ({
  readLegalDocument: async (_slug: string, language: string) =>
    project.legal === 'unwritten'
      ? null
      : { content: '# Terms', language: project.legal === 'in another language' ? otherThan(language) : language },
}))

// Read in English, so a page's words can be looked for; the legal property draws the language itself.
// The webhooks page, where this project has one.
const webhookPages = Object.values(
  import.meta.glob('../../../src/app/webhooks/page.tsx', { eager: true, import: 'default' })
) as ((props: never) => unknown)[]

const answered = world.map((w) => ({ ...w, me: { ...w.me, language: 'en' as const }, down: [] as number[] }))

async function open(page: (props: never) => unknown, props: object, fetcher: typeof fetch, cookie = true) {
  freshDom()
  requestHeaders.value = new Headers({ host: 'test-project.test', ...(cookie ? { cookie: 'sessionid=abc' } : {}) })
  requestCookies.value = cookie ? { sessionid: 'abc' } : {}
  vi.stubGlobal('fetch', fetcher)
  try {
    const node = await page(props as never)
    render(<>{(await resolveServerTree(node as React.ReactNode)) as React.ReactNode}</>)
    return 'shown'
  } catch (error) {
    const message = (error as Error).message
    if (message === 'NEXT_NOT_FOUND') return 'not found'
    if (message.startsWith('NEXT_REDIRECT')) return 'redirected'
    throw error
  }
}

const staff = (w: World) => backend(w, 'superuser', 'everything') as unknown as typeof fetch
// The same backend with the reads matching `failing` down, while the rest answer.
const without = (served: typeof fetch, failing: RegExp | null) =>
  (async (input: RequestInfo | URL) =>
    failing?.test(new URL(input instanceof Request ? input.url : String(input)).pathname)
      ? new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })
      : served(input)) as typeof fetch

describe('the device page', () => {
  // One property per case: no code yet, a code nobody knows, a code a device showed.
  for (const situation of ['no code', 'unknown', 'known'] as const)
    test.prop([
      answered,
      fc.oneof(
        fc.stringMatching(/^[A-Z]{4}-[A-Z]{4}$/),
        fc.array(fc.stringMatching(/^[A-Z]{4}-[A-Z]{4}$/), { minLength: 1, maxLength: 2 })
      ),
    ])(
      `asks for a code, says when one is unknown, and asks the device's question for a known one: ${situation}`,
      async (drawn, typed) => {
        const code = situation === 'no code' ? undefined : typed
        const shown = drawn.device ?? {
          application_name: 'Notes',
          application_description: '',
          scopes: [],
          user_code: 'ABCD-EFGH',
        }
        const w = { ...drawn, device: situation === 'unknown' ? null : shown }
        project.applications = true
        expect(await open(DevicePage, { searchParams: Promise.resolve({ code }) }, staff(w))).toBe('shown')
        const given = Array.isArray(code) ? code[0] : code
        if (given && w.device) expect(screen.getByText(new RegExp(w.device.user_code))).toBeTruthy()
        else expect(screen.queryByText(/That code is wrong/) !== null).toBe(Boolean(given))
      }
    )

  test('is not there without applications', async () => {
    project.applications = false
    expect(await open(DevicePage, { searchParams: Promise.resolve({}) }, staff(fc.sample(answered, 1)[0]))).toBe(
      'not found'
    )
    expect(await open(ApplicationsLayout, { children: null }, staff(fc.sample(answered, 1)[0]))).toBe('not found')
    project.applications = true
  })
})

describe('the home page', () => {
  test.prop([answered, fc.constantFrom<Visitor>('anonymous', 'member', 'staff', 'superuser'), fc.boolean()])(
    'links to the staff pages only for whoever may use them',
    async (w, visitor, applications) => {
      project.applications = applications
      const me = { ...w.me, permissions: [] as World['me']['permissions'] }
      expect(await open(HomePage, {}, backend({ ...w, me }, visitor, 'everything') as unknown as typeof fetch)).toBe(
        'shown'
      )
      // mayReviewApplications asks access.ts's own applicationsAreOn, which the mock above does not reach.
      expect(screen.queryByRole('link', { name: 'App approvals' }) !== null).toBe(visitor === 'superuser')
      project.applications = true
    }
  )
})

describe('the staff pages', () => {
  // The side reads failing too: the listing, the scopes and the permissions, each shown as none.
  // One property per relation, with the side reads answering and failing.
  for (const relation of ['manages them', 'reads them', 'is them'] as const)
    for (const sideReadsDown of [false, true])
      test.prop([answered, fc.uuid()])(
        `show the applications to review, one of them, the people, and a person, each by what came back: ${relation}${sideReadsDown ? ', side reads down' : ''}`,
        async (w, id) => {
          project.applications = true
          const failing = sideReadsDown
            ? /oauth-application-reviews\/$|delegatable-scopes|users\/permissions|\/v0\/users\/$/
            : null
          expect(await open(ReviewsPage, { searchParams: Promise.resolve({}) }, without(staff(w), failing))).toBe(
            'shown'
          )
          for (const review of sideReadsDown ? [] : w.reviews)
            expect(screen.getAllByText(review.name).length).toBeGreaterThan(0)
          expect(await open(ReviewPage, { params: Promise.resolve({ id: '1' }) }, without(staff(w), failing))).toBe(
            'shown'
          )
          expect(
            await open(ApplicationPage, { params: Promise.resolve({ id: '1' }) }, without(staff(w), failing))
          ).toBe('shown')
          // And one that left out what the API document lets it leave out.
          const bare = w.applications.map(
            ({ requested_scopes: _scopes, authorization_grant_type: _grant, ...rest }) => rest
          )
          expect(
            await open(
              ApplicationPage,
              { params: Promise.resolve({ id: '1' }) },
              staff({ ...w, applications: bare as World['applications'] })
            )
          ).toBe('shown')
          // Somebody else, managed or only read, or the one looking, who never manages their own account.
          const person = w.people[0] ?? { ...w.me, id }
          const me = {
            ...w.me,
            id: relation === 'is them' ? person.id : w.me.id,
            permissions: (relation === 'reads them' ? [] : ['users:manage:user']) as World['me']['permissions'],
          }
          expect(await open(PeoplePage, { searchParams: Promise.resolve({}) }, without(staff(w), failing))).toBe(
            'shown'
          )
          for (const each of sideReadsDown ? [] : w.people)
            expect(screen.getAllByText(each.email).length).toBeGreaterThan(0)
          const asked = staff({ ...w, people: [person], me })
          expect(await open(PersonPage, { params: Promise.resolve({ id }) }, without(asked, failing))).toBe('shown')
          const said = { 'manages them': null, 'reads them': /not change it/, 'is them': /This is you/ }[relation]
          if (said) expect(screen.getByText(said)).toBeTruthy()
          else expect(screen.getByRole('button', { name: 'Save' })).toBeTruthy()
        }
      )
})

describe('a legal document', () => {
  test.prop([
    fc.constantFrom('terms-of-service', 'privacy-policy'),
    fc.constantFrom<typeof project.legal>('translated', 'in another language', 'unwritten'),
    // Every language this project speaks, which may be English alone.
    fc.constantFrom(...languages),
  ])(
    "is shown in the reader's language, else in English saying so, else as not written yet",
    async (doc, legal, language) => {
      project.legal = legal
      const w = { ...fc.sample(answered, 1)[0], me: { ...fc.sample(answered, 1)[0].me, language } }
      expect(
        await open(
          LegalDocumentPage,
          { params: Promise.resolve({ doc }) },
          backend(w, 'member', 'everything') as unknown as typeof fetch
        )
      ).toBe('shown')
      expect(screen.queryByRole('article') !== null || document.querySelector('article') !== null).toBe(
        legal !== 'unwritten'
      )
      // Looked for by place, not words: a language still untranslated has the notice empty.
      expect(document.querySelector('p.text-center') !== null).toBe(legal === 'in another language')
    }
  )
})

describe('a first signup through a provider', () => {
  test.prop([answered])('is finished on its own page, which every page behind a login sends to', async (w) => {
    const served = backend(w, 'finishing signup', 'everything') as unknown as typeof fetch
    expect(await open(CompleteSignupPage, {}, served)).toBe('shown')
    expect(document.body.textContent).toContain(w.me.email)
    navigation.redirect.mockClear()
    expect(await open(DevicePage, { searchParams: Promise.resolve({}) }, served)).toBe('redirected')
    expect(navigation.redirect).toHaveBeenCalledWith('/auth/complete-signup')
    // With no signup pending there is nothing to finish.
    expect(await open(CompleteSignupPage, {}, backend(w, 'anonymous', 'everything') as unknown as typeof fetch)).toBe(
      'redirected'
    )
  })
})

describe('the listings', () => {
  // Each read failing on its own, which a page shows as none rather than as a crash.
  test.prop([answered, fc.boolean()])(
    'show what their reads return, and nothing when a read fails',
    async (w, failing) => {
      project.applications = true
      const down = failing
        ? /oauth-applications\/$|\/v0\/settings\/|\/v0\/features\/|notifications\/(endpoints|kinds)\/$/
        : null
      expect(await open(ApplicationsPage, { searchParams: Promise.resolve({}) }, without(staff(w), down))).toBe('shown')
      for (const application of failing ? [] : w.applications)
        expect(screen.getAllByText(application.name).length).toBeGreaterThan(0)
      expect(await open(SettingsPage, {}, without(staff(w), down))).toBe('shown')
      for (const page of webhookPages) expect(await open(page, {}, without(staff(w), down))).toBe('shown')
    }
  )
})

describe('a failed provider sign-in', () => {
  const TITLES: Record<string, string> = { cancelled: 'Sign-in canceled', logins_closed: 'Signing in is restricted' }
  test.prop([
    fc.constantFrom(undefined, 'cancelled', 'logins_closed', 'unknown'),
    fc.constantFrom(undefined, 'connect', 'login'),
  ])('says what went wrong, and leads back to where it started', async (error, errorProcess) => {
    expect(
      await open(
        ProviderErrorPage,
        { searchParams: Promise.resolve({ error, error_process: errorProcess }) },
        staff(fc.sample(answered, 1)[0])
      )
    ).toBe('shown')
    expect(screen.getByText(TITLES[error ?? ''] ?? 'Something went wrong')).toBeTruthy()
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      errorProcess === 'connect' ? '/profile/connections' : '/auth/login'
    )
  })
})

describe('the consent question', () => {
  // The backend's wording as a list for some scopes, for all, or as nothing usable at all.
  for (const described of ['["Read people"]', '["Read people", "Change people", "Who you are"]', 'not json', '{}'])
    test.prop([fc.stringMatching(/^[A-Z][a-z]{2,8}$/), fc.boolean()])(
      `words each scope as the backend does, else by its name: ${described}`,
      async (application, signedIn) => {
        const asked = {
          application_name: application,
          client_id: 'CID',
          scope: 'users:view:user users:manage:user openid',
          scopes_descriptions: described,
        }
        const served = backend(
          fc.sample(answered, 1)[0],
          signedIn ? 'member' : 'anonymous',
          'everything'
        ) as unknown as typeof fetch
        expect(await open(OAuthAuthorizePage, { searchParams: Promise.resolve(asked) }, served)).toBe('shown')
        expect(screen.getAllByRole('listitem')).toHaveLength(3)
      }
    )
})

describe('the proof page', () => {
  // The ways to prove read answering or failing, each with a cookie and without.
  for (const reads of [true, false])
    test.prop([fc.boolean(), fc.constantFrom(undefined, '1')])(
      `asks for proof, cookie or none, and goes back once proved: ${reads ? 'ways read' : 'ways unread'}`,
      async (cookie, proved) => {
        const served = without(
          backend(fc.sample(answered, 1)[0], 'member', 'everything') as unknown as typeof fetch,
          reads ? null : /reauthentication\/$/
        )
        expect(
          await open(ProvePage, { searchParams: Promise.resolve({ next: '/profile', proved }) }, served, cookie)
        ).toBe(proved ? 'redirected' : 'shown')
      }
    )
})

describe('the two-factor tab', () => {
  test.prop([answered])(
    'sets up an authenticator, asks for proof first, or says why it cannot, as the backend answers',
    async (w) => {
      expect(await open(ProfileTwoFactorPage, {}, backend(w, 'member', 'everything') as unknown as typeof fetch)).toBe(
        'shown'
      )
      if (w.totp === 'refused') expect(screen.getByText('Verify your address first.')).toBeTruthy()
    }
  )
})

describe('the account details page', () => {
  test.prop([answered, fc.boolean()])(
    'offers deleting the account only once told what deleting does',
    async (w, told) => {
      const served = without(
        backend(w, 'member', 'everything') as unknown as typeof fetch,
        told ? null : /\/deletion\/$/
      )
      expect(await open(ProfileDetailsPage, { searchParams: Promise.resolve({}) }, served)).toBe('shown')
      expect(screen.queryByRole('heading', { name: 'Delete account' }) !== null).toBe(told)
    }
  )
})

describe("this person's history", () => {
  // The history read answering and failing, each in every run.
  // Everything read, the history unread, and the account itself unread, each in every run.
  for (const [answering, failing, label] of [
    [true, null, 'read'],
    [false, /\/history\/$/, 'history unread'],
    [true, /\/users\/me\/$/, 'account unread'],
  ] as const)
    test.prop([answered])(`lists what happened, naming the fields an update changed: ${label}`, async (w) => {
      const served = without(backend(w, 'member', 'everything') as unknown as typeof fetch, failing)
      expect(await open(ProfileDetailsPage, { searchParams: Promise.resolve({}) }, served)).toBe('shown')
      expect(screen.queryByText('Nothing to show yet.') === null).toBe(answering && w.history.length > 0)
    })
})

describe('the deletion scheduled page', () => {
  const on = fc.option(
    fc.oneof(
      fc
        .date({ min: new Date('2026-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
        .map((date) => date.toISOString()),
      fc.string({ maxLength: 8 })
    ),
    { nil: undefined }
  )
  test.prop([answered, on])(
    'names the day only when it was given one it can read, and always the way back',
    async (w, when) => {
      const served = backend(w, 'anonymous', 'everything') as unknown as typeof fetch
      expect(await open(DeletionScheduledPage, { searchParams: Promise.resolve({ on: when }) }, served, false)).toBe(
        'shown'
      )
      expect(screen.queryByText(/^It will be deleted on/) !== null).toBe(!Number.isNaN(new Date(when ?? '').getTime()))
      expect(screen.getByRole('link', { name: 'Sign in to keep my account' }).getAttribute('href')).toBe('/auth/login')
    }
  )
})

describe('the second-factor page', () => {
  // Owing a factor shows the challenge; signed in goes on, and signed out has nothing to answer.
  for (const visitor of ['owing a factor', 'member', 'anonymous'] as const)
    test.prop([answered, fc.constantFrom(undefined, '/profile')])(
      `asks for the factor only of a login that owes one: ${visitor}`,
      async (w, next) => {
        const served = backend(w, visitor, 'everything') as unknown as typeof fetch
        expect(await open(TwoFactorPage, { searchParams: Promise.resolve({ next }) }, served)).toBe(
          visitor === 'owing a factor' ? 'shown' : 'redirected'
        )
      }
    )
})

// Session answers allauth gives a signed-out visitor: with flows, or with none at all.
const SESSIONS = {
  'signed in': [
    200,
    {
      status: 200,
      data: { user: { id: '1', email: 'a@b.test', display: 'a' }, methods: [] },
      meta: { is_authenticated: true },
    },
  ],
  'finishing signup': [
    401,
    { status: 401, data: { flows: [{ id: 'provider_signup', is_pending: true }] }, meta: { is_authenticated: false } },
  ],
  'owing a factor': [
    401,
    {
      status: 401,
      data: { flows: [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }] },
      meta: { is_authenticated: false },
    },
  ],
  'signed out': [401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } }],
  gone: [410, { status: 410, meta: { is_authenticated: false } }],
} as const

describe('the provider callback', () => {
  async function landed(session: keyof typeof SESSIONS, error: unknown, errorProcess: unknown) {
    navigation.redirect.mockClear()
    const [status, body] = SESSIONS[session]
    const answer = vi.fn(
      async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    )
    const searchParams = Promise.resolve({ error, error_process: errorProcess })
    expect(await open(CallbackCompletePage, { searchParams }, answer as unknown as typeof fetch)).toBe('redirected')
    return navigation.redirect.mock.calls[0][0] as string
  }

  test.prop([fc.constantFrom(...(Object.keys(SESSIONS) as (keyof typeof SESSIONS)[]))])(
    'goes on to whatever the session still owes',
    async (session) => {
      const went = await landed(session, undefined, undefined)
      const expected = {
        'finishing signup': '/auth/complete-signup',
        'signed in': '/',
        'signed out': '/auth/login',
        gone: '/auth/login',
      } as Record<string, string>
      if (session === 'owing a factor') expect(went).toMatch(/^\/auth\/two-factor\?next=/)
      else expect(went).toBe(expected[session])
    }
  )

  // One value, or the field repeated in the address, which Next hands over as a list.
  const repeated = (value: fc.Arbitrary<string>) => fc.oneof(value, fc.array(value, { minLength: 1, maxLength: 2 }))
  test.prop([
    fc.constantFrom('signed out' as const, 'gone' as const),
    repeated(fc.constantFrom('cancelled', 'unknown')),
    fc.constantFrom(undefined, 'connect', ['connect', 'login']),
  ])(
    'sends somebody signed out to say what went wrong, keeping whether it was a connect',
    async (session, error, errorProcess) => {
      const went = await landed(session, error, errorProcess)
      const first = Array.isArray(error) ? error[0] : error
      expect(went).toBe(
        `/auth/provider-error?${new URLSearchParams({ error: first, ...(errorProcess ? { error_process: 'connect' } : {}) })}`
      )
    }
  )
})
