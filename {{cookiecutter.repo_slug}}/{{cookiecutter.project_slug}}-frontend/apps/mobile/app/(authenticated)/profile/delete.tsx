import { useEffect, useState } from 'react'

import { Button, ErrorText, Heading, Screen } from '@/components'

import { getApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'
import { getAuthApi } from '@/lib/session'

import type { components } from '@{{ cookiecutter.repo_slug }}/api'

import { freshIdempotencyKey } from '@isikk/core'
import { useIsMounted } from '@isikk/core/hooks'
import { router } from 'expo-router'
import { Text } from 'react-native'

type Deletion = components['schemas']['AccountDeletion']

/** Asking for the account to be deleted; the backend first sends them off to prove it is them. */
export default function DeleteAccount() {
  const { t } = useTranslation()
  const [deletion, setDeletion] = useState<Deletion | undefined>()
  const [confirming, setConfirming] = useState(false)
  const [asking, setAsking] = useState(false)
  const [failed, setFailed] = useState(false)
  const isMounted = useIsMounted()

  useEffect(() => {
    getApi()
      .accountDeletion()
      .then(({ data }) => {
        if (isMounted()) setDeletion(data)
      })
  }, [isMounted])

  async function ask() {
    setAsking(true)
    setFailed(false)
    const { data } = await getApi().requestAccountDeletion(freshIdempotencyKey()['Idempotency-Key'])
    if (!data) {
      setAsking(false)
      setFailed(true)
      return
    }
    // The session is already over on the server; this forgets its token here too.
    await getAuthApi().logout()
    router.replace({ pathname: '/deletion-scheduled', params: { on: data.deletes_at } })
  }

  if (!deletion) return <Screen testID="delete-account-loading">{null}</Screen>

  return (
    <Screen testID="delete-account">
      <Heading testID="delete-account-heading">{t('deleteAccountHeading')}</Heading>
      <Text testID="delete-account-what">
        {deletion.deletion_mode === 'anonymize' ? t('deleteAccountAnonymizes') : t('deleteAccountErases')}
      </Text>
      <Text testID="delete-account-when">{t('deleteAccountWhen', { count: deletion.after_days })}</Text>
      {confirming ? (
        <>
          <Button
            testID="delete-account-confirm"
            labelTestID="delete-account-confirm-label"
            disabled={asking}
            onPress={ask}
            label={t('deleteAccountConfirm')}
          />
          <Button
            testID="delete-account-keep"
            labelTestID="delete-account-keep-label"
            disabled={asking}
            onPress={() => setConfirming(false)}
            label={t('deleteAccountKeep')}
          />
        </>
      ) : (
        <Button
          testID="delete-account-start"
          labelTestID="delete-account-start-label"
          onPress={() => setConfirming(true)}
          label={t('deleteAccountStart')}
        />
      )}
      {failed && <ErrorText testID="delete-account-error">{t('deleteAccountError')}</ErrorText>}
    </Screen>
  )
}
