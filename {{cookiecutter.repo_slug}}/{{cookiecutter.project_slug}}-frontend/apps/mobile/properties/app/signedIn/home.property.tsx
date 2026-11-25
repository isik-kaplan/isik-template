import Home from '@/app/(authenticated)/home'

import { forgetNavigation, navigation } from '../../support/navigation'
import { email, held, json, ok, serve } from '../../support/signedIn/server'
import { kept } from '../../support/store'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import fc from 'fast-check'

const DEVICE = '/v0/notifications/devices/'

describe('the home screen', () => {
  it('greets the account by its email when the session names one, and plainly otherwise', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(email, { nil: undefined }), async (address) => {
        serve(() => (address ? ok({ user: { email: address } }) : json(401, { status: 401, meta: {} })))
        const view = await render(<Home />)
        const greeting = address ? `You're logged in as ${address}` : "You're logged in"
        await waitFor(() => expect(screen.getByTestId('home-heading').props.children).toBe(greeting))
        await view.unmount()
      })
    )
  })

  it('shows nothing it hears after the screen has gone', async () => {
    await fc.assert(
      fc.asyncProperty(email, async (address) => {
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<Home />)
        await view.unmount()
        answer.release(ok({ user: { email: address } }))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(screen.queryByTestId('home-heading')).toBeNull()
      })
    )
  })

  it('opens the profile and the notifications from their buttons, in any order', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom('profile', 'notifications'), { maxLength: 4 }), async (pressed) => {
        forgetNavigation()
        serve(() => json(401, { status: 401, meta: {} }))
        const view = await render(<Home />)
        for (const page of pressed) await fireEvent.press(screen.getByTestId(`${page}-link`))
        expect(navigation.push.mock.calls).toEqual(pressed.map((page) => [`/${page}`]))
        await view.unmount()
      })
    )
  })

  it('signs out to the login whatever became of forgetting this phone, and keeps it only when the server was not reached', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('no phone kept', 'forgotten', 'already gone', 'unreachable', 'aborted'),
        fc.uuid(),
        async (device, id) => {
          forgetNavigation()
          kept.clear()
          kept.set('session_token', 'a-token')
          if (device !== 'no phone kept') kept.set('push_device', id)
          const calls = serve(({ method, path }) => {
            if (path === `${DEVICE}${id}/`) {
              if (device === 'unreachable') throw new TypeError('Network request failed')
              if (device === 'aborted') throw Object.assign(new Error('aborted'), { name: 'AbortError' })
              return device === 'forgotten' ? new Response(null, { status: 204 }) : json(404, {})
            }
            if (method === 'DELETE') return json(401, { status: 401, meta: { is_authenticated: false } })
            return ok({ user: { email: 'a@b.cd' } })
          })
          const view = await render(<Home />)
          await fireEvent.press(screen.getByTestId('logout-button'))
          await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/login'))
          const asked = calls.filter((call) => call.path.startsWith(DEVICE))
          expect(asked.map((call) => call.method)).toEqual(device === 'no phone kept' ? [] : ['DELETE'])
          expect(kept.has('push_device')).toBe(device === 'unreachable' || device === 'aborted')
          expect(kept.has('session_token')).toBe(false)
          expect(calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/v0/app/auth/session' })
          await view.unmount()
        }
      )
    )
  })
})
