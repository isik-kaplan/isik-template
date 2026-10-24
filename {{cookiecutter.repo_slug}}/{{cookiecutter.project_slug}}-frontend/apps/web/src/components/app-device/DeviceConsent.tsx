'use client'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { createApi } from '@/lib/apiClients'
import { apiOrigin } from '@/lib/apiOrigin'
import { useAPISubmit } from '@/lib/submit'

import { useIdempotencyKey } from '@isikk/core/hooks'

/** Allowing or denying a device; either way the code is spent. */
export function DeviceConsent({ userCode }: { userCode: string }) {
  const { t } = useClientTranslation(['auth'])
  const { isSubmitting, submit } = useAPISubmit()
  // One per answer, so a retry after a lost answer is recognised as the same one.
  const approval = useIdempotencyKey()
  const denial = useIdempotencyKey()
  const [answered, setAnswered] = useState<'allowed' | 'denied' | null>(null)
  const api = () => createApi(apiOrigin())

  if (answered) {
    return (
      <p role="status" className="text-sm">
        {answered === 'allowed' ? t('auth:deviceAllowed') : t('auth:deviceDenied')}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={isSubmitting}
        onClick={() =>
          submit(() => api().approveDevice(userCode, approval.keyFor(userCode)), {
            failure: t('auth:deviceAnswerError'),
            onSuccess: () => {
              approval.used()
              setAnswered('allowed')
            },
          })
        }
      >
        {t('auth:deviceConsentAllow')}
      </Button>
      <Button
        variant="outline"
        disabled={isSubmitting}
        onClick={() =>
          submit(() => api().denyDevice(userCode, denial.keyFor(userCode)), {
            failure: t('auth:deviceAnswerError'),
            onSuccess: () => {
              denial.used()
              setAnswered('denied')
            },
          })
        }
      >
        {t('auth:deviceConsentDeny')}
      </Button>
    </div>
  )
}
