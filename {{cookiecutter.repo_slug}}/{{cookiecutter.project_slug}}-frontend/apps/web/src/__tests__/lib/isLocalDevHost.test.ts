import { isLocalDevHost } from '@/lib/isLocalDevHost'

import { describe, expect, it } from 'vitest'

describe('isLocalDevHost', () => {
  it('recognizes the .test convention', () => {
    expect(isLocalDevHost('myproject.test')).toBe(true)
  })

  it('recognizes .localhost', () => {
    expect(isLocalDevHost('myproject.localhost')).toBe(true)
  })

  it('rejects a real domain', () => {
    expect(isLocalDevHost('example.com')).toBe(false)
  })

  it('only matches a suffix, not a substring in the middle', () => {
    expect(isLocalDevHost('test.example.com')).toBe(false)
  })
})
