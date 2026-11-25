import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, Screen, Text, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { passwordsSignIn } from '@/lib/socialProviders'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'

import { errorsOf } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { useIsMounted } from '@isikk/core/hooks'
import { router } from 'expo-router'

type Account = { email: string; hasPassword: boolean }

/** A passwordless account is offered setting one by email: a provider round trip needs a browser. With
 * SOCIAL_LOGIN__ONLY nobody has a password, and a code by email proves it instead. */
export default function Prove() {
  const { t } = useTranslation()
  const [account, setAccount] = useState<Account | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .session()
      .then(({ data }) => {
        const user = data?.data.user
        if (isMounted()) setAccount({ email: user?.email ?? '', hasPassword: user?.has_usable_password !== false })
      })
  }, [isMounted])

  async function prove() {
    setSubmitting(true)
    setError(undefined)
    const { data, error: response, response: http } = await getAuthApi().reauthenticate(password)
    setSubmitting(false)
    const throttled = tooManyRequestsMessage(t, http)
    if (throttled) {
      setError(throttled)
      return
    }
    if (data) {
      router.back()
      return
    }
    setError(errorsOf(response)?.[0]?.message ?? t('proveError'))
  }

  async function sendSetPasswordLink(email: string) {
    setSubmitting(true)
    // allauth never says whether the address is registered, so there is no refusal to show.
    await getAuthApi().requestPasswordReset(email)
    setSent(true)
  }

  async function sendCode(email: string) {
    setSubmitting(true)
    setError(undefined)
    const { error: response, response: http } = await getAuthApi().requestReauthenticationCode({ email })
    setSubmitting(false)
    if (response) {
      setError(tooManyRequestsMessage(t, http) ?? errorsOf(response)?.[0]?.message ?? t('proveCodeSendError'))
      return
    }
    setSent(true)
  }

  async function proveWithCode() {
    setSubmitting(true)
    setError(undefined)
    const { data, error: response, response: http } = await getAuthApi().confirmReauthenticationCode(code.trim())
    setSubmitting(false)
    if (data) {
      router.back()
      return
    }
    setError(tooManyRequestsMessage(t, http) ?? errorsOf(response)?.[0]?.message ?? t('proveCodeError'))
  }

  if (!account) return <Screen testID="prove-loading">{null}</Screen>

  if (!passwordsSignIn()) {
    return (
      <Screen testID="prove-code">
        <Heading testID="prove-heading">{t('proveHeading')}</Heading>
        {sent ? (
          <>
            <Text testID="prove-code-sent">{t('proveCodeSent', { email: account.email })}</Text>
            <TextField
              testID="prove-code-input"
              placeholder={t('proveCodePlaceholder')}
              autoCapitalize="characters"
              autoComplete="one-time-code"
              value={code}
              onChangeText={setCode}
            />
            <Button
              testID="prove-code-submit"
              labelTestID="prove-code-submit-label"
              disabled={submitting}
              onPress={proveWithCode}
              label={t('proveSubmit')}
            />
          </>
        ) : (
          <Button
            testID="prove-code-send"
            labelTestID="prove-code-send-label"
            disabled={submitting}
            onPress={() => sendCode(account.email)}
            label={t('proveCodeSend', { email: account.email })}
          />
        )}
        {error && <ErrorText testID="prove-error">{error}</ErrorText>}
      </Screen>
    )
  }

  if (!account.hasPassword) {
    return (
      <Screen testID="prove-set-password">
        <Heading testID="prove-heading">{t('proveHeading')}</Heading>
        {sent ? (
          <Text testID="prove-set-password-sent">{t('proveSetPasswordSent', { email: account.email })}</Text>
        ) : (
          <>
            <Text testID="prove-set-password-hint">{t('proveSetPasswordHint')}</Text>
            <Button
              testID="prove-set-password-submit"
              labelTestID="prove-set-password-submit-label"
              disabled={submitting}
              onPress={() => sendSetPasswordLink(account.email)}
              label={t('proveSetPasswordAction')}
            />
          </>
        )}
      </Screen>
    )
  }

  return (
    <Screen testID="prove-form">
      <Heading testID="prove-heading">{t('proveHeading')}</Heading>
      <TextField
        testID="prove-password-input"
        placeholder={t('provePasswordPlaceholder')}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <ErrorText testID="prove-error">{error}</ErrorText>}
      <Button
        testID="prove-submit"
        labelTestID="prove-submit-label"
        disabled={submitting}
        onPress={prove}
        label={submitting ? t('proveSubmitting') : t('proveSubmit')}
      />
    </Screen>
  )
}
