import { echoKeys } from '@/__tests__/support/translate'
import { DEVICE_GRANT, grantLabel } from '@/lib/applicationGrant'

import { describe, expect, it } from 'vitest'

describe('grantLabel', () => {
  it.each([
    ['authorization-code', 'auth:applicationGrantRedirect'],
    ['urn:ietf:params:oauth:grant-type:device_code', 'auth:applicationGrantDevice'],
  ] as const)('words %s', (grant, expected) => {
    expect(grantLabel(grant, echoKeys)).toBe(expected)
  })

  it('names the device grant as RFC 8628 does', () => {
    expect(DEVICE_GRANT).toBe('urn:ietf:params:oauth:grant-type:device_code')
  })
})
