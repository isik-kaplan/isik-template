import { cn, getInitials } from '@/lib/utils'

import { describe, expect, it } from 'vitest'

describe('cn', () => {
  it('merges class names, letting a later Tailwind class win over an earlier conflicting one', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('drops falsy inputs', () => {
    expect(cn('a', false && 'b', undefined, null, 'c')).toBe('a c')
  })
})

describe('getInitials', () => {
  it('takes the first letter of the first and last name parts', () => {
    expect(getInitials('Jane Doe')).toBe('JD')
  })

  it('treats hyphens, dots and underscores as separators too', () => {
    expect(getInitials('jane-doe')).toBe('JD')
    expect(getInitials('jane.doe')).toBe('JD')
    expect(getInitials('jane_doe')).toBe('JD')
  })

  it('collapses repeated separators instead of producing an empty part', () => {
    expect(getInitials('jane  --  doe')).toBe('JD')
  })

  it('falls back to the first two characters for a single-word name', () => {
    expect(getInitials('jane')).toBe('JA')
  })

  it('returns an empty string for input with no name parts at all', () => {
    expect(getInitials('   ')).toBe('')
    expect(getInitials('')).toBe('')
  })

  it('uses the middle name neither at the start nor the end for a three-part name', () => {
    expect(getInitials('Jane Middle Doe')).toBe('JD')
  })
})
