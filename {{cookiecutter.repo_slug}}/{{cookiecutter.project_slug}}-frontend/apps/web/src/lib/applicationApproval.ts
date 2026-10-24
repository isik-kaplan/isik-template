import type { Translate } from '@/i18n/config'

import type { ApiType } from '@{{ cookiecutter.repo_slug }}/api'

export type Approval = ApiType<'ApplicationApproval'>

/** Spelled out per state: i18next-parser only finds a literal key. */
export function approvalLabel(approval: Approval, t: Translate): string {
  const labels: Record<Approval, string> = {
    pending: t('auth:applicationApprovalPending'),
    approved: t('auth:applicationApprovalApproved'),
    withdrawn: t('auth:applicationApprovalWithdrawn'),
    disabled: t('auth:applicationApprovalDisabled'),
  }
  return labels[approval]
}
