import { CONFIG } from '@/config/public'

import { getSafeRedirect } from '@isikk/core/next/request'

// The backend's OAuth authorize endpoint, on the auth host: the one place outside this site that sends
// somebody here to sign in, and so the one place outside it that signing in may send them back to.
export const OAUTH_AUTHORIZE_PATH = '/o/authorize/'

/** Where signing in sends somebody next: a path on this site, or an application's authorize request
 *  they were in the middle of. Anything else is '/', so a crafted link cannot send anybody elsewhere. */
export function afterSignIn(next: unknown): string {
  if (typeof next === 'string' && URL.canParse(next)) {
    const url = new URL(next)
    const onTheAuthHost = ['http:', 'https:'].includes(url.protocol) && url.host === `auth.${CONFIG.DOMAIN}`
    if (onTheAuthHost && url.pathname === OAUTH_AUTHORIZE_PATH) return url.href
  }
  return getSafeRedirect(next)
}
