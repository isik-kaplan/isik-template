import { notFound } from 'next/navigation'

import { ScheduledTaskActions } from '@/components/app-admin/ScheduledTaskActions'
import { PageShell } from '@/components/app/PageShell'

import { sUseTranslation } from '@/i18n'
import { mayRunScheduledTasks } from '@/lib/access'
import { scheduleLabel } from '@/lib/scheduledTasks'
import { serverApi } from '@/lib/serverApi'

/** What the scheduler runs and when, for staff to pause, resume or run now as each task allows. */
export default async function ScheduledTasksPage() {
  const api = await serverApi()
  const { data: me } = await api.me()
  if (!me || !mayRunScheduledTasks(me)) notFound()
  const { t, i18n } = await sUseTranslation(['auth'])
  const { data } = await api.scheduledTasks()
  const tasks = data?.results ?? []
  const when = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })

  return (
    <PageShell title={t('auth:scheduledTasksTitle')} description={t('auth:scheduledTasksHint')}>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('auth:scheduledTasksEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border">
          {tasks.map((task) => (
            <li key={task.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-sm">{task.name}</span>
                <span className="text-sm text-muted-foreground">
                  {scheduleLabel(task.effective, t)}
                  {task.effective.paused && ` · ${t('auth:scheduledTasksPausedBadge')}`}
                  {' · '}
                  {task.last_run_at
                    ? t('auth:scheduledTasksLastRun', { when: when.format(new Date(task.last_run_at)) })
                    : t('auth:scheduledTasksNeverRun')}
                </span>
              </div>
              <ScheduledTaskActions task={task} />
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
