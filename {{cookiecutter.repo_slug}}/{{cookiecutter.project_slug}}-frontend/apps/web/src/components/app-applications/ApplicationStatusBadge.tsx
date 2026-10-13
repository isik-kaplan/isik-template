import { Badge } from '@/components/base/badge'

import type { Approval } from '@/lib/applicationApproval'

const VARIANTS = {
  approved: 'default',
  pending: 'secondary',
  disabled: 'outline',
  withdrawn: 'destructive',
} as const

/** Where an application stands, at a glance. */
export function ApplicationStatusBadge({ approval, label }: { approval: Approval; label: string }) {
  return <Badge variant={VARIANTS[approval]}>{label}</Badge>
}
