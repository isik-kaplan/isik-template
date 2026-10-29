import { NotificationsList } from '@/components/app-auth/NotificationsList'

import { serverApi } from '@/lib/serverApi'

export default async function ProfileNotificationsPage() {
  // Gating already happened one level up, in profile/layout.tsx.
  const api = await serverApi()
  const [items, kinds] = await Promise.all([api.notifications(), api.notificationKinds()])

  return <NotificationsList initialItems={items.data?.results ?? []} initialKinds={kinds.data ?? []} />
}
