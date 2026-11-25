import { Button, Heading, Screen, Text } from '@/components'

import { useTranslation } from '@/lib/i18n'

import { router, useLocalSearchParams } from 'expo-router'

/** Where asking to delete the account lands: signed out, and told how to keep it. */
export default function DeletionScheduled() {
  const { t, i18n } = useTranslation()
  const { on } = useLocalSearchParams<{ on?: string }>()
  // String(undefined) reads as no date at all, like any other text that is not one.
  const date = new Date(String(on))
  const known = !Number.isNaN(date.getTime())

  return (
    <Screen testID="deletion-scheduled">
      <Heading testID="deletion-scheduled-heading">{t('deletionScheduledHeading')}</Heading>
      <Text testID="deletion-scheduled-body">
        {known
          ? t('deletionScheduledBody', { date: date.toLocaleDateString(i18n.language, { dateStyle: 'long' }) })
          : t('deletionScheduledBodyUndated')}
      </Text>
      <Button
        testID="deletion-scheduled-sign-in"
        labelTestID="deletion-scheduled-sign-in-label"
        onPress={() => router.replace('/login')}
        label={t('deletionScheduledSignIn')}
      />
    </Screen>
  )
}
