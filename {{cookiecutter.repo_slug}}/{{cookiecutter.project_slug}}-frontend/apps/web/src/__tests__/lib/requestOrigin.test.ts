import { requestOrigin } from '@/lib/requestOrigin'

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/config/public', () => ({ CONFIG: { DOMAIN: 'example.test' } }))

const originOf = (headers: Record<string, string>) => requestOrigin(new Headers(headers))

describe('requestOrigin', () => {
  it('takes the configured domain from the request', () => {
    expect(originOf({ host: 'example.test' })).toBe('http://example.test')
  })

  it('keeps the port the request reached it on', () => {
    expect(originOf({ host: 'example.test:8443', 'x-forwarded-proto': 'https' })).toBe('https://example.test:8443')
  })

  it('matches the domain whatever its case', () => {
    expect(originOf({ host: 'EXAMPLE.test' })).toBe('http://EXAMPLE.test')
  })

  it('falls back to the configured domain for a foreign forwarded host', () => {
    expect(originOf({ host: 'example.test', 'x-forwarded-host': '169.254.169.254.nip.io' })).toBe('http://example.test')
  })

  it.each([
    ['a host with more before the domain', 'evil-example.test'],
    ['a host with more after the domain', 'example.test.evil.com'],
    ['a host where a dot is any other character', 'exampleXtest'],
    ['a port that is not a number', 'example.test:x'],
  ])('falls back for %s', (_label, host) => {
    expect(originOf({ host, 'x-forwarded-proto': 'https' })).toBe('http://example.test')
  })

  it('falls back when the request names no host at all', () => {
    expect(originOf({})).toBe('http://example.test')
  })
})
