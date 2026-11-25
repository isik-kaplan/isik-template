import { getRandomValues, randomUUID } from 'expo-crypto'

// Hermes has no Web Crypto, and the API clients draw their idempotency keys from it.
export function installCrypto(target: { crypto?: unknown } = globalThis) {
  if (target.crypto) return
  Object.defineProperty(target, 'crypto', { value: { getRandomValues, randomUUID }, configurable: true })
}

installCrypto()
