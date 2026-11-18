import fc from 'fast-check'

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
  permissions: fc.subarray(SCOPES),
  last_login: fc.option(when, { nil: null }),
  created_at: when,
  updated_at: when,
})

const application = fc.record({
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
})

const reviewed = fc.tuple(application, person).map(([app, owner]) => ({ ...app, owner: owner.email }))

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
  emails: fc.array(fc.record({ email: fc.emailAddress(), primary: fc.boolean(), verified: fc.boolean() }), {
    minLength: 1,
    maxLength: 3,
  }),
})
export type World = typeof world extends fc.Arbitrary<infer T> ? T : never

export type Visitor = 'anonymous' | 'member' | 'staff' | 'superuser'
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

function apiBody(path: string, w: World, visitor: Visitor, holding: boolean): unknown {
  const me = {
    ...w.me,
    is_staff: visitor === 'staff' || visitor === 'superuser',
    is_superuser: visitor === 'superuser',
  }
  const list = <T>(items: T[]) => (holding ? items : undefined)
  const routes: [RegExp, () => unknown][] = [
    [/^\/v0\/users\/me\/reauthentication\/$/, () => list([{ id: 'reauthenticate' }])],
    [/^\/v0\/users\/me\/$/, () => me],
    [
      /^\/v0\/users\/permissions\/$/,
      () => list(SCOPES.map((name) => ({ name, label: name, delegatable: true, requires: [] }))),
    ],
    [/^\/v0\/users\/[^/]+\/history\/$/, () => page([], holding)],
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
  ]
  const found = routes.find(([pattern]) => pattern.test(path))
  return found ? found[1]() : {}
}

function authBody(path: string, w: World, visitor: Visitor, holding: boolean): [number, unknown] {
  const user = { id: w.me.id, username: w.me.username ?? undefined, email: w.me.email, display: w.me.email }
  const signedIn = visitor !== 'anonymous'
  if (path.endsWith('/auth/session')) {
    return signedIn
      ? [200, { status: 200, data: { user, methods: [] }, meta: { is_authenticated: true } }]
      : [401, { status: 401, data: { flows: [{ id: 'login' }] }, meta: { is_authenticated: false } }]
  }
  if (path.endsWith('/account/email')) return [200, { status: 200, data: holding ? w.emails : [] }]
  if (path.endsWith('/auth/provider/signup')) return [409, { status: 409 }]
  if (path.endsWith('/account/authenticators/totp'))
    return [404, { status: 404, meta: { secret: 'JBSWY3DP', totp_url: 'otpauth://totp/x' } }]
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
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (answering === 'nothing at all' && !url.pathname.endsWith('/auth/session')) return json(503, {})
    const holding = answering === 'everything'
    if (url.hostname.startsWith('auth.')) {
      const [status, body] = authBody(url.pathname, w, visitor, holding)
      return json(status, body)
    }
    if (visitor === 'anonymous') return json(403, { detail: 'Authentication credentials were not provided.' })
    return json(200, apiBody(url.pathname, w, visitor, holding))
  })
}
