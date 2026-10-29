import ProfileNotificationsPage from '@/app/profile/(tabs)/notifications/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifications = vi.fn()
const notificationKinds = vi.fn()
vi.mock('@/lib/serverApi', () => ({
  serverApi: async () => ({ notifications, notificationKinds }),
}))
vi.mock('@/components/app-auth/NotificationsList', () => ({
  NotificationsList: ({
    initialItems,
    initialKinds,
  }: {
    initialItems: { id: string }[]
    initialKinds: { kind: string }[]
  }) => (
    <>
      <p>items: {initialItems.map((item) => item.id).join(',')}</p>
      <p>kinds: {initialKinds.map((kind) => kind.kind).join(',')}</p>
      <p>{initialItems.length + initialKinds.length} in all</p>
    </>
  ),
}))

describe('ProfileNotificationsPage', () => {
  beforeEach(() => {
    notifications.mockResolvedValue({ data: { results: [{ id: 'a' }, { id: 'b' }] } })
    notificationKinds.mockResolvedValue({ data: [{ kind: 'account_changed' }] })
  })

  it('shows their notifications with every kind and what they get of each', async () => {
    render(await ProfileNotificationsPage())

    expect(screen.getByText('items: a,b')).toBeTruthy()
    expect(screen.getByText('kinds: account_changed')).toBeTruthy()
  })

  it('still renders when nothing could be read', async () => {
    notifications.mockResolvedValue({ data: undefined })
    notificationKinds.mockResolvedValue({ data: undefined })

    render(await ProfileNotificationsPage())

    expect(screen.getByText('items:')).toBeTruthy()
    expect(screen.getByText('kinds:')).toBeTruthy()
    expect(screen.getByText('0 in all')).toBeTruthy()
  })
})
