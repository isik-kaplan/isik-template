import { useState } from 'react'

import { Button, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { passwordsSignIn } from '@/lib/socialProviders'

import { Link, Redirect } from 'expo-router'
import { Text } from 'react-native'

// Reached by a link or a stale route even when nobody signs in with a password.
export default function ForgotPassword() {
  return passwordsSignIn() ? <ForgotPasswordForm /> : <Redirect href="/login" />
}

function ForgotPasswordForm() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  async function submit() {
    setSubmitting(true)
    // allauth never reveals whether the address is registered, so every answer reads as sent.
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
