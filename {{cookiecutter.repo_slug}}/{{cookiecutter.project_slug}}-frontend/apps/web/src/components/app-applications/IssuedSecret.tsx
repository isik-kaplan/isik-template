'use client'

import { useClientTranslation } from '@/i18n/client'

/** The client secret, in the one answer that carries it: it is stored hashed, so this is the only copy. */
export function IssuedSecret({ clientId, secret }: { clientId: string; secret: string }) {
  const { t } = useClientTranslation(['auth'])

  return (
    <div role="status" className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <p className="font-semibold">{t('auth:registerApplicationSecretTitle')}</p>
      <p className="text-muted-foreground">{t('auth:registerApplicationSecretHint')}</p>
      <dl className="flex flex-col gap-1">
        <dt className="text-muted-foreground">{t('auth:applicationClientId')}</dt>
        <dd className="font-mono break-all">{clientId}</dd>
        <dt className="text-muted-foreground">{t('auth:registerApplicationSecretLabel')}</dt>
        <dd className="font-mono break-all">{secret}</dd>
      </dl>
    </div>
  )
}
