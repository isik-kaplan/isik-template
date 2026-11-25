import { languages } from '@/i18n/config'

import { type Drawn } from './arbitraries'
import fc from 'fast-check'
import { vi } from 'vitest'

// A text as a person reads it: no leading, trailing or doubled space, since an accessible name is
// normalized and a query by the drawn string would miss its own row.
export const text = fc
  .stringMatching(/^[A-Za-z][A-Za-z0-9]{0,11}( [A-Za-z0-9]{1,8}){0,2}$/)
  .filter((value) => value.length > 0)

const when = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-01-01T00:00:00Z'), noInvalidDate: true })
  .map((date) => date.toISOString())

const SCOPES = ['users.view_user', 'users.manage_user', 'oauth.review_application', 'notifications.manage_endpoint']

const scope = fc.record({ name: fc.constantFrom(...SCOPES), label: text })

const person = fc.record({
  id: fc.uuid(),
  username: fc.option(fc.stringMatching(/^[a-z][a-z0-9_]{1,11}$/), { nil: null }),
  email: fc.emailAddress(),
  first_name: fc.oneof(fc.constant(''), text),
  last_name: fc.oneof(fc.constant(''), text),
  is_active: fc.boolean(),
  is_staff: fc.boolean(),
  is_superuser: fc.boolean(),
  // Account permissions, named as the backend names them, not as scopes.
  permissions: fc.subarray(['users:view:user', 'users:manage:user', 'oauth:review:application']),
  language: fc.constantFrom(...languages),
  last_login: fc.option(when, { nil: null }),
  created_at: when,
  updated_at: when,
})

// Fields a request may leave out are optional in the API document, so each is drawn absent too.
const application = fc.record(
  {
    id: fc.integer({ min: 1, max: 9999 }),
    name: text,
    description: fc.oneof(fc.constant(''), text),
    client_id: fc.stringMatching(/^[A-Za-z0-9]{8,24}$/),
    client_type: fc.constantFrom('confidential', 'public'),
    authorization_grant_type: fc.constantFrom('authorization-code', 'urn:ietf:params:oauth:grant-type:device_code'),
    redirect_uris: fc.array(fc.webUrl(), { maxLength: 2 }),
    approval: fc.constantFrom('pending', 'approved', 'withdrawn', 'disabled'),
    requested_scopes: fc.subarray(SCOPES),
    approved_scopes: fc.subarray(SCOPES),
    client_secret: fc.constant(null),
    created: when,
    updated: when,
  },
  {
    requiredKeys: [
      'id',
      'name',
      'description',
      'client_id',
      'client_type',
      'redirect_uris',
      'approval',
      'approved_scopes',
      'client_secret',
      'created',
      'updated',
    ],
  }
)

// A review always carries what an application may leave out.
const reviewed = fc.tuple(application, person).map(([app, owner]) => ({
  ...app,
  requested_scopes: app.requested_scopes ?? [],
  authorization_grant_type: app.authorization_grant_type ?? 'authorization-code',
  owner: owner.email,
}))

const boolSetting = fc.record({
  name: fc.stringMatching(/^[a-z][a-z_]{2,15}$/),
  type: fc.constant('bool'),
  label: fc.option(text, { nil: null }),
  description: fc.option(text, { nil: null }),
  origin: fc.constantFrom('default', 'chosen', 'forced'),
  forced_reason: fc.option(text, { nil: null }),
  may_change: fc.boolean(),
  requires_feature: fc.constant(null),
  value: fc.boolean(),
  default: fc.boolean(),
  chosen: fc.option(fc.boolean(), { nil: null }),
})

const inboxItem = fc.record({
  id: fc.uuid(),
  kind: fc.stringMatching(/^[a-z][a-z_]{2,15}$/),
  variant: fc.constant(null),
  title: fc.option(text, { nil: null }),
  message: fc.option(text, { nil: null }),
  subject_label: fc.constant(null),
  subject_id: fc.constant(null),
  payload: fc.constant({}),
  read_at: fc.option(when, { nil: null }),
  created_at: when,
})

const token = fc.record({
  id: fc.uuid(),
  name: text,
  scopes: fc.subarray(SCOPES),
  expires_at: when,
  last_used_at: fc.option(when, { nil: null }),
  token: fc.constant(null),
  created_at: when,
  updated_at: when,
})

const endpoint = fc.record({
  id: fc.uuid(),
  url: fc.webUrl(),
  is_active: fc.boolean(),
  kinds: fc.constant([]),
  inert_kinds: fc.constant([]),
  consecutive_failures: fc.nat(10),
  parked_at: fc.option(when, { nil: null }),
  secret: fc.constant(null),
  updated_at: when,
})

const device = fc.record({
  id: fc.uuid(),
  platform: fc.constantFrom('apns', 'fcm'),
  token: fc.stringMatching(/^[a-f0-9]{16}$/),
  environment: fc.constantFrom('production', 'sandbox'),
  app_id: fc.constant(''),
  is_active: fc.boolean(),
  last_seen_at: fc.option(when, { nil: null }),
})

const authorizedApplication = fc.record({
  id: fc.integer({ min: 1, max: 9999 }),
  name: text,
  scopes: fc.subarray(SCOPES),
  granted_at: when,
})

const rows = <T>(row: fc.Arbitrary<T>) => fc.array(row, { maxLength: 3 })

const historyEvent = fc.record({
  event_id: fc.uuid(),
  action: fc.constantFrom('insert', 'update'),
  event_created_at: when,
  changes: fc.option(
    fc.dictionary(fc.constantFrom('email', 'username', 'is_staff', 'retired_field'), fc.constant([0, 1]), {
      maxKeys: 2,
    }),
    { nil: null }
  ),
})

const deviceAuthorization = fc.record({
  application_name: text,
  application_description: fc.oneof(fc.constant(''), text),
  scopes: fc.subarray(SCOPES),
  user_code: fc.stringMatching(/^[A-Z]{4}-[A-Z]{4}$/),
})

const authenticator = fc.oneof(
  fc.record({
    id: fc.integer({ min: 1, max: 99 }),
    type: fc.constant('webauthn'),
    name: text,
    created_at: fc.integer({ min: 1_600_000_000, max: 1_900_000_000 }),
  }),
  fc.record({
    type: fc.constant('recovery_codes'),
    unused_code_count: fc.nat(10),
    total_code_count: fc.constant(10),
    created_at: fc.constant(1_700_000_000),
  })
)

// What a group gives may be left out of an answer, as the API document allows.
const group = fc.record(
  {
    id: fc.uuid(),
    name: text,
    permissions: fc.subarray(['users:manage:user', 'users:grant:rights']),
    created_at: when,
    updated_at: when,
  },
  { requiredKeys: ['id', 'name', 'created_at', 'updated_at'] }
)

const siteSettings = fc.record(
  {
    login_policy: fc.constantFrom('everyone', 'staff', 'superusers'),
    signed_out: fc.constant(null),
    created_at: when,
    updated_at: when,
  },
  { requiredKeys: ['signed_out', 'created_at', 'updated_at'] }
)

/** One backend's whole state, drawn per example: every read answers from it. */
export const world = fc.record({
  me: person,
  people: rows(person),
  applications: rows(application),
  reviews: rows(reviewed),
  scopes: rows(scope),
  settings: rows(boolSetting),
  inbox: rows(inboxItem),
  tokens: rows(token),
  endpoints: rows(endpoint),
  devices: rows(device),
  authorized: rows(authorizedApplication),
  history: rows(historyEvent),
  groups: rows(group),
  siteSettings,
  // The code a device showed, or none the backend knows.
  device: fc.option(deviceAuthorization, { nil: null }),
  authenticators: fc.array(authenticator, { maxLength: 3 }),
  // Reads that fail on their own while the rest answer, by their place in the route table.
  down: fc.uniqueArray(fc.nat(20), { maxLength: 4 }),
  totp: fc.constantFrom('active', 'unset', 'needs proof', 'refused'),
  emails: fc.array(fc.record({ email: fc.emailAddress(), primary: fc.boolean(), verified: fc.boolean() }), {
    minLength: 1,
    maxLength: 3,
  }),
})
export type World = Drawn<typeof world>

// The last two are signed out, partway through a login: a first social signup, or a second factor owed.
export type Visitor = 'anonymous' | 'member' | 'staff' | 'superuser' | 'finishing signup' | 'owing a factor'
/** The shape of what came back rather than its contents: a failed read, or one carrying no collections. */
export type Answers = 'everything' | 'no collections' | 'nothing at all'

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const page = <T>(results: T[], holding: boolean) => ({
  count: results.length,
  next: null,
  previous: null,
  ...(holding ? { results } : {}),
})

const DOWN = Symbol('down')

function apiBody(path: string, w: World, visitor: Visitor, holding: boolean): unknown {
  const me = {
    ...w.me,
    is_staff: visitor === 'staff' || visitor === 'superuser',
    is_superuser: visitor === 'superuser',
  }
  const list = <T>(items: T[]) => (holding ? items : undefined)
  const routes: [RegExp, () => unknown][] = [
    [/^\/v0\/users\/me\/reauthentication\/$/, () => list([{ id: 'reauthenticate' }])],
    [/^\/v0\/users\/me\/deletion\/$/, () => (holding ? { deletion_mode: 'erase', after_days: 14 } : undefined)],
    [/^\/v0\/users\/me\/$/, () => me],
    [
      /^\/v0\/users\/permissions\/$/,
      () => list(SCOPES.map((name) => ({ name, label: name, delegatable: true, requires: [] }))),
    ],
    [/^\/v0\/users\/[^/]+\/history\/$/, () => ({ ...page(w.history, holding), total_pages: 1 })],
    [/^\/v0\/device-authorizations\/[^/]+\/$/, () => w.device],
    [/^\/v0\/users\/[^/]+\/$/, () => w.people[0] ?? me],
    [/^\/v0\/users\/$/, () => page(w.people, holding)],
    [/^\/v0\/oauth-applications\/delegatable-scopes\/$/, () => list(w.scopes)],
    [/^\/v0\/oauth-applications\/[^/]+\/$/, () => w.applications[0] ?? fc.sample(application, 1)[0]],
    [/^\/v0\/oauth-applications\/$/, () => page(w.applications, holding)],
    [/^\/v0\/oauth-application-reviews\/[^/]+\/$/, () => w.reviews[0] ?? fc.sample(reviewed, 1)[0]],
    [/^\/v0\/oauth-application-reviews\/$/, () => page(w.reviews, holding)],
    [/^\/v0\/authorized-applications\/$/, () => list(w.authorized)],
    [/^\/v0\/personal-access-tokens\/scopes\/$/, () => list(w.scopes)],
    [/^\/v0\/personal-access-tokens\/$/, () => page(w.tokens, holding)],
    [/^\/v0\/settings\/$/, () => list(w.settings)],
    [/^\/v0\/features\/$/, () => list([])],
    [/^\/v0\/notifications\/kinds\/$/, () => list([])],
    [/^\/v0\/notifications\/inbox\/$/, () => page(w.inbox, holding)],
    [/^\/v0\/notifications\/endpoints\/$/, () => page(w.endpoints, holding)],
    [/^\/v0\/notifications\/devices\/$/, () => page(w.devices, holding)],
    [/^\/v0\/groups\/[^/]+\/$/, () => w.groups[0] ?? fc.sample(group, 1)[0]],
    [/^\/v0\/groups\/$/, () => page(w.groups, holding)],
    [/^\/v0\/site-settings\/$/, () => w.siteSettings],
  ]
  const found = routes.findIndex(([pattern]) => pattern.test(path))
  if (found >= 0 && w.down.includes(found)) return DOWN
  return found >= 0 ? routes[found][1]() : {}
}

function authBody(path: string, w: World, visitor: Visitor, holding: boolean): [number, unknown] {
  const user = {
    id: w.me.id,
    username: w.me.username ?? undefined,
    email: w.me.email,
    display: w.me.email,
    language: w.me.language,
  }
  const signedIn = !['anonymous', 'finishing signup', 'owing a factor'].includes(visitor)
  if (path.endsWith('/auth/session')) {
    const pending =
      {
        'finishing signup': [{ id: 'provider_signup', is_pending: true }],
        'owing a factor': [{ id: 'mfa_authenticate', is_pending: true, types: ['totp'] }],
      }[visitor as string] ?? []
    return signedIn
      ? [200, { status: 200, data: { user, methods: [] }, meta: { is_authenticated: true } }]
      : [401, { status: 401, data: { flows: [{ id: 'login' }, ...pending] }, meta: { is_authenticated: false } }]
  }
  if (path.endsWith('/auth/provider/signup')) {
    return visitor === 'finishing signup'
      ? [
          200,
          { status: 200, data: { user: { email: w.me.email, username: w.me.username ?? '' }, account: {}, email: [] } },
        ]
      : [409, { status: 409 }]
  }
  if (path.endsWith('/account/authenticators')) return [200, { status: 200, data: holding ? w.authenticators : [] }]
  if (path.endsWith('/account/authenticators/totp')) {
    const answers: Record<string, [number, unknown]> = {
      active: [200, { status: 200, data: { type: 'totp', created_at: 1_700_000_000, last_used_at: null } }],
      unset: [404, { status: 404, meta: { secret: 'JBSWY3DP', totp_url: 'otpauth://totp/x' } }],
      'needs proof': [401, { status: 401, data: { flows: [{ id: 'reauthenticate' }] } }],
      refused: [409, { status: 409, errors: [{ message: 'Verify your address first.', code: 'unverified_email' }] }],
    }
    return answers[w.totp]
  }
  if (path.endsWith('/account/email')) return [200, { status: 200, data: holding ? w.emails : [] }]
  if (path.endsWith('/config'))
    return [
      200,
      {
        status: 200,
        data: { mfa: { supported_types: ['totp', 'recovery_codes', 'webauthn'], passkey_login_enabled: false } },
      },
    ]
  return [200, { status: 200, data: holding ? [] : [] }]
}

/** Serves `w` to every fetch, as the backend would to `visitor`. */
export function backend(w: World, visitor: Visitor, answering: Answers) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (answering === 'nothing at all' && !url.pathname.endsWith('/auth/session')) return json(503, {})
    const holding = answering === 'everything'
    if (url.hostname.startsWith('auth.')) {
      const [status, body] = authBody(url.pathname, w, visitor, holding)
      const response = json(status, body)
      if (url.pathname.endsWith('/authenticators/totp') && w.totp === 'needs proof')
        response.headers.set('X-Reauthentication-Required', '1')
      return response
    }
    if (!['member', 'staff', 'superuser'].includes(visitor))
      return json(403, { detail: 'Authentication credentials were not provided.' })
    if (url.pathname.startsWith('/v0/device-authorizations/') && !w.device) return json(404, { detail: 'Not found.' })
    const body = apiBody(url.pathname, w, visitor, holding)
    return body === DOWN ? json(503, { detail: 'Unavailable.' }) : json(200, body)
  })
}
