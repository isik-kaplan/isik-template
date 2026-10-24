'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { type Scope, ScopeChecklist } from './ScopeChecklist'
import { useIdempotencyKey } from '@isikk/core/hooks'

/** A superuser approving some or all of what an application asks for, or taking it down. One its owner
 *  switched off can only be taken down. */
export function ApprovalPanel({
  application,
  etag,
  scopes,
}: {
  application: ApiType<'ReviewedApplication'>
  // The read's ETag header, which approving names.
  etag: string | null
  scopes: Scope[]
}) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const { isSubmitting, submit } = useAPISubmit()
  // One per act, so a retry after a lost answer is recognised as the same one rather than done twice.
  const approval = useIdempotencyKey()
  const withdrawal = useIdempotencyKey()
  // Offered as asked for while waiting, and as last approved once answered.
  const [approved, setApproved] = useState(
    application.approval === 'pending' ? application.requested_scopes : application.approved_scopes
  )
  const requested = scopes.filter((scope) => application.requested_scopes.includes(scope.name))
  const api = () => createApi(apiOrigin())

  return (
    <div className="flex flex-col gap-4">
      {application.approval !== 'disabled' && (
        <div className="flex flex-col gap-3">
          <ScopeChecklist
            legend={t('auth:applicationReviewApproveScopes')}
            scopes={requested}
            value={approved}
            onChange={setApproved}
          />
          <Button
            className="self-start"
            disabled={isSubmitting}
            onClick={() =>
              submit(
                (headers) =>
                  api().approveOAuthApplication(application.id, approved, approval.keyFor(approved), headers),
                {
                  success: t('auth:applicationReviewApproved'),
                  failure: t('auth:applicationReviewApproveError'),
                  // Against what it asked for when this page loaded, which may have changed since.
                  etag,
                  onStale: () => router.refresh(),
                  onSuccess: () => {
                    approval.used()
                    router.refresh()
                  },
                }
              )
            }
          >
            {t('auth:applicationReviewApprove')}
          </Button>
        </div>
      )}
      {application.approval !== 'withdrawn' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t('auth:applicationReviewWithdrawHint')}</p>
          <Button
            variant="destructive"
            className="self-start"
            disabled={isSubmitting}
            onClick={() =>
              submit(() => api().withdrawOAuthApplication(application.id, withdrawal.keyFor(null)), {
                success: t('auth:applicationReviewWithdrawn'),
                failure: t('auth:applicationReviewWithdrawError'),
                onSuccess: () => {
                  withdrawal.used()
                  router.refresh()
                },
              })
            }
          >
            {t('auth:applicationReviewWithdraw')}
          </Button>
        </div>
      )}
    </div>
  )
}
