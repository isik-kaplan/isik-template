import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, ListRow, Screen, Text, TextButton, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { tooManyRequestsMessage } from '@/lib/tooManyRequests'
import { spacing } from '@/theme'

import { errorsOf } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { useIsMounted } from '@isikk/core/hooks'
import { StyleSheet, View } from 'react-native'

type EmailAddress = { email: string; primary: boolean; verified: boolean }

export default function ProfileEmails() {
  const { t } = useTranslation()
  const [emails, setEmails] = useState<EmailAddress[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const isMounted = useIsMounted()

  useEffect(() => {
    getAuthApi()
      .emails()
      .then(({ data }) => {
        if (isMounted()) setEmails(data?.data ?? [])
      })
  }, [isMounted])

  async function addEmail() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response, response: http } = await getAuthApi().addEmail(newEmail)
      const throttled = tooManyRequestsMessage(t, http)
      if (throttled) {
        setError(throttled)
        return
      }
      if (data) {
        setEmails(data.data)
        setNewEmail('')
        return
      }
      const authErrors = errorsOf(response)
      setError(authErrors?.[0]?.message ?? t('profileEmailsAddError'))
    } finally {
      setSubmitting(false)
    }
  }

  async function makePrimary(email: string) {
    const { data } = await getAuthApi().makeEmailPrimary(email)
    if (data) setEmails(data.data)
  }

  async function resendVerification(email: string) {
    await getAuthApi().resendEmailVerification(email)
  }

  async function remove(email: string) {
    const { data } = await getAuthApi().removeEmail(email)
    if (data) setEmails(data.data)
  }

  return (
    <Screen testID="profile-emails" back>
      <Heading testID="profile-emails-heading">{t('profileEmailsHeading')}</Heading>
      {emails.map((emailAddress) => (
        <ListRow key={emailAddress.email} testID={`email-row-${emailAddress.email}`}>
          <Text testID={`email-label-${emailAddress.email}`}>
            {emailAddress.email}
            {emailAddress.primary ? t('profileEmailsPrimarySuffix') : ''}
            {emailAddress.verified ? '' : t('profileEmailsUnverifiedSuffix')}
          </Text>
          <View testID={`email-actions-${emailAddress.email}`} style={styles.actions}>
            {!emailAddress.primary && emailAddress.verified && (
              <TextButton
                testID={`make-primary-${emailAddress.email}`}
                label={t('profileEmailsMakePrimary')}
                onPress={() => makePrimary(emailAddress.email)}
              />
            )}
            {!emailAddress.verified && (
              <TextButton
                testID={`resend-verification-${emailAddress.email}`}
                label={t('profileEmailsResend')}
                onPress={() => resendVerification(emailAddress.email)}
              />
            )}
            {!emailAddress.primary && (
              <TextButton
                testID={`remove-email-${emailAddress.email}`}
                label={t('profileEmailsRemove')}
                onPress={() => remove(emailAddress.email)}
              />
            )}
          </View>
        </ListRow>
      ))}
      <TextField
        testID="new-email-input"
        placeholder={t('profileEmailsAddPlaceholder')}
        autoCapitalize="none"
        keyboardType="email-address"
        value={newEmail}
        onChangeText={setNewEmail}
      />
      {error && <ErrorText testID="profile-emails-error">{error}</ErrorText>}
      <Button
        testID="add-email-submit"
        labelTestID="add-email-submit-label"
        disabled={submitting}
        onPress={addEmail}
        label={submitting ? t('profileEmailsAdding') : t('profileEmailsAdd')}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: spacing.sm },
})
