import ProfileSessions from '@/app/(authenticated)/profile/sessions'

import { type Drawn, held, json, ok, serve } from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import fc from 'fast-check'

const session = fc.record({
  id: fc.integer({ min: 1, max: 99999 }),
  ip: fc.ipV4(),
  is_current: fc.boolean(),
  user_agent: fc.string({ maxLength: 20 }),
  created_at: fc.integer({ min: 0, max: 2_000_000_000 }),
})
const sessions = fc.uniqueArray(session, { selector: (row) => row.id, maxLength: 4 })
type Session = Drawn<typeof session>

const PATH = '/v0/app/auth/sessions'

function shown(rows: Session[]) {
  for (const row of rows) {
    const label = (screen.getByTestId(`session-label-${row.id}`).props.children as string[]).join('')
    expect(label).toBe(`${row.ip}${row.is_current ? ' (this device)' : ''}`)
    expect(!!screen.queryByTestId(`revoke-session-${row.id}`)).toBe(!row.is_current)
  }
  expect(screen.queryAllByTestId(/^session-row-/)).toHaveLength(rows.length)
  expect(!!screen.queryByTestId('revoke-other-sessions')).toBe(rows.some((row) => !row.is_current))
}

describe('the active sessions screen', () => {
  it("lists every session, offering to end each but this device's", async () => {
    await fc.assert(
      fc.asyncProperty(sessions, fc.boolean(), async (rows, answered) => {
        serve(() => (answered ? ok(rows) : json(401, { status: 401, meta: {} })))
        const view = await render(<ProfileSessions />)
        await waitFor(() => shown(answered ? rows : []))
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(sessions, async (rows) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<ProfileSessions />)
        await view.unmount()
        answer.release(ok(rows))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryAllByTestId(/^session-row-/)).toHaveLength(0)
      })
    )
  })

  it("ends exactly the sessions asked for, holds the buttons meanwhile, and shows only the server's list after", async () => {
    await fc.assert(
      fc.asyncProperty(
        sessions,
        session,
        fc.constantFrom('one', 'all others'),
        sessions,
        fc.boolean(),
        async (rest, picked, which, after, accepted) => {
          const target = { ...picked, is_current: false }
          const before = [target, ...rest.filter((row) => row.id !== target.id)]
          const others = before.filter((row) => !row.is_current).map((row) => row.id)
          const answer = held<Response>()
          const calls = serve(({ method }) => (method === 'GET' ? ok(before) : answer.promise))
          const view = await render(<ProfileSessions />)
          await waitFor(() => shown(before))
          const button = which === 'one' ? `revoke-session-${target.id}` : 'revoke-other-sessions'
          // Not awaited: its act() would wait on the answer still held back.
          const pressing = fireEvent.press(screen.getByTestId(button))
          await waitFor(() => expect(calls).toHaveLength(2))
          const ending = which === 'one' ? [target.id] : others
          expect(calls[1]).toMatchObject({ method: 'DELETE', path: PATH, body: { sessions: ending } })
          await waitFor(() => expect(screen.getAllByText('Revoking…')).toHaveLength(ending.length))
          for (const id of others) {
            const label = ending.includes(id) ? 'Revoking…' : 'Revoke'
            expect(screen.getByTestId(`revoke-session-${id}`).props.accessibilityState.disabled).toBe(
              ending.includes(id)
            )
            expect(within(screen.getByTestId(`revoke-session-${id}`)).getByText(label)).toBeTruthy()
          }
          expect(screen.getByTestId('revoke-other-sessions').props.accessibilityState.disabled).toBe(true)
          answer.release(accepted ? ok(after) : json(400, { status: 400, errors: [] }))
          await pressing
          await waitFor(() => expect(screen.queryByText('Revoking…')).toBeNull())
          shown(accepted ? after : before)
          await view.unmount()
        }
      )
    )
  })
})
