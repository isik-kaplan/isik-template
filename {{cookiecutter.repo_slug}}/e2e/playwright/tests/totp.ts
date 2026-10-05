import { createHmac } from 'node:crypto'

// RFC 6238 in a dozen lines rather than a dependency in the runner image: the suite only needs the
// code an authenticator app would show.
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PERIOD = 30

function base32Decode(secret: string): Buffer {
  let bits = ''
  for (const character of secret.replace(/=+$/, '').toUpperCase()) {
    const index = BASE32.indexOf(character)
    if (index === -1) throw new Error(`Not base32: ${character}`)
    bits += index.toString(2).padStart(5, '0')
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)))
}

function totpCode(secret: string, atSeconds: number): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(atSeconds / PERIOD)))
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(binary).padStart(6, '0')
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * A code with enough of its window left to survive the round trip, and never one already spent:
 * allauth accepts only the current step and refuses a code it has seen, so a second login in the
 * same 30 seconds has to wait for the next one.
 */
export async function freshTotpCode(secret: string, spent: string[] = []): Promise<string> {
  for (;;) {
    const now = Date.now() / 1000
    const secondsLeft = PERIOD - (now % PERIOD)
    const code = totpCode(secret, now)
    if (secondsLeft >= 5 && !spent.includes(code)) return code
    await sleep(secondsLeft * 1000 + 250)
  }
}
