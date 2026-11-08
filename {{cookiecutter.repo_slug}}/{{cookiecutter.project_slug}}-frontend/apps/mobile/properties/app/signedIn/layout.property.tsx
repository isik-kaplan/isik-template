import AuthenticatedLayout from '@/app/(authenticated)/_layout'

import { forgetNavigation, navigation } from '../../support/navigation'
import { held, json, serve } from '../../support/signedIn/server'
import { kept } from '../../support/store'
import { render, screen, waitFor } from '@testing-library/react-native'
import * as ExpoNotifications from 'expo-notifications'
import fc from 'fast-check'

type Tapped = ReturnType<typeof ExpoNotifications.useLastNotificationResponse>
// The module object itself: `import * as` hands this file a copy, which a spy would replace in vain.
const mocked = jest.requireMock<{ useLastNotificationResponse: () => Tapped }>('expo-notifications')

const session = (signedIn: boolean) =>
  signedIn
    ? json(200, {
        status: 200,
        data: { user: { id: 1, email: 'a@b.cd' }, methods: [] },
        meta: { is_authenticated: true },
      })
    : json(401, { status: 401, data: { flows: [] }, meta: { is_authenticated: false } })

describe('the signed-in area', () => {
  it('lets in only a signed-in visitor, who then asks for pushes and is taken to a tapped one', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('allowed', 'denied', 'no token to give'),
        async (signedIn, tapped, permission) => {
          forgetNavigation()
          kept.clear()
          jest.clearAllMocks()
          mocked.useLastNotificationResponse = () => (tapped ? { notification: {} } : null) as Tapped
          jest.mocked(ExpoNotifications.requestPermissionsAsync).mockResolvedValue({
            granted: permission !== 'denied',
          } as Awaited<ReturnType<typeof ExpoNotifications.requestPermissionsAsync>>)
          if (permission === 'no token to give') {
            jest
              .mocked(ExpoNotifications.getDevicePushTokenAsync)
              .mockRejectedValue(new Error('no token on a simulator'))
          } else {
            jest.mocked(ExpoNotifications.getDevicePushTokenAsync).mockResolvedValue({ type: 'web', data: 'x' })
          }
          const answer = held<Response>()
          serve(() => answer.promise)
          const view = await render(<AuthenticatedLayout />)
          expect(screen.getByTestId('loading-indicator')).toBeTruthy()
          answer.release(session(signedIn))
          await waitFor(() => expect(screen.getByTestId(signedIn ? 'slot' : 'redirect')).toBeTruthy())
          if (!signedIn) expect(screen.getByTestId('redirect').props.accessibilityHint).toBe('/login')
          expect(jest.mocked(ExpoNotifications.requestPermissionsAsync).mock.calls).toHaveLength(signedIn ? 1 : 0)
          expect(jest.mocked(ExpoNotifications.setNotificationHandler).mock.calls).toHaveLength(signedIn ? 1 : 0)
          expect(navigation.push.mock.calls).toEqual(signedIn && tapped ? [['/notifications']] : [])
          await view.unmount()
        }
      )
    )
  })

  it('stays loading, and decides nothing, when the screen goes before the session answers', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), async (signedIn) => {
        jest.clearAllMocks()
        const answer = held<Response>()
        serve(() => answer.promise)
        const view = await render(<AuthenticatedLayout />)
        await view.unmount()
        answer.release(session(signedIn))
        await new Promise((settle) => setTimeout(settle, 0))
        expect(ExpoNotifications.setNotificationHandler).not.toHaveBeenCalled()
      })
    )
  })
})
