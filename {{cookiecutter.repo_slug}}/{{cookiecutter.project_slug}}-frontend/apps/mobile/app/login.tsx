import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, SocialLoginButtons, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { handleLogsIn } from '@/lib/names'
import { PHONE } from '@/lib/phoneOption'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf, hasPendingVerifyEmail, pendingFlow, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import type { TFunction } from 'i18next'
import { Text } from 'react-native'

/** The identifier the backend takes the typed login as. */
function credentialsOf(login: string, byHandle: boolean, byPhone: boolean) {
  if (byPhone && login.startsWith('+')) return { phone: login }
  return byHandle && !login.includes('@') ? { username: login } : { email: login }
}

/** The login field's placeholder, naming only the ways in this project has. */
function identifierPlaceholder(t: TFunction, byHandle: boolean, byPhone: boolean): string {
  if (byHandle && byPhone) return t('loginIdentifierWithPhonePlaceholder')
  if (byHandle) return t('loginIdentifierPlaceholder')
  if (byPhone) return t('loginEmailOrPhonePlaceholder')
  return t('emailPlaceholder')
}

export default function Login() {
  const { t } = useTranslation()
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const byHandle = handleLogsIn()
  // A number signs in only where every account has one.
  const byPhone = PHONE === 'required'
  const placeholder = identifierPlaceholder(t, byHandle, byPhone)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const {
        data,
        error: response,
        response: http,
      } = await getAuthApi().login({
        ...credentialsOf(login, byHandle, byPhone),
        password,
      })
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        setError(throttled)
        return
      }
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      // Password right, address unconfirmed: allauth mails a fresh link.
      if (hasPendingVerifyEmail(response)) {
        setError(t('loginVerifyEmailRequired'))
        return
      }
      if (pendingFlow(response, 'verify_phone')) {
        router.push('/verify-phone')
        return
      }
      if (pendingMfaTypes(response) !== null) {
        router.push('/two-factor')
        return
      }
      const authErrors = errorsOf(response)
      setError(authErrors?.[0]?.message ?? t('loginError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen testID="login-form">
      <Heading testID="login-heading">{t('loginHeading')}</Heading>
      <TextField
        testID="email-input"
        placeholder={placeholder}
        autoCapitalize="none"
        keyboardType={byHandle || byPhone ? 'default' : 'email-address'}
        value={login}
        onChangeText={setLogin}
      />
      <TextField
        testID="password-input"
        placeholder={t('passwordPlaceholder')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <ErrorText testID="login-error">{error}</ErrorText>}
      <Button
        testID="login-submit"
        labelTestID="login-submit-label"
        disabled={submitting}
        onPress={submit}
        label={submitting ? t('loginSubmitting') : t('loginSubmit')}
      />
      <SocialLoginButtons onError={setError} />
      <Link href="/signup" testID="signup-link">
        <Text>{t('loginSignupLink')}</Text>
      </Link>
      <Link href="/forgot-password" testID="forgot-password-link">
        <Text>{t('loginForgotPasswordLink')}</Text>
      </Link>
    </Screen>
  )
}
