import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, SocialLoginButtons, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf, hasPendingVerifyEmail, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Text } from 'react-native'

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response, response: http } = await getAuthApi().login({ email, password })
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
        placeholder={t('emailPlaceholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
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
