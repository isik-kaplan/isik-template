import { getSafeRedirect } from '@isikk/core/next/request'

export const PROVE_PATH = '/auth/prove'

// Marks "prove it is you, then retry", which a status code alone can't tell from "not allowed".
export const REAUTHENTICATION_REQUIRED_HEADER = 'X-Reauthentication-Required'

/** Only a path on this site, so a crafted link can't use the prove page to send anybody elsewhere. */
export function safeNext(next: string | undefined): string {
  return getSafeRedirect(next)
}

export function provePath(next: string): string {
  return `${PROVE_PATH}?next=${encodeURIComponent(safeNext(next))}`
}
