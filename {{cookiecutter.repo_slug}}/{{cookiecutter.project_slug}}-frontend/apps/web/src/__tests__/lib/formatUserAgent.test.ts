import { formatUserAgent } from '@/lib/formatUserAgent'

import { fc, test } from '@fast-check/vitest'
import { describe, expect, it } from 'vitest'

describe('formatUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Chrome on Windows',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0', 'Firefox on Linux'],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/131.0 Mobile/15E148',
      'Chrome on iOS',
    ],
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['curl/8.7.1', 'curl'],
  ])('reads %s as %s', (userAgent, expected) => {
    expect(formatUserAgent(userAgent).name).toBe(expected)
  })

  it('picks Edge over the Chrome token it also carries', () => {
    const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

    expect(formatUserAgent(edge).name).toBe('Edge on Windows')
  })

  it('picks Opera over the Chrome token it also carries', () => {
    const opera = 'Mozilla/5.0 (Windows NT 10.0) Chrome/131.0.0.0 Safari/537.36 OPR/117.0.0.0'

    expect(formatUserAgent(opera).name).toBe('Opera on Windows')
  })

  it('names the platform alone when the client is unrecognised', () => {
    expect(formatUserAgent('SomeBot/2.0 (Windows NT 10.0)').name).toBe('Windows')
  })

  it('names the client alone when the platform is unrecognised', () => {
    expect(formatUserAgent('curl/8.7.1 something-else').name).toBe('curl')
  })

  it('returns null for an empty string, so the caller can say Unknown device', () => {
    expect(formatUserAgent('   ').name).toBeNull()
  })

  it('truncates an unreadable string rather than blowing out the row', () => {
    const gibberish = 'x'.repeat(120)
    const { name } = formatUserAgent(gibberish)

    expect(name).toHaveLength(41)
    expect(name?.endsWith('…')).toBe(true)
  })

  it('keeps a short unreadable string intact', () => {
    expect(formatUserAgent('my-client/1.0').name).toBe('my-client/1.0')
  })

  it('keeps a 40-character unreadable string intact, right at the truncation boundary', () => {
    const exactlyForty = 'x'.repeat(40)

    expect(formatUserAgent(exactlyForty).name).toBe(exactlyForty)
  })

  it('reads CrOS as ChromeOS', () => {
    const chromeOs = 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'

    expect(formatUserAgent(chromeOs).name).toBe('Chrome on ChromeOS')
  })

  it('always keeps the raw string available for the title attribute', () => {
    expect(formatUserAgent('  curl/8.7.1  ').raw).toBe('curl/8.7.1')
  })

  test.prop([fc.string()])('never throws and never returns an over-long name', (userAgent) => {
    const { name } = formatUserAgent(userAgent)

    expect(name === null || name.length <= 41).toBe(true)
  })
})
