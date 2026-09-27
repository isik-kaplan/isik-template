import { useState } from 'react'

import { Button, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { Link } from 'expo-router'
import { Text } from 'react-native'

export default function ForgotPassword() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    setSubmitting(true)
    // allauth intentionally never reveals whether the address is registered - show the same
    // "check your email" confirmation regardless of the response. No failure path to recover
    // into means no need to reset `submitting` afterwards either - the form unmounts either way.
    await getAuthApi().requestPasswordReset(email)
    setSent(true)
  }

  if (sent) {
    return (
      <Screen testID="forgot-password-sent">
        <Heading testID="forgot-password-heading">{t('forgotPasswordSentHeading')}</Heading>
        <Text testID="forgot-password-sent-message">{t('forgotPasswordSentMessage', { email })}</Text>
        <Link href="/login" testID="login-link">
          <Text>{t('backToLoginLink')}</Text>
        </Link>
      </Screen>
    )
  }

  return (
    <Screen testID="forgot-password-form">
      <Heading testID="forgot-password-heading">{t('forgotPasswordHeading')}</Heading>
      <TextField
        testID="email-input"
        placeholder={t('emailPlaceholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <Button
        testID="forgot-password-submit"
        labelTestID="forgot-password-submit-label"
        disabled={submitting}
        onPress={submit}
        label={submitting ? t('forgotPasswordSubmitting') : t('forgotPasswordSubmit')}
      />
      <Link href="/login" testID="login-link">
        <Text>{t('backToLoginLink')}</Text>
      </Link>
    </Screen>
  )
}
