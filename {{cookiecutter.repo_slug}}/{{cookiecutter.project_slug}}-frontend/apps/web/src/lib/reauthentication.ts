export const PROVE_PATH = '/auth/prove'

// Set by the backend's re-authentication gate on the one refusal that means "prove it is you, then
// retry" - a status code alone cannot tell that apart from "you are not allowed".
export const REAUTHENTICATION_REQUIRED_HEADER = 'X-Reauthentication-Required'

/** Where somebody comes back to once they have proved it - only a path on this site, so a crafted
 * link cannot use the prove page to send anybody elsewhere. */
export function safeNext(next: string | undefined): string {
  return next?.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/'
}

export function provePath(next: string): string {
  return `${PROVE_PATH}?next=${encodeURIComponent(safeNext(next))}`
}
