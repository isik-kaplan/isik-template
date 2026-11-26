import ScheduledTasksPage from '@/app/admin/scheduled-tasks/page'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/getSession', () => ({ getLanguage: async () => 'en' }))
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/components/app/PageShell', async () => ({ PageShell: (await import('../shell')).TestPageShell }))
vi.mock('@/components/app-admin/ScheduledTaskActions', () => ({
  ScheduledTaskActions: ({ task }: { task: { name: string } }) => <p>actions for {task.name}</p>,
}))
const me = vi.fn()
const scheduledTasks = vi.fn()
vi.mock('@/lib/serverApi', () => ({ serverApi: async () => ({ me, scheduledTasks }) }))

const STAFF = { data: { is_staff: true, is_superuser: false, permissions: [] } }
const task = (name: string, effective: object, lastRunAt: string | null = null) => ({
  name,
  effective: { every: null, crontab: null, paused: false, ...effective },
  last_run_at: lastRunAt,
})

describe('ScheduledTasksPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    me.mockResolvedValue(STAFF)
  })

  it('lists each task with its schedule, whether it is paused, and when it last ran', async () => {
    scheduledTasks.mockResolvedValue({
      data: {
        results: [
          task('clear_expired_tokens', { crontab: '30 4 * * *' }, '2026-11-25T04:30:00Z'),
          task('isik.features.sweep', { every: 3600, paused: true }),
        ],
      },
    })

    render(await ScheduledTasksPage())

    expect(screen.getByRole('heading').textContent).toBe('Scheduled tasks')
    expect(screen.getByTestId('description').textContent).toBe(
      "What the scheduler runs, and when. A paused task waits until it's resumed; running one now doesn't move its schedule."
    )
    expect(screen.getByText('At 30 4 * * * (cron, UTC) · Last run Nov 25, 2026, 4:30 AM UTC')).toBeTruthy()
    expect(screen.getByText('Every hour · Paused · Not run yet')).toBeTruthy()
    expect(screen.getByText('actions for isik.features.sweep')).toBeTruthy()
  })

  it.each([
    ['tasks that could not be read', { data: undefined }],
    ['no tasks', { data: { results: [] } }],
  ])('says nothing is scheduled for %s', async (_case, read) => {
    scheduledTasks.mockResolvedValue(read)

    render(await ScheduledTasksPage())

    expect(screen.getByText('Nothing is scheduled.')).toBeTruthy()
  })

  it.each([
    ['nobody asking', { data: undefined }],
    ['somebody not staff', { data: { is_staff: false, is_superuser: false, permissions: [] } }],
  ])('is not found for %s', async (_case, asking) => {
    me.mockResolvedValue(asking)

    await expect(ScheduledTasksPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(scheduledTasks).not.toHaveBeenCalled()
  })
})
