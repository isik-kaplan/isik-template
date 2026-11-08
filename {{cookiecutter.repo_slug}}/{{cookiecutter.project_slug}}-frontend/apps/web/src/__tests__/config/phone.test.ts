import { PHONE } from '@/config/phone'

import { describe, expect, it } from 'vitest'

describe('PHONE', () => {
  it('is one of the options the project could be generated with', () => {
    expect(['none', 'optional', 'required']).toContain(PHONE)
  })
})
