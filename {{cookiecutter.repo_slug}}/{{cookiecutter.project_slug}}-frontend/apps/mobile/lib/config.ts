// React Native has neither window.location (the web app's apiOrigin()/authOrigin()) nor a
// server-side request object to derive an origin from - these are embedded at build time instead,
// Expo's standard convention for anything a client bundle needs (EXPO_PUBLIC_* is inlined into the
// bundle by the Expo CLI, same mechanism as Next's NEXT_PUBLIC_*).
//
// Point these at the docker-compose stack's own domain when running on a device/emulator that
// doesn't share this machine's /etc/hosts: the iOS Simulator does (it's a native macOS process),
// but a physical device or the Android emulator needs the host's LAN IP (or 10.0.2.2 for the
// Android emulator specifically) instead of the *.test hostname.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set - see this app's README for local dev setup`)
  }
  return value
}

export function apiOrigin(): string {
  return requireEnv('EXPO_PUBLIC_API_ORIGIN')
}

export function authOrigin(): string {
  return requireEnv('EXPO_PUBLIC_AUTH_ORIGIN')
}
