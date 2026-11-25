import { installCrypto } from '@/lib/crypto'

import { getRandomValues, randomUUID } from 'expo-crypto'

jest.mock('expo-crypto', () => ({ getRandomValues: jest.fn(), randomUUID: jest.fn() }))

describe('installCrypto', () => {
  it("gives a runtime without Web Crypto expo-crypto's", () => {
    const runtime: { crypto?: unknown } = {}
    installCrypto(runtime)
    expect(runtime.crypto).toEqual({ getRandomValues, randomUUID })
    // Left replaceable, for a fuller polyfill loaded later.
    expect(Object.getOwnPropertyDescriptor(runtime, 'crypto')?.configurable).toBe(true)
  })

  it('leaves a runtime that has its own alone', () => {
    const own = { randomUUID: () => 'own' }
    const runtime: { crypto?: unknown } = { crypto: own }
    installCrypto(runtime)
    expect(runtime.crypto).toBe(own)
  })

  it('installs itself on a global object without Web Crypto when loaded', () => {
    const node = Object.getOwnPropertyDescriptor(globalThis, 'crypto')
    delete (globalThis as { crypto?: unknown }).crypto
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      jest.isolateModules(() => require('@/lib/crypto'))
      expect(globalThis.crypto).toEqual({ getRandomValues, randomUUID })
    } finally {
      Object.defineProperty(globalThis, 'crypto', node!)
    }
  })
})
