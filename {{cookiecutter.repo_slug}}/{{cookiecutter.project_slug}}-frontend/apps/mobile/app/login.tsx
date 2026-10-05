import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, SocialLoginButtons, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { extractAuthErrors, hasPendingVerifyEmail, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

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
      const { data, error: response } = await getAuthApi().login({ email, password })
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      // The password was right; allauth refuses until the address is confirmed and mails a fresh link.
      if (hasPendingVerifyEmail(response)) {
        setError(t('loginVerifyEmailRequired'))
        return
      }
      // The password was right; an account with a second factor still owes it.
      if (pendingMfaTypes(response) !== null) {
        router.push('/two-factor')
        return
      }
      const authErrors = extractAuthErrors(response)
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
