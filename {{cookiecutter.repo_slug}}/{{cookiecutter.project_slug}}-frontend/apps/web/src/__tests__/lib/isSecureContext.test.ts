import { isSecureContext } from '@/lib/isSecureContext'

import { afterEach, describe, expect, it, vi } from 'vitest'

describe('isSecureContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("answers the browser's own verdict either way", () => {
    vi.stubGlobal('isSecureContext', true)
    expect(isSecureContext()).toBe(true)

    vi.stubGlobal('isSecureContext', false)
    expect(isSecureContext()).toBe(false)
  })

  it('answers false where there is no window at all, as in a server render', () => {
    vi.stubGlobal('window', undefined)

    expect(isSecureContext()).toBe(false)
  })
})
