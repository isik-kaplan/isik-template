import { ConsentSignOut } from '@/components/app-auth/ConsentSignOut'
import { LogoutButton } from '@/components/app-auth/LogoutButton'
import { ProfileDetails } from '@/components/app-auth/ProfileDetails'
import { ProveContent } from '@/components/app-auth/ProveContent'

import type { NameRequirement } from '@/config/names'
import { editableNames, offeredNames } from '@/lib/names'

import { address, drfRefusal, sitePath, words } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, navigation } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const project = vi.hoisted(() => ({ requirement: 'username_with_optional_full' as NameRequirement }))
vi.mock('@/config/names', () => ({ nameRequirement: () => project.requirement }))

const REQUIREMENTS: NameRequirement[] = [
  'username_with_optional_full',
  'full_only',
  'full_and_username',
  'full_with_optional_username',
  'username_only',
]
const LABELS = { first_name: 'First name', last_name: 'Last name', username: 'Username' } as const
const name = fc.stringMatching(/^[A-Z][a-z]{1,8}$/)
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

// The names are optional in the API document, so each is drawn absent as well as empty.
const person = fc.record(
  {
    email: address,
    first_name: fc.oneof(fc.constant(''), name),
    last_name: fc.oneof(fc.constant(''), name),
    username: fc.option(fc.stringMatching(/^[a-z]{3,8}$/), { nil: null }),
  },
  { requiredKeys: ['email', 'username'] }
)

describe("this person's details", () => {
  test.prop([fc.constantFrom(...REQUIREMENTS), person])(
    'show the names this project asks for, and edit only those still theirs to change',
    (requirement, user) => {
      freshDom()
      project.requirement = requirement
      render(<ProfileDetails user={Object.assign({ etag: '"1"' }, user)} />)
      expect(screen.getByText(user.email)).toBeTruthy()
      const editable = editableNames(user, requirement)
      expect(screen.queryByRole('button', { name: 'Edit' }) !== null).toBe(editable.length > 0)
      if (offeredNames(requirement).includes('first_name'))
        expect(screen.getAllByText(/First name|Last name/).length).toBe(2)
      if (editable.length === 0) return
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
      for (const field of editable) expect(screen.getByLabelText(LABELS[field])).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
    }
  )

  // One property per answer: drawn among five, some run would miss one.
  for (const outcome of ['saved', 'conflict-theirs', 'conflict-mine', 'refused about a name', 'refused about nothing'])
    // Two different names, so the one saved is found once on the page.
    test.prop([person.filter((user) => user.username === null), fc.uniqueArray(name, { minLength: 2, maxLength: 2 })])(
      `save the names against the version they were read at, offering theirs or mine when somebody else saved first: ${outcome}`,
      async (user, [first, last]) => {
        const what = outcome.startsWith('refused') ? 'refused' : outcome
        const field = outcome === 'refused about a name' ? 'first_name' : undefined
        freshDom()
        project.requirement = 'full_only'
        const theirs = {
          ...user,
          first_name: 'Theirs',
          last_name: 'Theirs',
          is_staff: false,
          is_superuser: false,
          permissions: [],
          id: crypto.randomUUID(),
          created_at: '',
          updated_at: '',
        }
        let call = 0
        const sent = vi.fn(async (input: RequestInfo | URL) => {
          call++
          const request = input as Request
          if (what === 'refused') return drfRefusal('Too odd.', field)
          if (what.startsWith('conflict') && call === 1)
            return json(412, { detail: 'stale', code: 'stale', current: theirs }, { ETag: '"2"' })
          const body = await request.clone().json()
          return json(200, { ...theirs, ...body }, { ETag: '"3"' })
        })
        vi.stubGlobal('fetch', sent)
        render(<ProfileDetails user={Object.assign({ etag: '"1"' }, user)} />)
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
        fireEvent.change(screen.getByLabelText('First name'), { target: { value: first } })
        fireEvent.change(screen.getByLabelText('Last name'), { target: { value: last } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
        const patch = calls(sent)[0][0] as Request
        expect(patch.headers.get('If-Match')).toBe('"1"')
        expect(await patch.json()).toEqual({ first_name: first, last_name: last })

        if (what === 'saved') expect(await screen.findByText(first)).toBeTruthy()
        if (what === 'refused') expect(await screen.findByText('Too odd.')).toBeTruthy()
        if (what === 'conflict-theirs') {
          fireEvent.click(await screen.findByRole('button', { name: 'Use their version' }))
          expect((screen.getByLabelText('First name') as HTMLInputElement).value).toBe('Theirs')
        }
        if (what === 'conflict-mine') {
          fireEvent.click(await screen.findByRole('button', { name: 'Save mine over it' }))
          await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2))
          expect((calls(sent)[1][0] as Request).headers.get('If-Match')).toBe('"2"')
        }
      }
    )
})

describe('proving with a second factor', () => {
  // With and without the types allauth may leave out, each in every run.
  for (const flow of [{ id: 'mfa_reauthenticate', types: ['recovery_codes'] }, { id: 'mfa_reauthenticate' }])
    test.prop([sitePath])(`offers a recovery code: ${flow.types ? 'typed' : 'untyped'}`, (next) => {
      freshDom()
      render(
        <ProveContent
          flows={[flow] as never}
          next={next}
          providerAction="http://auth.test-project.test/x"
          callbackUrl="http://test-project.test/y"
        />
      )
      expect(screen.getByLabelText('Recovery code')).toBeTruthy()
    })
})

describe('signing out', () => {
  test('ends the session, tells the other tabs, and goes home', async () => {
    freshDom()
    const sent = vi.fn(async () => json(401, { status: 401, meta: { is_authenticated: false } }))
    vi.stubGlobal('fetch', sent)
    render(<LogoutButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/'))
    expect(calls(sent).some(([input]) => input instanceof Request && input.method === 'DELETE')).toBe(true)
  })

  test.prop([words, fc.webUrl()])(
    'from a consent page signs in again for the same request',
    async (who, authorizeUrl) => {
      freshDom()
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => json(401, {}))
      )
      render(<ConsentSignOut name={who} authorizeUrl={authorizeUrl} />)
      expect(screen.getByText(new RegExp(`Not ${who}`))).toBeTruthy()
      fireEvent.click(screen.getByRole('button', { name: 'Sign in as somebody else' }))
      await vi.waitFor(() =>
        expect(navigation.push).toHaveBeenCalledWith(`/auth/login?next=${encodeURIComponent(authorizeUrl)}`)
      )
    }
  )
})

const flow = fc.oneof(
  fc.constant({ id: 'reauthenticate' }),
  fc.record({
    id: fc.constant('provider_reauthenticate'),
    providers: fc.uniqueArray(
      fc.record({ id: fc.stringMatching(/^[a-z]{3,6}$/), name: fc.stringMatching(/^[A-Z][a-z]{2,6}$/) }),
      { selector: (provider) => provider.id, minLength: 1, maxLength: 2 }
    ),
  }),
  // allauth's flow may leave its types out, which still offers the recovery code.
  fc.constantFrom({ id: 'mfa_reauthenticate', types: ['recovery_codes'] }, { id: 'mfa_reauthenticate' }),
  fc.record({ id: fc.constant('set_password_by_email'), email: address }),
  fc.constant({ id: 'something_new' })
)

describe('the ways to prove who you are', () => {
  test.prop([
    fc.uniqueArray(flow, { selector: (each) => each.id, maxLength: 4 }),
    sitePath,
    fc.option(fc.constant('failed'), { nil: undefined }),
  ])('are each offered as the backend lists them, and none is said to be none', (flows, next, error) => {
    freshDom()
    render(
      <ProveContent
        flows={flows as never}
        next={next}
        error={error}
        providerAction="http://auth.test-project.test/x"
        callbackUrl="http://test-project.test/y"
      />
    )
    expect(screen.queryByText('We could not confirm it was you. Try again.') !== null).toBe(error !== undefined)
    if (flows.length === 0) expect(screen.getByText(/no way to confirm/)).toBeTruthy()
    const ids = flows.map((each) => each.id)
    expect(screen.queryByLabelText('Password') !== null).toBe(ids.includes('reauthenticate'))
    expect(screen.queryByLabelText('Recovery code') !== null).toBe(ids.includes('mfa_reauthenticate'))
    expect(screen.queryByRole('button', { name: 'Email me a link to set a password' }) !== null).toBe(
      ids.includes('set_password_by_email')
    )
    const viaProvider = flows.find((each) => each.id === 'provider_reauthenticate') as
      { providers: { name: string }[] } | undefined
    for (const provider of viaProvider?.providers ?? [])
      expect(screen.getByRole('button', { name: `Confirm with ${provider.name}` })).toBeTruthy()
  })
})

describe('proving with a code', () => {
  // With and without the recipients allauth may leave out, each in every run.
  for (const withRecipients of [true, false])
    test.prop([address, sitePath])(
      `offers a code to each verified address: ${withRecipients ? 'named' : 'unnamed'}`,
      (email, next) => {
        freshDom()
        const flow = withRecipients
          ? { id: 'reauthenticate_by_code', recipients: [{ email }] }
          : { id: 'reauthenticate_by_code' }
        render(
          <ProveContent
            flows={[flow] as never}
            next={next}
            providerAction="http://auth.test-project.test/x"
            callbackUrl="http://test-project.test/y"
          />
        )
        expect(screen.queryAllByRole('button').map((button) => button.textContent)).toEqual(
          withRecipients ? [`Send a code to ${email}`] : []
        )
      }
    )
})
