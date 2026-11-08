import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf, hasPendingVerifyEmail, pendingMfaTypes } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Text } from 'react-native'

/** The code allauth texted at signup, or at a login by a number never verified. */
export default function VerifyPhone() {
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function verify() {
    setSubmitting(true)
    setError(undefined)
    setNotice(undefined)
    try {
      const { data, error: response, response: http } = await getAuthApi().verifyPhone(code.trim())
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        setError(throttled)
        return
      }
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      // After a signup the address is owed next, by a link in the mail; after a login, maybe a second factor.
      if (hasPendingVerifyEmail(response)) {
        setNotice(t('verifyPhoneThenEmail'))
        return
      }
      if (pendingMfaTypes(response) !== null) {
        router.push('/two-factor')
        return
      }
      setError(errorsOf(response)?.[0]?.message ?? t('verifyPhoneError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function resend() {
    setError(undefined)
    const { response } = await getAuthApi().resendPhoneCode()
    if (response.ok) setNotice(t('verifyPhoneResent'))
    else setError(tooManyRequestsMessage(t, response) ?? t('verifyPhoneResendError'))
  }

  async function change() {
    setError(undefined)
    const { data, error: response, response: http } = await getAuthApi().changePhone(number)
    if (data) {
      setNumber('')
      setNotice(t('verifyPhoneChanged'))
      return
    }
    setError(tooManyRequestsMessage(t, http) ?? errorsOf(response)?.[0]?.message ?? t('verifyPhoneChangeError'))
  }

  return (
    <Screen testID="verify-phone-form">
      <Heading testID="verify-phone-heading">{t('verifyPhoneHeading')}</Heading>
      <TextField
        testID="verify-phone-code-input"
        placeholder={t('verifyPhoneCodePlaceholder')}
        autoCapitalize="characters"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        value={code}
        onChangeText={setCode}
      />
      {error && <ErrorText testID="verify-phone-error">{error}</ErrorText>}
      {notice && <Text testID="verify-phone-notice">{notice}</Text>}
      <Button
        testID="verify-phone-submit"
        labelTestID="verify-phone-submit-label"
        disabled={submitting || code.trim().length === 0}
        onPress={verify}
        label={submitting ? t('verifyPhoneSubmitting') : t('verifyPhoneSubmit')}
      />
      <Button testID="verify-phone-resend" label={t('verifyPhoneResend')} onPress={resend} />
      <TextField
        testID="verify-phone-number-input"
        placeholder={t('phonePlaceholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        value={number}
        onChangeText={setNumber}
      />
      <Button
        testID="verify-phone-change"
        label={t('verifyPhoneChange')}
        disabled={number.length === 0}
        onPress={change}
      />
      <Link href="/login" testID="verify-phone-login-link">
        <Text>{t('backToLoginLink')}</Text>
      </Link>
    </Screen>
  )
}
