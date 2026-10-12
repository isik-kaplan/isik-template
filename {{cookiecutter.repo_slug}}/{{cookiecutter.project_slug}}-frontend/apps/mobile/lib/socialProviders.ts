// A native app has no OAuth redirect to follow (see AppAuthApi.loginWithProviderToken's own
// comment) - only providers with an on-device sign-in SDK can work here at all, unlike the web
// app, which works for any allauth-configured provider via redirect. So of the provider ids the
// backend's SOCIAL_LOGIN__PROVIDERS names, only google and apple ever turn a button on here.
//
// EXPO_PUBLIC_SOCIAL_LOGIN_PROVIDERS is inlined at build time like every other EXPO_PUBLIC_*
// variable (see lib/config.ts). Both native SDKs are always installed, so this, not the dependency,
// is what says whether the backend actually has the provider configured.
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
