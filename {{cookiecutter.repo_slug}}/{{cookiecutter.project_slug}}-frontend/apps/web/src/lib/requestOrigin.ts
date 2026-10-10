import { CONFIG } from '@/config/public'

import { isLocalDevHost } from './isLocalDevHost'
import { getRequestOrigin } from '@isikk/core/next/request'

/** This deployment's own origin as a request reached it, for the URLs a server render fetches. Only the
 *  configured domain is taken from the request, on any port; another host falls back to the domain
 *  rather than pointing a server-side fetch wherever the request said. */
export function requestOrigin(requestHeaders: Headers): string {
  // A hostname holds nothing but letters, digits, '-' and '.', and only '.' means anything in a pattern.
  const domain = new RegExp(`^${CONFIG.DOMAIN.replaceAll('.', '\\.')}(:\\d+)?$`, 'i')
  try {
    return getRequestOrigin(requestHeaders, { isLocalDevHost, allowedHosts: [domain] })
  } catch {
    return getRequestOrigin(new Headers({ host: CONFIG.DOMAIN }), { isLocalDevHost })
  }
}
