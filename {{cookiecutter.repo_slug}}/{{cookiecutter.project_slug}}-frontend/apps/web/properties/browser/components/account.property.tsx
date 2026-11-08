import { AuthorizedApplicationsList } from '@/components/app-auth/AuthorizedApplicationsList'
import { ConnectionsList } from '@/components/app-auth/ConnectionsList'
import { SessionsList } from '@/components/app-auth/SessionsList'

import { words } from '../../support/arbitraries'
import { freshDom } from '../../support/dom'
import { calls, navigation, toast } from '../../support/requests'
import { test } from '@fast-check/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import fc from 'fast-check'
import { describe, expect, vi } from 'vitest'

const config = vi.hoisted(() => ({
  DOMAIN: 'test-project.test',
  SOCIAL_LOGIN: { PROVIDERS: [] as string[], ICONS: [] as string[] },
}))
vi.mock('@/config/public', () => ({ CONFIG: config }))

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const sessions = fc
  .uniqueArray(
    fc.record({
      id: fc.integer({ min: 1, max: 9999 }),
      ip: fc.ipV4(),
      is_current: fc.constant(false),
      user_agent: fc.constantFrom('', 'curl/8', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120'),
      created_at: fc.integer({ min: 1600000000, max: 1900000000 }),
    }),
    { selector: (session) => session.id, minLength: 1, maxLength: 4 }
  )
  .chain((list) =>
    fc
      .nat(list.length - 1)
      .map((current) => list.map((session, index) => ({ ...session, is_current: index === current })))
  )

describe("this person's sessions", () => {
  test.prop([sessions])(
    'are each named by device, the current one marked, with one way out of all the others',
    (list) => {
      freshDom()
      render(<SessionsList initialSessions={list} />)
      expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(list.length)
      expect(screen.getAllByText('This device')).toHaveLength(1)
      expect(screen.queryAllByText('Unknown device')).toHaveLength(
        list.filter((session) => session.user_agent === '').length
      )
      const others = list.length - 1
      expect(screen.queryByRole('button', { name: /other device/ }) !== null).toBe(others > 0)
    }
  )

  // A refusal that says why, or one that does not, which falls back to the list's own words.
  test.prop([sessions, fc.boolean(), fc.boolean(), fc.boolean()])(
    'end the one asked for, or all the others, keeping the list the server answers',
    async (list, everyOther, refused, saysWhy) => {
      freshDom()
      navigation.refresh.mockClear()
      const remaining = list.filter((session) => session.is_current)
      const sent = vi.fn(async () =>
        refused
          ? json(400, { status: 400, errors: saysWhy ? [{ message: 'Not now.' }] : [] })
          : json(200, { status: 200, data: remaining })
      )
      vi.stubGlobal('fetch', sent)
      render(<SessionsList initialSessions={list} />)
      const others = list.filter((session) => !session.is_current)
      if (everyOther && others.length === 0) return
      fireEvent.click(
        everyOther
          ? screen.getByRole('button', { name: /other device/ })
          : screen.getAllByRole('button', { name: 'Sign out' })[0]
      )
      await vi.waitFor(() => expect(calls(sent).some(([input]) => (input as Request).method === 'DELETE')).toBe(true))
      const deleted = calls(sent)
        .map(([input]) => input as Request)
        .find((request) => request.method === 'DELETE') as Request
      expect((await deleted.json()).sessions).toEqual(everyOther ? others.map((session) => session.id) : [list[0].id])
      if (refused) {
        await vi.waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith(saysWhy ? 'Not now.' : 'Unable to sign out of that device.')
        )
        expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(list.length)
      } else {
        await vi.waitFor(() =>
          expect(screen.getAllByRole('button', { name: 'Sign out' })).toHaveLength(remaining.length)
        )
        expect(navigation.refresh).toHaveBeenCalled()
      }
    }
  )
})

const providerId = fc.stringMatching(/^[a-z]{3,8}$/)

describe("this person's connected accounts", () => {
  test.prop([fc.uniqueArray(providerId, { maxLength: 3 }), fc.nat()])(
    'show every configured provider, connected or offered for connecting',
    (ids, pick) => {
      freshDom()
      config.SOCIAL_LOGIN.PROVIDERS = ids
      const connected = ids
        .filter((_, index) => index % 2 === pick % 2)
        .map((id, index) => ({ id: index + 1, provider: { id, name: id }, uid: `uid-${id}`, display: { name: id } }))
      render(
        <ConnectionsList
          initialProviders={connected}
          connectAction="http://auth.test-project.test/v0/browser/auth/provider/redirect"
          callbackUrl="http://test-project.test/profile/connections"
        />
      )
      if (ids.length === 0) {
        expect(screen.getByText('No social providers are configured.')).toBeTruthy()
        return
      }
      expect(screen.queryAllByRole('button', { name: 'Disconnect' })).toHaveLength(connected.length)
      expect(screen.queryAllByRole('button', { name: 'Connect' })).toHaveLength(ids.length - connected.length)
    }
  )

  test.prop([fc.uniqueArray(providerId, { minLength: 1, maxLength: 3 }), fc.boolean(), fc.boolean()])(
    'disconnect one, keeping the list the server answers',
    async (ids, refused, saysWhy) => {
      freshDom()
      config.SOCIAL_LOGIN.PROVIDERS = ids
      const connected = ids.map((id, index) => ({
        id: index + 1,
        provider: { id, name: id },
        uid: `uid-${id}`,
        display: { name: id },
      }))
      const sent = vi.fn(async () =>
        refused
          ? json(400, { status: 400, errors: saysWhy ? [{ message: 'Last way in.' }] : [] })
          : json(200, { status: 200, data: connected.slice(1) })
      )
      vi.stubGlobal('fetch', sent)
      render(
        <ConnectionsList
          initialProviders={connected}
          connectAction="http://auth.test-project.test/x"
          callbackUrl="http://test-project.test/y"
        />
      )
      fireEvent.click(screen.getAllByRole('button', { name: 'Disconnect' })[0])
      const deleted = () =>
        calls(sent)
          .map(([input]) => input)
          .find((input) => input instanceof Request && input.method === 'DELETE') as Request | undefined
      await vi.waitFor(() => expect(deleted()).toBeDefined())
      const body = await (deleted() as Request).json()
      expect(body).toEqual({ provider: ids[0], account: `uid-${ids[0]}` })
      if (refused)
        await vi.waitFor(() =>
          expect(toast.error).toHaveBeenCalledWith(saysWhy ? 'Last way in.' : 'Could not disconnect account.')
        )
      else
        await vi.waitFor(() =>
          expect(screen.queryAllByRole('button', { name: 'Disconnect' })).toHaveLength(ids.length - 1)
        )
    }
  )

  // Every reason in each example: drawn one at a time among six, some run would miss one.
  const REASONS = [
    undefined,
    'reauthentication_required',
    'cancelled',
    'connected_other',
    'permission_denied',
    'unknown',
  ]
  test.prop([fc.stringMatching(/^(\/[a-z]{1,6}){1,2}$/)])(
    'say why a connection failed, and drop the reason from the address, proving first where that was the reason',
    (pathname) => {
      for (const reason of REASONS) {
        freshDom()
        config.SOCIAL_LOGIN.PROVIDERS = ['github']
        navigation.replace.mockClear()
        navigation.pathname = pathname
        render(
          <ConnectionsList
            initialProviders={[]}
            connectAction="http://auth.test-project.test/x"
            callbackUrl="http://test-project.test/y"
            connectError={reason}
          />
        )
        const said: Record<string, string> = {
          cancelled: 'Connection canceled.',
          connected_other: 'That account is already connected to a different user.',
          permission_denied: 'Log in to connect an account.',
          unknown: 'Could not connect that account. Try again.',
        }
        if (reason && said[reason]) expect(screen.getByText(said[reason])).toBeTruthy()
        if (!reason) expect(navigation.replace).not.toHaveBeenCalled()
        else
          expect(navigation.replace).toHaveBeenCalledWith(
            reason === 'reauthentication_required' ? `/auth/prove?next=${encodeURIComponent(pathname)}` : pathname
          )
      }
    }
  )
})

const applications = fc
  .uniqueArray(
    fc.record({
      id: fc.integer({ min: 1, max: 9999 }),
      name: words,
      scopes: fc.subarray(['openid', 'profile', 'email', 'users:view:user']),
      granted_at: fc
        .date({ min: new Date('2020-01-01'), max: new Date('2030-01-01'), noInvalidDate: true })
        .map((date) => date.toISOString()),
    }),
    { selector: (application) => application.id, maxLength: 3 }
  )
  .filter((list) => new Set(list.map((application) => application.name)).size === list.length)

describe('the apps this person let in', () => {
  test.prop([applications, fc.nat(), fc.boolean(), fc.boolean()])(
    'lose their access only once the server took it, and a retry is the same request',
    async (list, pick, refused, saysWhy) => {
      freshDom()
      const sent = vi.fn(async () =>
        refused ? json(400, saysWhy ? { detail: 'Not yet.' } : {}) : new Response(null, { status: 204 })
      )
      vi.stubGlobal('fetch', sent)
      const described = { 'users:view:user': 'See people' }
      render(<AuthorizedApplicationsList initialApplications={list} described={described} />)
      if (list.length === 0) {
        expect(screen.getByText('No app can see your account.')).toBeTruthy()
        return
      }
      const target = list[pick % list.length]
      const row = () => screen.getByText(target.name).closest('li') as HTMLElement
      if (target.scopes.includes('users:view:user')) expect(row().textContent).toContain('See people')
      fireEvent.click(within(row()).getByRole('button', { name: 'Remove access' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(1))
      if (!refused) {
        await vi.waitFor(() => expect(screen.queryByText(target.name)).toBeNull())
        return
      }
      await vi.waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(saysWhy ? 'Not yet.' : 'Could not remove its access.')
      )
      fireEvent.click(within(row()).getByRole('button', { name: 'Remove access' }))
      await vi.waitFor(() => expect(sent).toHaveBeenCalledTimes(2))
      const keys = calls(sent).map(([input]) => (input as Request).headers.get('Idempotency-Key'))
      expect(keys[1]).toBe(keys[0])
    }
  )
})
