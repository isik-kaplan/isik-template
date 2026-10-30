import { getApi } from './api'
import * as Notifications from 'expo-notifications'
import * as SecureStore from 'expo-secure-store'

const DEVICE_KEY = 'push_device'
// The phone's own token, not an Expo push token: the backend sends to APNs and FCM itself.
const PLATFORMS = { ios: 'apns', android: 'fcm' } as const

/** Registers this phone once its person allows pushes - at every start, since its token can change. */
export async function registerForPush(): Promise<void> {
  const { granted } = await Notifications.requestPermissionsAsync()
  if (!granted) return
  const { type, data } = await Notifications.getDevicePushTokenAsync()
  if (!(type in PLATFORMS)) return
  const { data: device } = await getApi().registerDevice({
    platform: PLATFORMS[type as keyof typeof PLATFORMS],
    token: data,
    // A development build's APNs token is the sandbox's, which production refuses. FCM ignores it.
    environment: __DEV__ ? 'sandbox' : 'production',
  })
  if (device) await SecureStore.setItemAsync(DEVICE_KEY, device.id)
}

/** Forgets this phone, so whoever signs out on it gets no more pushes here. */
export async function forgetPush(): Promise<void> {
  const id = await SecureStore.getItemAsync(DEVICE_KEY)
  if (!id) return
  await getApi().forgetDevice(id)
  await SecureStore.deleteItemAsync(DEVICE_KEY)
}

// Shown while the app is open too, as the inbox's badge count says.
export function showPushesWhileOpen(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: true,
    }),
  })
}
