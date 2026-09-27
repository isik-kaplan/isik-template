import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, ListRow, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'
import { spacing } from '@/theme'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { useIsMounted } from '@isikk/core/hooks'
import { Pressable, StyleSheet, Text, View } from 'react-native'

type EmailAddress = { email: string; primary: boolean; verified: boolean }

export default function ProfileEmails() {
  const { t } = useTranslation()
  const [emails, setEmails] = useState<EmailAddress[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const isMounted = useIsMounted()

  // Equivalent mutant either way, both the guard and the deps array - see
  // lib/useAuthenticated.ts's own copy of this same effect for why.
  // Stryker disable ArrayDeclaration,ConditionalExpression
  useEffect(() => {
    getAuthApi()
      .emails()
      .then(({ data }) => {
        if (isMounted()) setEmails(data?.data ?? [])
      })
  }, [isMounted])
  // Stryker restore ArrayDeclaration,ConditionalExpression

  async function addEmail() {
    setSubmitting(true)
    setError(undefined)
    try {
      const { data, error: response } = await getAuthApi().addEmail(newEmail)
      if (data) {
        setEmails(data.data)
        setNewEmail('')
        return
      }
      const authErrors = extractAuthErrors(response)
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
    <Screen testID="profile-emails">
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
              <Pressable testID={`make-primary-${emailAddress.email}`} onPress={() => makePrimary(emailAddress.email)}>
                <Text>{t('profileEmailsMakePrimary')}</Text>
              </Pressable>
            )}
            {!emailAddress.verified && (
              <Pressable
                testID={`resend-verification-${emailAddress.email}`}
                onPress={() => resendVerification(emailAddress.email)}
              >
                <Text>{t('profileEmailsResend')}</Text>
              </Pressable>
            )}
            {!emailAddress.primary && (
              <Pressable testID={`remove-email-${emailAddress.email}`} onPress={() => remove(emailAddress.email)}>
                <Text>{t('profileEmailsRemove')}</Text>
              </Pressable>
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
