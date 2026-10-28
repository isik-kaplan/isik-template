import ProfileNotificationsPage from '@/app/profile/(tabs)/notifications/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const notifications = vi.fn()
const choosableNotificationKinds = vi.fn()
const notificationChoices = vi.fn()
vi.mock('@/lib/serverApi', () => ({
  serverApi: async () => ({ notifications, choosableNotificationKinds, notificationChoices }),
}))
vi.mock('@/components/app-auth/NotificationsList', () => ({
  NotificationsList: ({
    initialItems,
    kinds,
    initialChoices,
  }: {
    initialItems: { id: string }[]
    kinds: { kind: string }[]
    initialChoices: { kind: string }[]
  }) => (
    <>
      <p>items: {initialItems.map((item) => item.id).join(',')}</p>
      <p>kinds: {kinds.map((kind) => kind.kind).join(',')}</p>
      <p>choices: {initialChoices.map((choice) => choice.kind).join(',')}</p>
      <p>{initialItems.length + kinds.length + initialChoices.length} in all</p>
    </>
  ),
}))

describe('ProfileNotificationsPage', () => {
  beforeEach(() => {
    notifications.mockResolvedValue({ data: { results: [{ id: 'a' }, { id: 'b' }] } })
    choosableNotificationKinds.mockResolvedValue({ data: [{ kind: 'account_changed' }] })
    notificationChoices.mockResolvedValue({ data: { results: [{ kind: 'application_reviewed' }] } })
  })

  it('shows their notifications with the kinds they may choose about and what they chose', async () => {
    render(await ProfileNotificationsPage())

    expect(screen.getByText('items: a,b')).toBeTruthy()
    expect(screen.getByText('kinds: account_changed')).toBeTruthy()
    expect(screen.getByText('choices: application_reviewed')).toBeTruthy()
  })

  it('still renders when nothing could be read', async () => {
    notifications.mockResolvedValue({ data: undefined })
    choosableNotificationKinds.mockResolvedValue({ data: undefined })
    notificationChoices.mockResolvedValue({ data: undefined })

    render(await ProfileNotificationsPage())

    expect(screen.getByText('items:')).toBeTruthy()
    expect(screen.getByText('kinds:')).toBeTruthy()
    expect(screen.getByText('choices:')).toBeTruthy()
    expect(screen.getByText('0 in all')).toBeTruthy()
  })
})
