import type { Translate } from '@/i18n/config'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

type Schedule = Pick<ApiType<'State'>, 'every' | 'crontab'>

/** How often a task runs, in the largest whole unit. Spelled out per unit: i18next-parser only finds a literal key. */
export function scheduleLabel({ every, crontab }: Schedule, t: Translate): string {
  // A task runs every so often or at a crontab: without the one, it has the other.
  if (every === null) return t('auth:scheduledTasksAtCrontab', { crontab })
  if (every % 86400 === 0) return t('auth:scheduledTasksEveryDays', { count: every / 86400 })
  if (every % 3600 === 0) return t('auth:scheduledTasksEveryHours', { count: every / 3600 })
  if (every % 60 === 0) return t('auth:scheduledTasksEveryMinutes', { count: every / 60 })
  return t('auth:scheduledTasksEverySeconds', { count: every })
}
