import { echoKeys } from '@/__tests__/support/translate'
import { approvalLabel } from '@/lib/applicationApproval'

import { describe, expect, it } from 'vitest'

describe('approvalLabel', () => {
  it.each([
    ['pending', 'auth:applicationApprovalPending'],
    ['approved', 'auth:applicationApprovalApproved'],
    ['withdrawn', 'auth:applicationApprovalWithdrawn'],
    ['disabled', 'auth:applicationApprovalDisabled'],
  ] as const)('words %s', (approval, expected) => {
    expect(approvalLabel(approval, echoKeys)).toBe(expected)
  })
})
