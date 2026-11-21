import { useState } from 'react'

import {
  Button,
  ErrorText,
  Heading,
  LegalConsentNotice,
  NameFields,
  Screen,
  SocialLoginButtons,
  TextField,
} from '@/components'

import { useTranslation } from '@/lib/i18n'
import { type NameField, offeredNames, offeredValues } from '@/lib/names'
import { phoneOf } from '@/lib/phone'
import { PHONE } from '@/lib/phoneOption'
import { getAuthApi } from '@/lib/session'
import { passwordsSignIn } from '@/lib/socialProviders'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf, pendingFlow } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Link, router } from 'expo-router'
import { Text } from 'react-native'

export default function Signup() {
  const { t } = useTranslation()
  const [names, setNames] = useState<Record<NameField, string>>({ first_name: '', last_name: '', username: '' })
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    try {
      const {
        data,
        error: response,
        response: http,
      } = await getAuthApi().signup({ email, ...phoneOf(phone), password, ...offeredValues(names) })
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        setError(throttled)
        return
      }
      if (data?.meta.is_authenticated) {
        router.replace('/(authenticated)/home')
        return
      }
      if (pendingFlow(response, 'verify_phone')) {
        router.push('/verify-phone')
        return
      }
      const authErrors = errorsOf(response)
      setError(authErrors?.[0]?.message ?? t('signupError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen testID="signup-form">
      <Heading testID="signup-heading">{t('signupHeading')}</Heading>
      {passwordsSignIn() && (
        <>
          <NameFields
            shown={offeredNames()}
            values={names}
            onChange={(name, value) => setNames((current) => ({ ...current, [name]: value }))}
          />
          <TextField
            testID="email-input"
            placeholder={t('emailPlaceholder')}
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          {PHONE !== 'none' && (
            <TextField
              testID="phone-input"
              placeholder={PHONE === 'required' ? t('phonePlaceholder') : t('phoneOptionalPlaceholder')}
              keyboardType="phone-pad"
              autoComplete="tel"
              value={phone}
              onChangeText={setPhone}
            />
          )}
          <TextField
            testID="password-input"
            placeholder={t('passwordPlaceholder')}
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </>
      )}
      {error && <ErrorText testID="signup-error">{error}</ErrorText>}
      {passwordsSignIn() && (
        <Button
          testID="signup-submit"
          labelTestID="signup-submit-label"
          disabled={submitting}
          onPress={submit}
          label={submitting ? t('signupSubmitting') : t('signupSubmit')}
        />
      )}
      <SocialLoginButtons onError={setError} />
      <LegalConsentNotice />
      <Link href="/login" testID="login-link">
        <Text>{t('signupLoginLink')}</Text>
      </Link>
    </Screen>
  )
}
