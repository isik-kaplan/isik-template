import { forgetPush, registerForPush, showPushesWhileOpen } from '@/lib/push'

import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn(),
  getDevicePushTokenAsync: jest.fn(),
  setNotificationHandler: jest.fn(),
}))
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn() }))
const mockRegisterDevice = jest.fn()
const mockForgetDevice = jest.fn()
jest.mock('@/lib/api', () => ({
  getApi: () => ({
    registerDevice: (...args: unknown[]) => mockRegisterDevice(...args),
    forgetDevice: (...args: unknown[]) => mockForgetDevice(...args),
  }),
}))

const allowed = (granted: boolean) =>
  (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ granted })
const token = (type: string) =>
  (Notifications.getDevicePushTokenAsync as jest.Mock).mockResolvedValue({ type, data: 'a1b2' })

describe('push', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockRegisterDevice.mockResolvedValue({ data: { id: 'd1' } })
  })

  afterEach(() => {
    ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true
  })

  it("registers an iPhone's APNs token, as the sandbox's in a development build, and keeps its id", async () => {
    allowed(true)
    token('ios')
    await registerForPush()
    expect(mockRegisterDevice).toHaveBeenCalledWith({ platform: 'apns', token: 'a1b2', environment: 'sandbox' })
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('push_device', 'd1')
  })

  it("registers an Android phone's FCM token, as production's in a release build", async () => {
    ;(globalThis as unknown as { __DEV__: boolean }).__DEV__ = false
    allowed(true)
    token('android')
    await registerForPush()
    expect(mockRegisterDevice).toHaveBeenCalledWith({ platform: 'fcm', token: 'a1b2', environment: 'production' })
  })

  it('asks nothing of the backend when pushes are not allowed', async () => {
    allowed(false)
    await registerForPush()
    expect(Notifications.getDevicePushTokenAsync).not.toHaveBeenCalled()
    expect(mockRegisterDevice).not.toHaveBeenCalled()
  })

  it('registers nothing where the token is no phone service its own', async () => {
    allowed(true)
    token('web')
    await registerForPush()
    expect(mockRegisterDevice).not.toHaveBeenCalled()
  })

  it('keeps nothing when the backend refused the registration', async () => {
    allowed(true)
    token('ios')
    mockRegisterDevice.mockResolvedValue({ data: undefined })
    await registerForPush()
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('forgets the phone it registered, then its id', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue('d1')
    await forgetPush()
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('push_device')
    expect(mockForgetDevice).toHaveBeenCalledWith('d1')
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('push_device')
  })

  it('forgets nothing when it registered nothing', async () => {
    ;(SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null)
    await forgetPush()
    expect(mockForgetDevice).not.toHaveBeenCalled()
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled()
  })

  it('shows a push that arrives while the app is open, silently, with its badge', async () => {
    showPushesWhileOpen()
    const [{ handleNotification }] = (Notifications.setNotificationHandler as jest.Mock).mock.calls[0]
    expect(await handleNotification()).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    })
  })
})
