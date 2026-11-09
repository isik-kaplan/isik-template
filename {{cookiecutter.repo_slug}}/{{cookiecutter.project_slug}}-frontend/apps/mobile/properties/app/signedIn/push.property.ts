import { forgetPush, registerForPush, showPushesWhileOpen } from '@/lib/push'

import { json, serve } from '../../support/signedIn/server'
import { kept } from '../../support/store'
import * as ExpoNotifications from 'expo-notifications'
import fc from 'fast-check'

type Permission = Awaited<ReturnType<typeof ExpoNotifications.requestPermissionsAsync>>
type Token = Awaited<ReturnType<typeof ExpoNotifications.getDevicePushTokenAsync>>

const DEVICES = '/v0/notifications/devices/'
const PLATFORMS: Record<string, string> = { ios: 'apns', android: 'fcm' }
const development = globalThis as unknown as { __DEV__: boolean }

describe('push registration', () => {
  // One property per case: refused permission, a platform with no push, kept by the server, refused by it.
  it.each(['denied', 'web', 'kept', 'refused'])(
    "registers only an allowed phone's own token, for its platform and build, and keeps the id the server gave: %s",
    async (situation) => {
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('ios', 'android'),
          fc.stringMatching(/^[a-f0-9]{16,64}$/),
          fc.boolean(),
          fc.uuid(),
          async (mobile, token, dev, id) => {
            const granted = situation !== 'denied'
            const type = situation === 'web' ? 'web' : mobile
            const device = situation === 'refused' ? undefined : id
            kept.clear()
            development.__DEV__ = dev
            jest.mocked(ExpoNotifications.requestPermissionsAsync).mockResolvedValue({ granted } as Permission)
            jest.mocked(ExpoNotifications.getDevicePushTokenAsync).mockResolvedValue({ type, data: token } as Token)
            const calls = serve(() => (device ? json(201, { id: device }) : json(400, { platform: ['Not valid.'] })))
            await registerForPush()
            const registers = granted && type in PLATFORMS
            expect(calls.map((call) => call.body)).toEqual(
              registers ? [{ platform: PLATFORMS[type], token, environment: dev ? 'sandbox' : 'production' }] : []
            )
            if (registers) expect(calls[0]).toMatchObject({ method: 'POST', path: DEVICES })
            expect(kept.get('push_device')).toBe(registers ? device : undefined)
          }
        )
      )
      development.__DEV__ = true
    }
  )

  it('forgets the kept phone with the server and locally, and asks nothing when none is kept', async () => {
    await fc.assert(
      fc.asyncProperty(fc.option(fc.uuid(), { nil: undefined }), async (device) => {
        kept.clear()
        if (device) kept.set('push_device', device)
        const calls = serve(() => new Response(null, { status: 204 }))
        await forgetPush()
        expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(
          device ? [`DELETE ${DEVICES}${device}/`] : []
        )
        expect(kept.has('push_device')).toBe(false)
      })
    )
  })

  it('shows every push while the app is open, with a badge and no sound', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 3 }), async (times) => {
        jest.mocked(ExpoNotifications.setNotificationHandler).mockClear()
        for (let i = 0; i < times; i += 1) showPushesWhileOpen()
        const handlers = jest.mocked(ExpoNotifications.setNotificationHandler).mock.calls
        expect(handlers).toHaveLength(times)
        for (const [handler] of handlers) {
          await expect(handler?.handleNotification({} as never)).resolves.toEqual({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: false,
            shouldSetBadge: true,
          })
        }
      })
    )
  })
})
