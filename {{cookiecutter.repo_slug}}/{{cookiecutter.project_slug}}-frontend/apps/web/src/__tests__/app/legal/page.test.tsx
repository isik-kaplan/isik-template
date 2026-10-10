import LegalIndexPage from '@/app/legal/page'

import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`)
  },
}))

describe('LegalIndexPage', () => {
  it('sends a bare /legal to the first document', () => {
    expect(() => LegalIndexPage()).toThrow('REDIRECT:/legal/terms-of-service')
  })
})
