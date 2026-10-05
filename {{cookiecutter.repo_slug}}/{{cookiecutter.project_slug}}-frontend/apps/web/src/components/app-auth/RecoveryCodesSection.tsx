'use client'

import { useRouter } from 'next/navigation'

import { useState } from 'react'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'
import { authOrigin } from '@/lib/authOrigin'
import { useFactorSubmit } from '@/lib/useFactorSubmit'

import { AuthApi } from '@{{ cookiecutter.repo_slug }}/auth-api'

import { RecoveryCodesReveal } from './RecoveryCodesReveal'

export type RecoveryCodesSectionProps = {
  unused: number
  total: number
}

/** How many are left, and a fresh set on demand - the old set stops working the moment it is made. */
export function RecoveryCodesSection({ unused, total }: RecoveryCodesSectionProps) {
  const { t } = useClientTranslation(['auth'])
  const router = useRouter()
  const [codes, setCodes] = useState<string[]>()
  const { isSubmitting, submit } = useFactorSubmit()

  async function regenerate() {
    const regenerated = await submit(() => new AuthApi(authOrigin()).regenerateRecoveryCodes(), {
      success: t('auth:recoveryCodesRegenerated'),
      failure: t('auth:recoveryCodesRegenerateError'),
    })
    if (!regenerated) return
    setCodes(regenerated.data.unused_codes)
    router.refresh()
  }

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-6" aria-labelledby="recovery-codes-heading">
      <h2 id="recovery-codes-heading" className="font-medium">
        {t('auth:recoveryCodesSectionTitle')}
      </h2>
      <p className="text-sm text-muted-foreground">{t('auth:recoveryCodesRemaining', { unused, total })}</p>
      {codes && <RecoveryCodesReveal codes={codes} />}
      <Button variant="outline" size="sm" className="self-start" onClick={regenerate} disabled={isSubmitting}>
        {t('auth:recoveryCodesRegenerateAction')}
      </Button>
    </section>
  )
}
