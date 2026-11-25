// A physical device or the Android emulator can't resolve *.test; use the host's LAN IP (or 10.0.2.2).
// Each caller names its variable in full: a build inlines process.env.EXPO_PUBLIC_*, never a name looked up.
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set - see this app's README for local dev setup`)
  }
  return value
}

export function apiOrigin(): string {
  return requireEnv('EXPO_PUBLIC_API_ORIGIN', process.env.EXPO_PUBLIC_API_ORIGIN)
}

export function authOrigin(): string {
  return requireEnv('EXPO_PUBLIC_AUTH_ORIGIN', process.env.EXPO_PUBLIC_AUTH_ORIGIN)
}

// The auth origin without its subdomain.
export function webOrigin(): string {
  return authOrigin().replace('://auth.', '://')
}
