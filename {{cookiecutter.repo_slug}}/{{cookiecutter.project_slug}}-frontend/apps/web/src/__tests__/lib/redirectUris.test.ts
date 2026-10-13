import { redirectUrisFrom } from '@/lib/redirectUris'

import { describe, expect, it } from 'vitest'

describe('redirectUrisFrom', () => {
  it('reads one per line, trimmed, leaving out the blank ones', () => {
    expect(redirectUrisFrom(' https://a.test/cb \n\n  \nhttps://a.test/other')).toEqual([
      'https://a.test/cb',
      'https://a.test/other',
    ])
  })

  it('reads nothing typed as none', () => {
    expect(redirectUrisFrom('')).toEqual([])
  })
})
