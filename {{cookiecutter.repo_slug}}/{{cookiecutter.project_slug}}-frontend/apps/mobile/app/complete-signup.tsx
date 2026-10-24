import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, LegalConsentNotice, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { router } from 'expo-router'
import { Text } from 'react-native'

// Re-fetches the pending signup rather than taking a route param, so a stale visit redirects to login.
export default function CompleteSignup() {
  const { t } = useTranslation()
  const [email, setEmail] = useState<string | undefined>()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getAuthApi()
      .pendingProviderSignup()
      .then(({ data }) => {
        if (!data) {
          router.replace('/login')
          return
        }
        setEmail(data.data.user.email)
        setUsername(data.data.user.username)
      })
  }, [])

  // A parameter, not closed-over state, so the caller passes the value the render guard narrowed.
  async function submit(email: string) {
    setSubmitting(true)
    setError(undefined)
    try {
      const {
        data,
        error: apiError,
        response: http,
      } = await getAuthApi().completeProviderSignup({ username, email, password })
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        setError(throttled)
        return
      }
      const authErrors = errorsOf(apiError)
      // A 401 can still mean created but awaiting email verification; only non-empty errors is a failure.
      if (data?.meta.is_authenticated || !authErrors?.length) {
        router.replace(data?.meta.is_authenticated ? '/(authenticated)/home' : '/login')
        return
      }
      setError(authErrors[0].message)
    } finally {
      setSubmitting(false)
    }
  }

  if (email === undefined) return null

  return (
    <Screen testID="complete-signup-form">
      <Heading testID="complete-signup-heading">{t('completeSignupHeading')}</Heading>
      <Text testID="complete-signup-email">{email}</Text>
      <TextField
        testID="username-input"
        placeholder={t('usernamePlaceholder')}
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextField
        testID="password-input"
        placeholder={t('passwordPlaceholder')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <ErrorText testID="complete-signup-error">{error}</ErrorText>}
      <Button
        testID="complete-signup-submit"
        labelTestID="complete-signup-submit-label"
        disabled={submitting}
        onPress={() => submit(email)}
        label={submitting ? t('completeSignupSubmitting') : t('completeSignupSubmit')}
      />
      <LegalConsentNotice />
    </Screen>
  )
}
