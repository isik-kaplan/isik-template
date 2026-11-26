'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'

/** Pause or resume a task, or run it now - each only where its declaration lets staff. */
export function ScheduledTaskActions({ task }: { task: ApiType<'ScheduledTask'> }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  // One per act, so a retry after a lost answer is recognised as the same one rather than done twice.
  const pausing = useIdempotencyKey()
  const running = useIdempotencyKey()
  const api = () => createApi(apiOrigin())
  const paused = task.effective.paused
  const done = (key: { used: () => void }) => ({
    success: t('auth:scheduledTasksChanged'),
    failure: t('auth:scheduledTasksChangeError'),
    onSuccess: () => {
      key.used()
      router.refresh()
    },
  })

  return (
    <div className="flex gap-2">
      {task.may.includes('pause') && (
        <Button
          variant="outline"
          size="sm"
          disabled={isSubmitting}
          onClick={() =>
            submit(
              () =>
                paused
                  ? api().resumeScheduledTask(task.name, pausing.keyFor(false))
                  : api().pauseScheduledTask(task.name, pausing.keyFor(true)),
              done(pausing)
            )
          }
        >
          {paused ? t('auth:scheduledTasksResume') : t('auth:scheduledTasksPause')}
        </Button>
      )}
      {task.may.includes('run_now') && (
        <Button
          variant="outline"
          size="sm"
          disabled={isSubmitting}
          onClick={() => submit(() => api().runScheduledTask(task.name, running.keyFor(null)), done(running))}
        >
          {t('auth:scheduledTasksRunNow')}
        </Button>
      )}
    </div>
  )
}
