import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Text } from 'react-native'

/** One field takes a TOTP or a recovery code; allauth tells them apart. Passkeys are web-only. */
export default function TwoFactor() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response, response: http } = await getAuthApi().completeMfaChallenge(code.trim())
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        setError(throttled)
        return
      }
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      setError(errorsOf(response)?.[0]?.message ?? t('twoFactorError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen testID="two-factor-form">
      <Heading testID="two-factor-heading">{t('twoFactorHeading')}</Heading>
      <Text testID="two-factor-hint">{t('twoFactorHint')}</Text>
      <TextField
        testID="two-factor-code-input"
        placeholder={t('twoFactorCodePlaceholder')}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        value={code}
        onChangeText={setCode}
      />
      {error && <ErrorText testID="two-factor-error">{error}</ErrorText>}
      <Button
        testID="two-factor-submit"
        labelTestID="two-factor-submit-label"
        disabled={submitting || code.trim().length === 0}
        onPress={submit}
        label={submitting ? t('twoFactorSubmitting') : t('twoFactorSubmit')}
      />
      <Link href="/login" testID="two-factor-login-link">
        <Text>{t('backToLoginLink')}</Text>
      </Link>
    </Screen>
  )
}
