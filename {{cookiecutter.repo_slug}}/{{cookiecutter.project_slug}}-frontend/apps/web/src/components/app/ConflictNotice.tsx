'use client'

import { Button } from '@/components/base/button'

import { useClientTranslation } from '@/i18n/client'

/** A 412: somebody else saved since the form opened. Take theirs or overwrite - neither once it was deleted. */
export function ConflictNotice({
  conflict,
  takeTheirs,
  keepMine,
  disabled,
}: {
  conflict: { current: unknown } | null
  takeTheirs: () => void
  keepMine: () => Promise<boolean>
  disabled?: boolean
}) {
  const { t } = useClientTranslation(['common'])
  if (!conflict?.current) return null

  return (
    <div role="alert" className="flex flex-col gap-2 border border-destructive p-3 text-sm">
      <p>{t('common:conflictTitle')}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={takeTheirs}>
          {t('common:conflictTakeTheirs')}
        </Button>
        <Button type="button" variant="destructive" disabled={disabled} onClick={() => keepMine()}>
          {t('common:conflictKeepMine')}
        </Button>
      </div>
    </div>
  )
}
