'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'

/** Switching an application off and on again, and deleting one that is off - what can be done depends on
 *  where it stands, and a superuser's decision is not its owner's to undo. */
export function ApplicationLifecycle({ application }: { application: ApiType<'Application'> }) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  // One per act, so a retry after a lost answer is recognised as the same one rather than done twice.
  const disabling = useIdempotencyKey()
  const restoring = useIdempotencyKey()
  const api = () => createApi(apiOrigin())

  async function act(
    call: () => Promise<{ response: Response }>,
    success: string,
    failure: string,
    { then = '', used }: { then?: string; used?: () => void }
  ) {
    await submit(call, {
      success,
      failure,
      leavesOnSuccess: Boolean(then),
      onSuccess: () => {
        used?.()
        return then ? router.push(then) : router.refresh()
      },
    })
  }

  if (application.approval === 'approved') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t('auth:applicationDisableHint')}</p>
        <Button
          variant="outline"
          className="self-start"
          disabled={isSubmitting}
          onClick={() =>
            act(
              () => api().disableOAuthApplication(application.id, disabling.keyFor(null)),
              t('auth:applicationDisabled'),
              t('auth:applicationDisableError'),
              { used: disabling.used }
            )
          }
        >
          {t('auth:applicationDisable')}
        </Button>
      </div>
    )
  }

  if (application.approval === 'disabled') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{t('auth:applicationDisabledHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={isSubmitting}
            onClick={() =>
              act(
                () => api().restoreOAuthApplication(application.id, restoring.keyFor(null)),
                t('auth:applicationRestored'),
                t('auth:applicationRestoreError'),
                { used: restoring.used }
              )
            }
          >
            {t('auth:applicationRestore')}
          </Button>
          <Button
            variant="destructive"
            disabled={isSubmitting}
            onClick={() =>
              act(
                () => api().deleteOAuthApplication(application.id),
                t('auth:applicationDeleted'),
                t('auth:applicationDeleteError'),
                { then: '/applications' }
              )
            }
          >
            {t('auth:applicationDelete')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <p className="text-sm text-muted-foreground">
      {application.approval === 'pending' ? t('auth:applicationPendingHint') : t('auth:applicationWithdrawnHint')}
    </p>
  )
}
