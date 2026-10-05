import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { useIsMounted } from '@isikk/core/hooks'
import { router } from 'expo-router'
import { Text } from 'react-native'

type Account = { email: string; hasPassword: boolean }

/** Where the backend's re-authentication gate sends this app: a password typed again, then back to
 * whatever asked. An account with no password - one made through a provider - is offered setting one
 * by email instead, since a provider round trip needs a browser this screen does not open. */
export default function Prove() {
  const { t } = useTranslation()
  const [account, setAccount] = useState<Account | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
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
    const { data, error: response } = await getAuthApi().reauthenticate(password)
    setSubmitting(false)
    if (data) {
      router.back()
      return
    }
    setError(extractAuthErrors(response)?.[0]?.message ?? t('proveError'))
  }

  async function sendSetPasswordLink(email: string) {
    setSubmitting(true)
    // allauth never says whether the address is registered, so there is no refusal to show.
    await getAuthApi().requestPasswordReset(email)
    setSent(true)
  }

  if (!account) return <Screen testID="prove-loading">{null}</Screen>

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
