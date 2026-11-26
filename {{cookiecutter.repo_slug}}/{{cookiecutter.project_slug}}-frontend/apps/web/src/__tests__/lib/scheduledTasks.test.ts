import type { Translate } from '@/i18n/config'
import { scheduleLabel } from '@/lib/scheduledTasks'

import { describe, expect, it } from 'vitest'

// The key and what it was given, so a test sees the count as well as the unit.
const withOptions = ((key: string, options: object) => `${key} ${JSON.stringify(options)}`) as unknown as Translate

describe('scheduleLabel', () => {
  it.each([
    [{ every: null, crontab: '30 4 * * *' }, 'auth:scheduledTasksAtCrontab {"crontab":"30 4 * * *"}'],
    [{ every: 172800, crontab: null }, 'auth:scheduledTasksEveryDays {"count":2}'],
    [{ every: 3600, crontab: null }, 'auth:scheduledTasksEveryHours {"count":1}'],
    [{ every: 5400, crontab: null }, 'auth:scheduledTasksEveryMinutes {"count":90}'],
    [{ every: 10, crontab: null }, 'auth:scheduledTasksEverySeconds {"count":10}'],
  ])('words %j in its largest whole unit', (schedule, expected) => {
    expect(scheduleLabel(schedule, withOptions)).toBe(expected)
  })
})
