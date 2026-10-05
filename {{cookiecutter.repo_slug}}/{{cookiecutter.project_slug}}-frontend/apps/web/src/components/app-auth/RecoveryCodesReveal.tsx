'use client'

import { useClientTranslation } from '@/i18n/client'

/** A freshly generated set, on the one screen it can be read on - MFA_RECOVERY_CODES_SHOW_ONCE. */
export function RecoveryCodesReveal({ codes }: { codes: string[] }) {
  const { t } = useClientTranslation(['auth'])

  return (
    <div
      className="flex flex-col gap-2 border border-border p-3"
      role="region"
      aria-label={t('auth:recoveryCodesTitle')}
    >
      <p className="text-sm font-medium">{t('auth:recoveryCodesTitle')}</p>
      <p className="text-sm text-muted-foreground">{t('auth:recoveryCodesHint')}</p>
      <ul className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="recovery-codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
    </div>
  )
}
