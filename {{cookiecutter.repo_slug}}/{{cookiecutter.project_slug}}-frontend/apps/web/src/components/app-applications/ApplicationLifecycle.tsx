'use client'

import { useRouter } from 'next/navigation'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'

/** Switching off and on, and deleting once off; a superuser's decision is not the owner's to undo. */
export function ApplicationLifecycle({
  application,
  etag,
}: {
  application: ApiType<'Application'>
  // The read's ETag header, which deleting it names.
  etag: string | null
}) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  // One per act, so a retry after a lost answer is recognised as the same one rather than done twice.
  const disabling = useIdempotencyKey()
  const restoring = useIdempotencyKey()
  const deleting = useIdempotencyKey()
  const api = () => createApi(apiOrigin())

  // What every act says and does after, whether or not it names a version.
  function settled(success: string, failure: string, { then = '', used }: { then?: string; used: () => void }) {
    return {
      success,
      failure,
      // Changed since this page loaded: shown as it is now, for its owner to decide again.
      onStale: () => router.refresh(),
      leavesOnSuccess: Boolean(then),
      onSuccess: () => {
        used()
        return then ? router.push(then) : router.refresh()
      },
    }
  }

  // Switching it off and on again go under an idempotency key, not a version.
  async function act(
    call: () => Promise<{ response: Response }>,
    success: string,
    failure: string,
    after: { then?: string; used: () => void }
  ) {
    await submit(call, settled(success, failure, after))
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
              // Against the version shown, so a change made since is not deleted unseen.
              submit(
                (headers) => api().deleteOAuthApplication(application.id, { ...headers, ...deleting.headerFor(null) }),
                {
                  ...settled(t('auth:applicationDeleted'), t('auth:applicationDeleteError'), {
                    then: '/applications',
                    used: deleting.used,
                  }),
                  etag,
                }
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
