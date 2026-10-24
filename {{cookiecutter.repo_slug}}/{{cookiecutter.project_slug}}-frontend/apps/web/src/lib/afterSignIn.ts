import { CONFIG } from '@/config/public'

import { getSafeRedirect } from '@isikk/core/next/request'

// The backend's OAuth authorize endpoint: the one place off this site signing in may return to.
export const OAUTH_AUTHORIZE_PATH = '/o/authorize/'

function isPendingAuthorizeRequest(url: URL): boolean {
  return url.host === `auth.${CONFIG.DOMAIN}` && url.pathname === OAUTH_AUTHORIZE_PATH
}

/** A path on this site or a pending authorize request; anything else is '/', so a crafted link goes nowhere. */
export function afterSignIn(next: unknown): string {
  return getSafeRedirect(next, { allow: isPendingAuthorizeRequest })
}
