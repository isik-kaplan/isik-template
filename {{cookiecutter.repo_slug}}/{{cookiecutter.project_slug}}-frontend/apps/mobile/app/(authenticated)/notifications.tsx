import { useEffect, useState } from 'react'

import { Button, Heading, ListRow, Screen } from '@/components'

import { getApi } from '@/lib/api'
import { useTranslation } from '@/lib/i18n'

import type { components } from '@{{ cookiecutter.repo_slug }}/api'

import { useIsMounted } from '@isikk/core/hooks'
import { Pressable, Text } from 'react-native'

type Item = components['schemas']['InboxItem']

export default function Notifications() {
  const { t } = useTranslation()
  const [items, setItems] = useState<Item[]>([])
  const [loaded, setLoaded] = useState(false)
  const isMounted = useIsMounted()

  useEffect(() => {
    getApi()
      .notifications()
      .then(({ data }) => {
        if (!isMounted()) return
        setItems(data?.results ?? [])
        setLoaded(true)
      })
  }, [isMounted])

  async function read(id: string) {
    const { data } = await getApi().markNotificationRead(id)
    if (data) setItems((current) => current.map((item) => (item.id === id ? data : item)))
  }

  async function readAll() {
    await getApi().markAllNotificationsRead()
    const { data } = await getApi().notifications()
    if (data) setItems(data.results)
  }

  const unread = items.some((item) => !item.read_at)

  return (
    <Screen testID="notifications">
      <Heading testID="notifications-heading">{t('notificationsHeading')}</Heading>
      {loaded && items.length === 0 && <Text testID="notifications-empty">{t('notificationsEmpty')}</Text>}
      {items.map((item) => (
        <ListRow key={item.id} testID={`notification-${item.id}`}>
          <Pressable testID={`notification-read-${item.id}`} disabled={!!item.read_at} onPress={() => read(item.id)}>
            <Text testID={`notification-message-${item.id}`}>{item.message ?? item.kind}</Text>
          </Pressable>
          {!item.read_at && <Text testID={`notification-unread-${item.id}`}>{t('notificationsUnread')}</Text>}
        </ListRow>
      ))}
      {unread && (
        <Button
          testID="notifications-read-all"
          labelTestID="notifications-read-all-label"
          onPress={readAll}
          label={t('notificationsMarkAllRead')}
        />
      )}
    </Screen>
  )
}
