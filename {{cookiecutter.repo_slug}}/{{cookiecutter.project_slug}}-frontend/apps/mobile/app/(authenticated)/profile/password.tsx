import { useState } from 'react'

import { Button, ErrorText, Heading, Screen, TextField } from '@/components'

import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import { extractAuthErrors } from '@{{ cookiecutter.repo_slug }}/auth-api/app'

import { Text } from 'react-native'

export default function ProfilePassword() {
  const { t } = useTranslation()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    setError(undefined)
    setSuccess(false)
    try {
      const { data, error: response } = await getAuthApi().changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      })
      if (data) {
        setCurrentPassword('')
        setNewPassword('')
        setSuccess(true)
        return
      }
      const authErrors = extractAuthErrors(response)
      setError(authErrors?.[0]?.message ?? t('profilePasswordError'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Screen testID="profile-password-form">
      <Heading testID="profile-password-heading">{t('profilePasswordHeading')}</Heading>
      <TextField
        testID="current-password-input"
        placeholder={t('profilePasswordCurrentPlaceholder')}
        secureTextEntry
        value={currentPassword}
        onChangeText={setCurrentPassword}
      />
      <TextField
        testID="new-password-input"
        placeholder={t('profilePasswordNewPlaceholder')}
        secureTextEntry
        value={newPassword}
        onChangeText={setNewPassword}
      />
      {error && <ErrorText testID="profile-password-error">{error}</ErrorText>}
      {success && <Text testID="profile-password-success">{t('profilePasswordSuccess')}</Text>}
      <Button
        testID="profile-password-submit"
        labelTestID="profile-password-submit-label"
        disabled={submitting}
        onPress={submit}
        label={submitting ? t('profilePasswordSubmitting') : t('profilePasswordSubmit')}
      />
    </Screen>
  )
}
