import { useTranslation } from '@/lib/i18n'
import { type ProviderToken, signInWithApple, signInWithGoogle } from '@/lib/nativeSignIn'
import { getAuthApi } from '@/lib/session'
import { appleSignInEnabled, googleSignInEnabled } from '@/lib/socialProviders'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Button } from './Button'
import { router } from 'expo-router'
import { Platform } from 'react-native'

type SocialLoginButtonsProps = {
  onError: (message: string) => void
  // Default to the build's configuration.
  googleEnabled?: boolean
  appleEnabled?: boolean
}

/** Apple's button is iOS-only, the only platform its SDK supports. */
export function SocialLoginButtons({
  onError,
  googleEnabled = googleSignInEnabled(),
  appleEnabled = appleSignInEnabled(),
}: SocialLoginButtonsProps) {
  const { t } = useTranslation()

  async function handle(signIn: () => Promise<ProviderToken | null>) {
    try {
      const result = await signIn()
      if (!result) return // the user cancelled the native picker - not a failure to report.

      const { data, error, response: http } = await getAuthApi().loginWithProviderToken(result.provider, result.token)
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        onError(throttled)
        return
      }
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      if (pendingMfaTypes(error) !== null) {
        router.push('/two-factor')
        return
      }
      const authErrors = errorsOf(error)
      if (authErrors?.length) {
        onError(authErrors[0].message)
        return
      }
      // Auto-signup is off, so a new provider account lands in a pending signup.
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
