'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { broadcastSessionCleared } from '@/lib/sessionChannel'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

import { useIdempotencyKey } from '@isikk/core/hooks'
import { toast } from 'sonner'

export const DELETION_SCHEDULED_PATH = '/auth/deletion-scheduled'

/** Asking for the account to be deleted. The backend first sends them off to prove it is them. */
export function DeleteAccount({ deletion }: { deletion: ApiType<'AccountDeletion'> }) {
  const { t } = useClientTranslation(['auth'])
  const [confirming, setConfirming] = useState(false)
  const [asking, setAsking] = useState(false)
  const deleting = useIdempotencyKey()

  async function ask() {
    setAsking(true)
    const { data } = await createApi(apiOrigin()).requestAccountDeletion(deleting.keyFor('me'))
    if (data) {
      deleting.used()
      // Every session of theirs is over, this tab's too: the other tabs sign out, and this one leaves in full.
      broadcastSessionCleared()
      const scheduled = new URL(DELETION_SCHEDULED_PATH, window.location.origin)
      scheduled.searchParams.set('on', data.deletes_at)
      window.location.href = scheduled.href
      return
    }
    setAsking(false)
    toast.error(t('auth:profileDeleteError'))
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-6">
      <h2 className="text-sm font-semibold">{t('auth:profileDeleteTitle')}</h2>
      <p className="text-sm text-muted-foreground">
        {deletion.deletion_mode === 'anonymize' ? t('auth:profileDeleteAnonymizes') : t('auth:profileDeleteErases')}
      </p>
      <p className="text-sm text-muted-foreground">{t('auth:profileDeleteWhen', { count: deletion.after_days })}</p>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="destructive" disabled={asking} onClick={ask}>
            {t('auth:profileDeleteConfirm')}
          </Button>
          <Button variant="outline" disabled={asking} onClick={() => setConfirming(false)}>
            {t('auth:profileDeleteKeep')}
          </Button>
        </div>
      ) : (
        <div>
          <Button variant="destructive" onClick={() => setConfirming(true)}>
            {t('auth:profileDeleteStart')}
          </Button>
        </div>
      )}
    </section>
  )
}
