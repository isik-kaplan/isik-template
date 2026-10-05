import { PROVE_PATH, provePath, safeNext } from '@/lib/reauthentication'

import { test } from '@fast-check/vitest'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

describe('safeNext', () => {
  it.each([
    ['/profile/emails?tab=1', '/profile/emails?tab=1'],
    ['/', '/'],
    [undefined, '/'],
    ['', '/'],
    ['https://elsewhere.example/steal', '/'],
    ['//elsewhere.example/steal', '/'],
    ['/\\elsewhere.example/steal', '/'],
    ['profile', '/'],
  ])('keeps %j only when it is a path on this site', (next, expected) => {
    expect(safeNext(next)).toBe(expected)
  })

  test.prop([fc.string()])('never answers with anything a browser would read as another site', (next) => {
    const safe = safeNext(next)

    expect(safe.startsWith('/')).toBe(true)
    expect(safe.startsWith('//') || safe.startsWith('/\\')).toBe(false)
  })
})

describe('provePath', () => {
  it('sends somebody to the prove page with where to come back to', () => {
    expect(provePath('/profile/emails?tab=1')).toBe(`${PROVE_PATH}?next=%2Fprofile%2Femails%3Ftab%3D1`)
  })

  it('never carries a way off the site', () => {
    expect(provePath('https://elsewhere.example')).toBe(`${PROVE_PATH}?next=%2F`)
  })
})
