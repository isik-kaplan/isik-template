import Notifications from '@/app/(authenticated)/notifications'

import { text } from '../../support/backend'
import { type Drawn, held, json, serve, slug } from '../../support/signedIn/server'
import { kept } from '../../support/store'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const when = fc
  .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-01-01T00:00:00Z'), noInvalidDate: true })
  .map((date) => date.toISOString())

const item = fc.record({
  id: fc.uuid(),
  kind: slug,
  variant: fc.constant(null),
  title: fc.option(text, { nil: null }),
  message: fc.option(text, { nil: null }),
  subject_label: fc.constant(null),
  subject_id: fc.constant(null),
  payload: fc.constant({}),
  read_at: fc.option(when, { nil: null }),
  created_at: when,
})
const items = fc.uniqueArray(item, { selector: (row) => row.id, maxLength: 4 })
type Item = Drawn<typeof item>

const INBOX = '/v0/notifications/inbox/'
const page = (results: Item[]) => json(200, { count: results.length, next: null, previous: null, results })
const failed = () => json(503, {})

function shown(rows: Item[]) {
  for (const row of rows) {
    expect(screen.getByTestId(`notification-message-${row.id}`).props.children).toBe(row.message ?? row.kind)
    expect(!!screen.queryByTestId(`notification-unread-${row.id}`)).toBe(!row.read_at)
    expect(screen.getByTestId(`notification-read-${row.id}`).props.accessibilityState.disabled).toBe(!!row.read_at)
  }
  expect(screen.queryAllByTestId(/^notification-message-/)).toHaveLength(rows.length)
  expect(!!screen.queryByTestId('notifications-read-all')).toBe(rows.some((row) => !row.read_at))
}

describe('the notifications screen', () => {
  it('lists every notification by its message or else its kind, and says so once there are none', async () => {
    await fc.assert(
      fc.asyncProperty(items, fc.boolean(), fc.boolean(), async (rows, answered, signedIn) => {
        kept.clear()
        if (signedIn) kept.set('session_token', 'a-token')
        const calls = serve(() => (answered ? page(rows) : failed()))
        const view = await render(<Notifications />)
        const listed = answered ? rows : []
        await waitFor(() => expect(!!screen.queryByTestId('notifications-empty')).toBe(listed.length === 0))
        shown(listed)
        expect(calls[0].headers.get('X-Session-Token')).toBe(signedIn ? 'a-token' : null)
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(items, async (rows) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<Notifications />)
        await view.unmount()
        answer.release(page(rows))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryByTestId('notifications-empty')).toBeNull()
      })
    )
  })

  it('marks the one pressed as the server answers it, leaving the rest and keeping it on a failure', async () => {
    await fc.assert(
      fc.asyncProperty(items, item, when, fc.boolean(), async (rest, picked, readAt, accepted) => {
        const target = { ...picked, read_at: null }
        const before = [target, ...rest.filter((row) => row.id !== target.id)]
        const answered = { ...target, read_at: readAt }
        const calls = serve(({ method }) => {
          if (method === 'GET') return page(before)
          return accepted ? json(200, answered) : failed()
        })
        const view = await render(<Notifications />)
        await waitFor(() => shown(before))
        await fireEvent.press(screen.getByTestId(`notification-read-${target.id}`))
        await waitFor(() => expect(calls).toHaveLength(2))
        expect(calls[1]).toMatchObject({ method: 'POST', path: `${INBOX}${target.id}/read/` })
        await waitFor(() => shown(accepted ? [answered, ...before.slice(1)] : before))
        await view.unmount()
      })
    )
  })

  it('marks all read, then shows the inbox as the server lists it after, or keeps what it had', async () => {
    await fc.assert(
      fc.asyncProperty(items, item, items, fc.boolean(), async (rest, picked, after, relisted) => {
        const before = [{ ...picked, read_at: null }, ...rest.filter((row) => row.id !== picked.id)]
        const calls = serve(({ method }) => {
          if (method === 'POST') return new Response(null, { status: 204 })
          return calls.length === 1 || relisted ? page(calls.length === 1 ? before : after) : failed()
        })
        const view = await render(<Notifications />)
        await waitFor(() => shown(before))
        await fireEvent.press(screen.getByTestId('notifications-read-all'))
        await waitFor(() => expect(calls).toHaveLength(3))
        expect(calls.slice(1).map((call) => `${call.method} ${call.path}`)).toEqual([
          `POST ${INBOX}read-all/`,
          `GET ${INBOX}`,
        ])
        await waitFor(() => shown(relisted ? after : before))
        await view.unmount()
      })
    )
  })
})
