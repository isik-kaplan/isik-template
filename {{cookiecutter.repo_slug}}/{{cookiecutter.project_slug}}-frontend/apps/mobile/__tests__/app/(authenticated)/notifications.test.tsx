import Notifications from '@/app/(authenticated)/notifications'

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockList = jest.fn()
const mockRead = jest.fn()
const mockReadAll = jest.fn()
jest.mock('@/lib/api', () => ({
  getApi: () => ({
    notifications: () => mockList(),
    markNotificationRead: (id: string) => mockRead(id),
    markAllNotificationsRead: () => mockReadAll(),
  }),
}))

const item = (id: string, read_at: string | null, message: string | null = `Message ${id}`) => ({
  id,
  kind: 'token_created',
  message,
  read_at,
})

describe('Notifications', () => {
  beforeEach(() => jest.clearAllMocks())

  it('lists each notification, newest first as the API gives them, marking the unread', async () => {
    mockList.mockResolvedValue({ data: { results: [item('n2', null), item('n1', '2026-10-30T00:00:00Z')] } })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notification-message-n2').props.children).toBe('Message n2'))
    expect(screen.getByTestId('notification-message-n1').props.children).toBe('Message n1')
    expect(screen.getByTestId('notification-unread-n2').props.children).toBe('New')
    expect(screen.queryByTestId('notification-unread-n1')).toBeNull()
    expect(screen.getByTestId('notification-n2')).toBeTruthy()
    expect(screen.queryByTestId('notifications-empty')).toBeNull()
    expect(screen.getByTestId('notifications-heading').props.children).toBe('Notifications')
  })

  it("names a notification's kind where it has no message", async () => {
    mockList.mockResolvedValue({ data: { results: [item('n1', null, null)] } })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notification-message-n1').props.children).toBe('token_created'))
  })

  it('says so when there is nothing yet, and offers nothing to mark', async () => {
    mockList.mockResolvedValue({ data: { results: [] } })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notifications-empty').props.children).toBe('Nothing yet.'))
    expect(screen.queryByTestId('notifications-read-all')).toBeNull()
  })

  it('shows nothing, not "nothing yet", while it loads or when the list fails', async () => {
    mockList.mockResolvedValue({ data: undefined })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notifications-empty')).toBeTruthy())
    mockList.mockReturnValue(new Promise(() => undefined))
    await render(<Notifications />)
    expect(screen.queryByTestId('notifications-empty')).toBeNull()
    expect(screen.queryAllByTestId(/^notification-/)).toEqual([])
  })

  it('marks one read when it is pressed, and only that one', async () => {
    mockList.mockResolvedValue({ data: { results: [item('n2', null), item('n1', null)] } })
    mockRead.mockResolvedValue({ data: item('n2', '2026-10-30T00:00:00Z') })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notification-read-n2')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('notification-read-n2'))
    await waitFor(() => expect(screen.queryByTestId('notification-unread-n2')).toBeNull())
    expect(mockRead).toHaveBeenCalledWith('n2')
    expect(screen.getByTestId('notification-unread-n1')).toBeTruthy()
  })

  it('keeps it unread when marking it failed', async () => {
    mockList.mockResolvedValue({ data: { results: [item('n1', null)] } })
    mockRead.mockResolvedValue({ data: undefined })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notification-read-n1')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('notification-read-n1'))
    await waitFor(() => expect(mockRead).toHaveBeenCalled())
    expect(screen.getByTestId('notification-unread-n1')).toBeTruthy()
  })

  it('does not mark again one already read', async () => {
    mockList.mockResolvedValue({ data: { results: [item('n1', '2026-10-30T00:00:00Z')] } })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notification-read-n1')).toBeTruthy())
    expect(screen.getByTestId('notification-read-n1').props.accessibilityState).toEqual({ disabled: true })
  })

  it('marks them all read, then shows them as the API has them', async () => {
    mockList
      .mockResolvedValueOnce({ data: { results: [item('n2', null), item('n1', null)] } })
      .mockResolvedValueOnce({ data: { results: [item('n2', 'x'), item('n1', 'x')] } })
    mockReadAll.mockResolvedValue({ data: { marked: 2 } })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notifications-read-all')).toBeTruthy())
    expect(screen.getByTestId('notifications-read-all-label').props.children).toBe('Mark all as read')
    await fireEvent.press(screen.getByTestId('notifications-read-all'))
    await waitFor(() => expect(screen.queryByTestId('notifications-read-all')).toBeNull())
    expect(mockReadAll).toHaveBeenCalled()
    expect(screen.queryByTestId('notification-unread-n1')).toBeNull()
  })

  it('keeps what it showed when the list fails after marking them all', async () => {
    mockList.mockResolvedValueOnce({ data: { results: [item('n1', null)] } }).mockResolvedValueOnce({ data: undefined })
    mockReadAll.mockResolvedValue({ data: { marked: 1 } })
    await render(<Notifications />)
    await waitFor(() => expect(screen.getByTestId('notifications-read-all')).toBeTruthy())
    await fireEvent.press(screen.getByTestId('notifications-read-all'))
    await waitFor(() => expect(mockList).toHaveBeenCalledTimes(2))
    expect(screen.getByTestId('notification-unread-n1')).toBeTruthy()
  })

  it('does not update state after unmount', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
    let resolve: (value: unknown) => void = () => undefined
    mockList.mockReturnValue(new Promise((r) => (resolve = r)))
    const { unmount } = await render(<Notifications />)
    await unmount()
    resolve({ data: { results: [item('n1', null)] } })
    await new Promise((r) => setTimeout(r, 0))
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })
})
