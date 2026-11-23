import DeleteAccount from '@/app/(authenticated)/profile/delete'
import DeletionScheduled from '@/app/deletion-scheduled'

import { forgetNavigation, navigation, routeParams } from '../../support/navigation'
import { held, json, serve } from '../../support/signedIn/server'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const DELETION = '/v0/users/me/deletion/'
const deletion = fc.record({
  deletion_mode: fc.constantFrom('erase', 'anonymize'),
  after_days: fc.integer({ min: 1, max: 60 }),
})
const deletesAt = fc
  .date({ min: new Date('2026-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
  .map((date) => date.toISOString())
// What asking can come back as: scheduled, sent off to prove it is them first, or anything else that failed.
type Outcome = 'scheduled' | 'prove first' | 'failed'
const OUTCOMES: Outcome[] = ['scheduled', 'prove first', 'failed']

function answer(outcome: Outcome, at: string) {
  if (outcome === 'scheduled') return json(202, { deletes_at: at })
  if (outcome === 'prove first') return json(403, {}, { 'X-Reauthentication-Required': '1' })
  return json(500, {})
}

describe('the delete account screen', () => {
  it('says what the deployment does with an account and when, before offering it', async () => {
    await fc.assert(
      fc.asyncProperty(deletion, async (described) => {
        serve(() => json(200, described))
        const view = await render(<DeleteAccount />)

        await waitFor(() => expect(screen.getByTestId('delete-account')).toBeTruthy())
        const what = screen.getByTestId('delete-account-what').props.children as string
        expect(what.includes('nameless')).toBe(described.deletion_mode === 'anonymize')
        const when = screen.getByTestId('delete-account-when').props.children as string
        expect(
          when.startsWith(described.after_days === 1 ? 'It happens a day' : `It happens ${described.after_days} days`)
        ).toBe(true)
        await view.unmount()
      })
    )
  })

  it('asks exactly once per confirmation, and leaves only once it is scheduled', async () => {
    await fc.assert(
      fc.asyncProperty(
        deletion,
        fc.constantFrom(...OUTCOMES),
        deletesAt,
        fc.boolean(),
        async (described, outcome, at, backOut) => {
          forgetNavigation()
          const calls = serve((call) => (call.method === 'POST' ? answer(outcome, at) : json(200, described)))
          const view = await render(<DeleteAccount />)
          await waitFor(() => expect(screen.getByTestId('delete-account-start')).toBeTruthy())

          await fireEvent.press(screen.getByTestId('delete-account-start'))
          if (backOut) {
            await fireEvent.press(screen.getByTestId('delete-account-keep'))
            expect(screen.getByTestId('delete-account-start')).toBeTruthy()
            expect(calls.filter((call) => call.method === 'POST')).toEqual([])
            await view.unmount()
            return
          }
          await fireEvent.press(screen.getByTestId('delete-account-confirm'))

          const asked = () => calls.filter((call) => call.path === DELETION && call.method === 'POST')
          await waitFor(() => expect(asked()).toHaveLength(1))
          expect(asked()[0].headers.get('Idempotency-Key')).toBeTruthy()
          if (outcome === 'scheduled') {
            await waitFor(() =>
              expect(navigation.replace).toHaveBeenCalledWith({ pathname: '/deletion-scheduled', params: { on: at } })
            )
            // The token is forgotten here too.
            expect(calls.some((call) => call.method === 'DELETE' && call.path.endsWith('/auth/session'))).toBe(true)
          } else {
            await waitFor(() => expect(screen.getByTestId('delete-account-error')).toBeTruthy())
            expect(navigation.replace).not.toHaveBeenCalled()
            expect(screen.getByTestId('delete-account-confirm').props.accessibilityState.disabled).toBe(false)
            expect(navigation.push.mock.calls).toEqual(outcome === 'prove first' ? [['/prove']] : [])
          }
          await view.unmount()
        }
      )
    )
  })
})

describe('the delete account screen, gone before it heard', () => {
  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(deletion, async (described) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<DeleteAccount />)
        await view.unmount()
        answer.release(json(200, described))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryByTestId('delete-account')).toBeNull()
      })
    )
  })
})

describe('the deletion scheduled screen', () => {
  it('names the day only when it was given one it can read, and always the way back', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(fc.oneof(deletesAt, fc.string({ maxLength: 8 })), { nil: undefined }), async (on) => {
        forgetNavigation()
        routeParams.current = { on }
        const view = await render(<DeletionScheduled />)

        const body = screen.getByTestId('deletion-scheduled-body').props.children as string
        expect(body.startsWith('It will be deleted on')).toBe(!Number.isNaN(new Date(on ?? '').getTime()))
        await fireEvent.press(screen.getByTestId('deletion-scheduled-sign-in'))
        expect(navigation.replace).toHaveBeenCalledWith('/login')
        await view.unmount()
      })
    )
  })
})
