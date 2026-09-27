import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, SocialLoginButtons, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Text } from 'react-native'

export default function Signup() {
  const { t } = useTranslation()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response } = await getAuthApi().signup({ username, email, password })
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      const authErrors = extractAuthErrors(response)
      setError(authErrors?.[0]?.message ?? t('signupError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen testID="signup-form">
      <Heading testID="signup-heading">{t('signupHeading')}</Heading>
      <TextField
        testID="username-input"
        placeholder={t('usernamePlaceholder')}
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
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
      {error && <ErrorText testID="signup-error">{error}</ErrorText>}
      <Button
        testID="signup-submit"
        labelTestID="signup-submit-label"
        disabled={submitting}
        onPress={submit}
        label={submitting ? t('signupSubmitting') : t('signupSubmit')}
      />
      <SocialLoginButtons onError={setError} />
      <Link href="/login" testID="login-link">
        <Text>{t('signupLoginLink')}</Text>
      </Link>
    </Screen>
  )
}
