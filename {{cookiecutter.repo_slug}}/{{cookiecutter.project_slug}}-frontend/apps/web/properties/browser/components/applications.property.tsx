import { ApplicationLifecycle } from '@/components/app-applications/ApplicationLifecycle'
import { ApprovalPanel } from '@/components/app-applications/ApprovalPanel'
import { EditApplicationForm } from '@/components/app-applications/EditApplicationForm'
import { RegisterApplication } from '@/components/app-applications/RegisterApplication'
import { RotateSecretPanel } from '@/components/app-applications/RotateSecretPanel'

import { drfRefusal, words } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const DEVICE = 'urn:ietf:params:oauth:grant-type:device_code'
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

const scopes = fc
  .uniqueArray(
    fc.record({ name: fc.stringMatching(/^[a-z]{2,5}:[a-z]{2,5}$/), label: fc.stringMatching(/^[A-Z][a-z]{2,8}$/) }),
    { selector: (scope) => scope.name, maxLength: 3 }
  )
  .filter((list) => new Set(list.map((scope) => scope.label)).size === list.length)
// The API document marks a field a request may leave out optional, so each is drawn absent too.
const application = fc.record(
  {
    id: fc.integer({ min: 1, max: 9999 }),
    name: words,
    description: fc.oneof(fc.constant(''), words),
    client_id: fc.stringMatching(/^[A-Za-z0-9]{10}$/),
    client_type: fc.constantFrom('confidential', 'public'),
    authorization_grant_type: fc.constantFrom('authorization-code', DEVICE),
    redirect_uris: fc.array(fc.webUrl(), { minLength: 1, maxLength: 2 }),
    approval: fc.constantFrom('pending', 'approved', 'withdrawn', 'disabled'),
    requested_scopes: fc.constant([] as string[]),
    approved_scopes: fc.constant([] as string[]),
    client_secret: fc.constant(null),
    created: fc.constant('2024-01-01T00:00:00Z'),
    updated: fc.constant('2024-01-01T00:00:00Z'),
  },
  {
    requiredKeys: [
      'id',
      'name',
      'client_id',
      'client_type',
      'authorization_grant_type',
      'approval',
      'approved_scopes',
      'client_secret',
      'created',
      'updated',
    ],
  }
)

function serving(status: number, body: unknown = {}) {
  const sent = vi.fn(async () => json(status, body, { ETag: '"9"' }))
  vi.stubGlobal('fetch', sent)
  return sent
}
const last = (sent: ReturnType<typeof serving>) => calls(sent).at(-1)?.[0] as Request

describe("an application's lifecycle", () => {
  test.prop([application])('offers only the acts its standing allows', (app) => {
    freshDom()
    render(<ApplicationLifecycle application={app as never} etag='"1"' />)
    const offered = screen.queryAllByRole('button').map((button) => button.textContent)
    const expected = {
      approved: ['Switch it off'],
      disabled: ['Switch it back on', 'Delete it'],
      pending: [],
      withdrawn: [],
    }[app.approval]
    expect(offered).toEqual(expected)
    if (app.approval === 'pending') expect(screen.getByText(/has to approve it/)).toBeTruthy()
    if (app.approval === 'withdrawn') expect(screen.getByText(/withdrew it/)).toBeTruthy()
  })

  // One property per answer: drawn among four beside the act, a delete that went through is one in eight.
  for (const status of [200, 204, 412, 400])
    test.prop([application.filter((app) => app.approval === 'approved' || app.approval === 'disabled'), fc.boolean()])(
      `switches it off or on under a key, deletes it against its version, and shows it afresh when it changed meanwhile: ${status}`,
      async (app, deleting) => {
        freshDom()
        const answers: Record<number, unknown> = { 412: { detail: 'stale', current: app }, 400: { detail: 'No.' } }
        const sent = serving(status, answers[status] ?? app)
        render(<ApplicationLifecycle application={app as never} etag='"1"' />)
        const offOrDelete = deleting ? 'Delete it' : 'Switch it back on'
        const act = app.approval === 'approved' ? 'Switch it off' : offOrDelete
        fireEvent.click(screen.getByRole('button', { name: act }))
        await vi.waitFor(() => expect(sent).toHaveBeenCalled())
        const request = last(sent)
        expect(request.headers.get('Idempotency-Key')).toBeTruthy()
        if (act === 'Delete it') expect([request.method, request.headers.get('If-Match')]).toEqual(['DELETE', '"1"'])
        if (status === 412 || (status < 300 && act !== 'Delete it'))
          await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
        if (status < 300 && act === 'Delete it')
          await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/applications'))
        if (status === 400) await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No.'))
      }
    )
})

describe("a superuser's review", () => {
  test.prop([application, scopes, fc.nat(), fc.constantFrom(200, 412, 400)])(
    'approves the scopes chosen against the version read, offering what was asked while it waits',
    async (app, offered, pick, status) => {
      freshDom()
      const requested = offered.map((scope) => scope.name)
      const reviewed = {
        ...app,
        owner: 'owner@acme.test',
        requested_scopes: requested,
        approved_scopes: requested.slice(0, 1),
      }
      const answers: Record<number, unknown> = { 412: { detail: 'stale', current: reviewed }, 400: { detail: 'No.' } }
      const sent = serving(status, answers[status] ?? reviewed)
      render(<ApprovalPanel application={reviewed as never} etag='"1"' scopes={offered} />)
      expect(screen.queryByRole('button', { name: 'Approve' }) !== null).toBe(app.approval !== 'disabled')
      expect(screen.queryByRole('button', { name: 'Withdraw' }) !== null).toBe(app.approval !== 'withdrawn')
      if (app.approval === 'disabled') return
      const ticked = (screen.queryAllByRole('checkbox') as HTMLInputElement[]).filter((box) => box.checked).length
      expect(ticked).toBe(app.approval === 'pending' ? requested.length : Math.min(1, requested.length))
      const boxes = screen.queryAllByRole('checkbox')
      if (boxes.length) fireEvent.click(boxes[pick % boxes.length])
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalled())
      const request = last(sent)
      expect(request.headers.get('If-Match')).toBe('"1"')
      expect(Array.isArray((await request.json()).approved_scopes)).toBe(true)
      if (status !== 400) await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
    }
  )

  test.prop([application.filter((app) => app.approval !== 'withdrawn'), fc.boolean()])(
    'withdraws it under a key of its own',
    async (app, ok) => {
      freshDom()
      const sent = serving(ok ? 200 : 400, ok ? { ...app, approval: 'withdrawn' } : { detail: 'No.' })
      const owned = { ...app, owner: 'o' } as never
      render(<ApprovalPanel application={owned} etag='"1"' scopes={[]} />)
      fireEvent.click(screen.getByRole('button', { name: 'Withdraw' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalled())
      expect(last(sent).headers.get('Idempotency-Key')).toBeTruthy()
      if (ok) await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
      else await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No.'))
    }
  )

  // One property per answer, so each is reached every run.
  for (const status of [204, 412, 400] as const)
    test.prop([application])(
      `deletes only one signing nobody in, against the version read, leaving for the list once gone: ${status}`,
      async (app) => {
        freshDom()
        const off = app.approval === 'withdrawn' || app.approval === 'disabled'
        const sent = vi.fn(async () =>
          status === 204
            ? new Response(null, { status })
            : json(status, status === 412 ? { detail: 'stale', current: app } : { detail: 'No.' })
        )
        vi.stubGlobal('fetch', sent)
        const owned = { ...app, owner: 'o' } as never
        render(<ApprovalPanel application={owned} etag='"1"' scopes={[]} />)
        expect(screen.queryByRole('button', { name: 'Delete' }) !== null).toBe(off)
        if (!off) return
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
        await vi.waitFor(() => expect(sent).toHaveBeenCalled())
        const request = calls(sent).at(-1)?.[0] as Request
        expect([request.method, request.headers.get('If-Match')]).toEqual(['DELETE', '"1"'])
        if (status === 204) await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/app-approvals'))
        else if (status === 412) await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
        else await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith('No.'))
      }
    )
})

describe("an application's secret", () => {
  test.prop([
    fc.integer({ min: 1, max: 999 }),
    fc.stringMatching(/^[A-Za-z0-9]{10}$/),
    fc.stringMatching(/^[A-Za-z0-9]{30}$/),
    fc.boolean(),
  ])('is made anew, signing everybody out only if asked, and shown once', async (id, clientId, secret, revoke) => {
    freshDom()
    const sent = serving(200, { client_secret: secret })
    render(<RotateSecretPanel applicationId={id} clientId={clientId} />)
    if (revoke) fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Make a new secret' }))
    expect(await screen.findByText(secret)).toBeTruthy()
    expect(screen.getByText(clientId)).toBeTruthy()
    expect(await last(sent).json()).toEqual({ revoke_tokens: revoke })
  })
})

describe('registering an application', () => {
  // One property per outcome, the form filled to reach it: drawn among seven, any one is missed by some runs.
  const OUTCOMES = [
    'device',
    'no addresses',
    'public',
    'confidential, secret shown',
    'confidential, no secret',
    'refused about its name',
    'refused about nothing',
  ]
  const registrationFor = (outcome: string) =>
    fc.record({
      refused: fc.constant(outcome.startsWith('refused')),
      field: fc.constant(outcome === 'refused about its name' ? 'name' : undefined),
      grant: fc.constant(outcome === 'device' ? DEVICE : 'authorization-code'),
      clientType: fc.constant(outcome.startsWith('confidential') ? 'confidential' : 'public'),
      uris: outcome === 'no addresses' ? fc.constant([]) : fc.array(fc.webUrl(), { minLength: 1, maxLength: 2 }),
      issued: fc.constant(outcome !== 'confidential, no secret'),
    })

  for (const outcome of OUTCOMES)
    test.prop([words, registrationFor(outcome), scopes])(
      `asks for redirect addresses only where it signs in through a browser, and shows a secret once: ${outcome}`,
      async (name, { grant, clientType, uris, issued, refused, field }, offered) => {
        freshDom()
        const secret = 'S'.repeat(20)
        const sent = vi.fn(async (input: RequestInfo | URL) => {
          const body = await (input as Request).clone().json()
          if (refused) return drfRefusal('Not that name.', field)
          return json(201, {
            id: 7,
            client_id: 'CID',
            ...body,
            client_secret: issued && body.client_type === 'confidential' ? secret : null,
          })
        })
        vi.stubGlobal('fetch', sent)
        render(<RegisterApplication scopes={offered} />)
        fireEvent.click(screen.getByRole('button', { name: 'Register app' }))
        expect(await screen.findByText('Give the app a name.')).toBeTruthy()
        fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } })
        fireEvent.change(screen.getByLabelText('How it signs people in'), { target: { value: grant } })
        const device = grant === DEVICE
        expect(screen.queryByLabelText('Redirect URIs, one per line') === null).toBe(device)
        if (!device) {
          fireEvent.change(screen.getByLabelText('Kind'), { target: { value: clientType } })
          fireEvent.change(screen.getByLabelText('Redirect URIs, one per line'), { target: { value: uris.join('\n') } })
        }
        fireEvent.click(screen.getByRole('button', { name: 'Register app' }))
        if (!device && uris.length === 0) {
          expect(await screen.findByText('Add at least one redirect URI.')).toBeTruthy()
          expect(sent).not.toHaveBeenCalled()
          return
        }
        await vi.waitFor(() => expect(sent).toHaveBeenCalled())
        const body = await (calls(sent)[0][0] as Request).json()
        expect(body.name).toBe(name)
        expect(body.client_type).toBe(device ? 'public' : clientType)
        expect(body.redirect_uris).toEqual(device ? [] : uris)
        if (refused) expect(await screen.findByText('Not that name.')).toBeTruthy()
        else if (issued && body.client_type === 'confidential') {
          expect(await screen.findByText(secret)).toBeTruthy()
          expect(screen.getByRole('link').getAttribute('href')).toBe('/applications/7')
        } else await vi.waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/applications/7'))
      }
    )
})

describe('editing an application', () => {
  for (const outcome of ['saved', 'conflict', 'empty-uris', 'refused about its name', 'refused about nothing'])
    test.prop([application, scopes])(
      `saves against the version it opened on, with no redirect addresses for a device: ${outcome}`,
      async (app, offered) => {
        const what = outcome.startsWith('refused') ? 'refused' : outcome
        const field = outcome === 'refused about its name' ? 'name' : undefined
        freshDom()
        const device = app.authorization_grant_type === DEVICE
        const answers: Record<string, () => Response> = {
          refused: () => drfRefusal('Not that name.', field),
          conflict: () =>
            json(412, { detail: 'stale', code: 'stale', current: { ...app, name: 'Theirs' } }, { ETag: '"2"' }),
        }
        const sent = vi.fn(async () => (answers[what] ?? (() => json(200, app, { ETag: '"3"' })))())
        vi.stubGlobal('fetch', sent)
        render(<EditApplicationForm application={app as never} etag='"1"' scopes={offered} />)
        expect(screen.queryByLabelText('Redirect URIs, one per line') === null).toBe(device)
        if (what === 'empty-uris' && !device)
          fireEvent.change(screen.getByLabelText('Redirect URIs, one per line'), { target: { value: '\n \n' } })
        fireEvent.click(screen.getByRole('button', { name: 'Save' }))
        // Left with no address, by clearing them or by an answer that carried none, it is not sent.
        if (!device && (what === 'empty-uris' || !app.redirect_uris?.length)) {
          expect(await screen.findByText('Add at least one redirect URI.')).toBeTruthy()
          return
        }
        await vi.waitFor(() => expect(sent).toHaveBeenCalled())
        const request = calls(sent)[0][0] as Request
        expect(request.headers.get('If-Match')).toBe('"1"')
        const body = await request.json()
        expect('redirect_uris' in body).toBe(!device)
        if (what === 'refused') expect(await screen.findByText('Not that name.')).toBeTruthy()
        else if (what === 'conflict') {
          fireEvent.click(await screen.findByRole('button', { name: 'Use their version' }))
          expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Theirs')
        } else await vi.waitFor(() => expect(navigation.refresh).toHaveBeenCalled())
      }
    )
})
