import ProfileEmails from '@/app/(authenticated)/profile/emails'

import {
  type Drawn,
  REFUSED,
  type Refused,
  email,
  held,
  json,
  ok,
  refusal,
  refusalDetails,
  said,
  serve,
} from '../../support/signedIn/server'
import { kept } from '../../support/store'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const address = fc.record({ email, primary: fc.boolean(), verified: fc.boolean() })
const addresses = fc.uniqueArray(address, { selector: (row) => row.email, maxLength: 4 })
type Address = Drawn<typeof address>

const PATH = '/v0/app/account/email'
const label = (row: string) => (screen.getByTestId(`email-label-${row}`).props.children as string[]).join('')

function shown(rows: Address[]) {
  for (const row of rows) {
    const suffixes = `${row.primary ? ' (primary)' : ''}${row.verified ? '' : ' (unverified)'}`
    expect(label(row.email)).toBe(`${row.email}${suffixes}`)
    expect(!!screen.queryByTestId(`make-primary-${row.email}`)).toBe(!row.primary && row.verified)
    expect(!!screen.queryByTestId(`resend-verification-${row.email}`)).toBe(!row.verified)
    expect(!!screen.queryByTestId(`remove-email-${row.email}`)).toBe(!row.primary)
  }
  expect(screen.queryAllByTestId(/^email-row-/)).toHaveLength(rows.length)
}

describe('the email addresses screen', () => {
  it('lists exactly what the server holds, offering each address only the actions its state allows', async () => {
    await fc.assert(
      fc.asyncProperty(addresses, fc.boolean(), async (rows, answered) => {
        kept.clear()
        kept.set('session_token', 'a-token')
        const calls = serve(() => (answered ? ok(rows) : json(401, { status: 401, meta: { is_authenticated: false } })))
        const view = await render(<ProfileEmails />)
        await waitFor(() => expect(calls).toHaveLength(1))
        await waitFor(() => shown(answered ? rows : []))
        expect(calls[0].headers.get('X-Session-Token')).toBe('a-token')
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(addresses, async (rows) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<ProfileEmails />)
        await view.unmount()
        answer.release(ok(rows))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryAllByTestId(/^email-row-/)).toHaveLength(0)
      })
    )
  })

  it('takes the new list when an address is added, and otherwise says why and keeps what was typed', async () => {
    await fc.assert(
      fc.asyncProperty(
        addresses,
        email,
        addresses,
        fc.constantFrom<'saved' | Refused>('saved', ...REFUSED),
        refusalDetails,
        async (before, typed, after, outcome, details) => {
          kept.clear()
          const calls = serve(({ method }) => {
            if (method === 'GET') return ok(before)
            return outcome === 'saved' ? ok(after) : refusal(outcome, details)
          })
          const view = await render(<ProfileEmails />)
          await waitFor(() => shown(before))
          await fireEvent.changeText(screen.getByTestId('new-email-input'), typed)
          await fireEvent.press(screen.getByTestId('add-email-submit'))
          await waitFor(() => expect(screen.getByTestId('add-email-submit-label').props.children).toBe('Add email'))
          expect(calls[1]).toMatchObject({ method: 'POST', path: PATH, body: { email: typed } })
          if (outcome === 'saved') {
            shown(after)
            expect(screen.getByTestId('new-email-input').props.value).toBe('')
            expect(screen.queryByTestId('profile-emails-error')).toBeNull()
          } else {
            shown(before)
            expect(screen.getByTestId('new-email-input').props.value).toBe(typed)
            expect(screen.getByTestId('profile-emails-error').props.children).toBe(
              said(outcome, details, 'profileEmailsAddError')
            )
          }
          await view.unmount()
        }
      )
    )
  })

  // One property per act: drawn among three beside whether it was accepted, one is missed by some runs.
  it.each(['make primary', 'resend', 'remove'] as const)(
    "changes the list only to the server's answer when an address is %s",
    async (action) => {
      await fc.assert(
        fc.asyncProperty(
          addresses,
          email,
          fc.boolean(),
          addresses,
          fc.boolean(),
          async (others, target, flag, after, accepted) => {
            kept.clear()
            const rest = others.filter((row) => row.email !== target)
            const row: Address = {
              'make primary': { email: target, primary: false, verified: true },
              resend: { email: target, primary: flag, verified: false },
              remove: { email: target, primary: false, verified: flag },
            }[action]
            const before = [row, ...rest]
            const calls = serve(({ method }) => {
              if (method === 'GET') return ok(before)
              return accepted ? ok(after) : json(400, { status: 400, errors: [] })
            })
            const view = await render(<ProfileEmails />)
            await waitFor(() => shown(before))
            const button = { 'make primary': 'make-primary', resend: 'resend-verification', remove: 'remove-email' }[
              action
            ]
            await fireEvent.press(screen.getByTestId(`${button}-${target}`))
            await waitFor(() => expect(calls).toHaveLength(2))
            const sent = { 'make primary': 'PATCH', resend: 'PUT', remove: 'DELETE' }[action]
            expect(calls[1]).toMatchObject({ method: sent, path: PATH, body: { email: target } })
            const changes = accepted && action !== 'resend'
            await waitFor(() => shown(changes ? after : before))
            await view.unmount()
          }
        )
      )
    }
  )
})
