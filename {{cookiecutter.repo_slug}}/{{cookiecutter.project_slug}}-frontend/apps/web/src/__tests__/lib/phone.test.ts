import { E164 } from '@/lib/phone'

import { describe, expect, it } from 'vitest'

describe('E164', () => {
  it.each(['+14155550123', '+447700900123', '+12'])('takes %s', (number) => {
    expect(E164.test(number)).toBe(true)
  })

  it.each(['14155550123', '+04155550123', '+1', '+1415555012345678', 'x+14155550123', '+14155550123x', '+1 415'])(
    'refuses %s',
    (number) => {
      expect(E164.test(number)).toBe(false)
    }
  )
})
