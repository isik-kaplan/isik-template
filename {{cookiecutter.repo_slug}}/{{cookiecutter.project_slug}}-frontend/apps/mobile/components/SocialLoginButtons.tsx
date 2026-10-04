import { useTranslation } from '@/lib/i18n'
import { type ProviderToken, signInWithApple, signInWithGoogle } from '@/lib/nativeSignIn'
import { getAuthApi } from '@/lib/session'
import { APPLE_SIGN_IN_ENABLED, GOOGLE_SIGN_IN_ENABLED } from '@/lib/socialProviders'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Button } from './Button'
import { router } from 'expo-router'
import { Platform } from 'react-native'

type SocialLoginButtonsProps = {
  onError: (message: string) => void
  // Default to the generated config, not hardcoded - overridable so tests can exercise every
  // on/off combination directly, without reaching for jest.mock() gymnastics on a module whose
  // values are baked in at generation time.
  googleEnabled?: boolean
  appleEnabled?: boolean
}

/** Renders nothing at all when neither provider is configured for this project (see
 * lib/socialProviders.ts) - Apple's own button is further limited to iOS, the only platform its
 * SDK supports. */
export function SocialLoginButtons({
  onError,
  googleEnabled = GOOGLE_SIGN_IN_ENABLED,
  appleEnabled = APPLE_SIGN_IN_ENABLED,
}: SocialLoginButtonsProps) {
  const { t } = useTranslation()

  async function handle(signIn: () => Promise<ProviderToken | null>) {
    try {
      const result = await signIn()
      if (!result) return // the user cancelled the native picker - not a failure to report.

      const { data, error } = await getAuthApi().loginWithProviderToken(result.provider, result.token)
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      const authErrors = extractAuthErrors(error)
      if (authErrors?.length) {
        onError(authErrors[0].message)
        return
      }
      // No error, but not authenticated either - SOCIALACCOUNT_AUTO_SIGNUP is off, so a
      // never-seen-before provider account always lands in this pending state first.
      // complete-signup.tsx re-fetches that pending state itself, so it's always safe to go there.
      router.push('/complete-signup')
    } catch {
      onError(t('socialLoginError'))
    }
  }

  if (!googleEnabled && !appleEnabled) return null

  return (
    <>
      {googleEnabled && (
        <Button testID="google-signin" label={t('socialLoginGoogle')} onPress={() => handle(signInWithGoogle)} />
      )}
      {appleEnabled && Platform.OS === 'ios' && (
        <Button testID="apple-signin" label={t('socialLoginApple')} onPress={() => handle(signInWithApple)} />
      )}
    </>
  )
}
