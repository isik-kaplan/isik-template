import { NotificationsList } from '@/components/app-auth/NotificationsList'

import { serverApi } from '@/lib/serverApi'

export default async function ProfileNotificationsPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const api = await serverApi()
  const [items, kinds, choices] = await Promise.all([
    api.notifications(),
    api.choosableNotificationKinds(),
    api.notificationChoices(),
  ])

  return (
    <NotificationsList
      initialItems={items.data?.results ?? []}
      kinds={kinds.data ?? []}
      initialChoices={choices.data?.results ?? []}
    />
  )
}
