import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { router } from 'expo-router'
import { Text } from 'react-native'

// Landed on right after a first-ever social sign-in - SOCIALACCOUNT_AUTO_SIGNUP is off, so the
// provider's suggested username is always confirmable here first, not committed silently. Always
// re-fetches its own pending state on mount (rather than taking it as a route param) so a direct
// visit with no pending signup - reached this screen, then closed and reopened the app, say -
// redirects back to login instead of rendering a broken form.
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

  // Takes email as a plain parameter rather than closing over the possibly-undefined state
  // directly, so the only caller (the button below, built after the render guard has already
  // narrowed it) can pass a definitely-defined value - no redundant, untestable runtime guard.
  async function submit(email: string) {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: apiError } = await getAuthApi().completeProviderSignup({ username, email, password })
      const authErrors = extractAuthErrors(apiError)
      // A 401 here can still mean the account was created - mandatory email verification just
      // means it isn't logged in yet (same shape as signup itself: only a real, non-empty errors
      // array means the submission actually failed).
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
    </Screen>
  )
}
