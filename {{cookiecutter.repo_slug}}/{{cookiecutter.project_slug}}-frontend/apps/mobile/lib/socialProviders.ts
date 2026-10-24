// No redirect flow on native, so only providers with an on-device SDK (google, apple) can work.
// Both SDKs are always installed; this variable says whether the backend has the provider configured.
function configured(id: string): boolean {
  const providers: string[] | undefined = process.env.EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS?.split(',')
  return providers?.some((provider) => provider.trim() === id) ?? false
}

export function googleSignInEnabled(): boolean {
  return configured('google')
}

export function appleSignInEnabled(): boolean {
  return configured('apple')
}
