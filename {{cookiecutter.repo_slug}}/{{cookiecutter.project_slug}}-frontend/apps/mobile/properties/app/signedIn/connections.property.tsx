import ProfileConnections from '@/app/(authenticated)/profile/connections'

import { text } from '../../support/backend'
import { type Drawn, held, json, ok, serve, slug } from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const connection = fc.record({
  id: fc.integer({ min: 1, max: 99999 }),
  provider: fc.record({ id: slug, name: text }),
  uid: fc.stringMatching(/^[0-9]{4,12}$/),
  display: fc.record({ name: text }),
})
const connections = fc.uniqueArray(connection, { selector: (row) => row.id, maxLength: 4 })
type Connection = Drawn<typeof connection>

function shown(rows: Connection[]) {
  for (const row of rows) {
    expect(screen.getByTestId(`connection-label-${row.id}`).props.children).toBe(row.provider.name)
  }
  expect(screen.queryAllByTestId(/^connection-row-/)).toHaveLength(rows.length)
  expect(!!screen.queryByTestId('profile-connections-empty')).toBe(rows.length === 0)
}

describe('the connected accounts screen', () => {
  it('lists every connected account, or says there are none', async () => {
    await fc.assert(
      fc.asyncProperty(connections, fc.boolean(), async (rows, answered) => {
        serve(() => (answered ? ok(rows) : json(401, { status: 401, meta: {} })))
        const view = await render(<ProfileConnections />)
        await waitFor(() => shown(answered ? rows : []))
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(connections, async (rows) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<ProfileConnections />)
        await view.unmount()
        answer.release(ok(rows))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryAllByTestId(/^connection-row-/)).toHaveLength(0)
      })
    )
  })

  it("disconnects the account pressed by its provider and uid, and shows only the server's list after", async () => {
    await fc.assert(
      fc.asyncProperty(
        connections.filter((rows) => rows.length > 0),
        fc.nat(),
        connections,
        fc.boolean(),
        async (before, index, after, accepted) => {
          const target = before[index % before.length]
          const calls = serve(({ method }) => {
            if (method === 'GET') return ok(before)
            return accepted ? ok(after) : json(400, { status: 400, errors: [] })
          })
          const view = await render(<ProfileConnections />)
          await waitFor(() => shown(before))
          await fireEvent.press(screen.getByTestId(`disconnect-${target.id}`))
          await waitFor(() => expect(calls).toHaveLength(2))
          expect(calls[1]).toMatchObject({
            method: 'DELETE',
            path: '/v0/app/account/providers',
            body: { provider: target.provider.id, account: target.uid },
          })
          await waitFor(() => shown(accepted ? after : before))
          await view.unmount()
        }
      )
    )
  })
})
