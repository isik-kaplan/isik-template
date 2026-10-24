import { CONFIG } from '@/config/public'

import { isLocalDevHost } from './isLocalDevHost'
import { getRequestOrigin } from '@isikk/core/next/request'

/** This deployment's origin as a request reached it; a host other than the configured domain falls back to
 *  it, so a request cannot point server-side fetches elsewhere. */
export function requestOrigin(requestHeaders: Headers): string {
  // Of a hostname's characters, only '.' needs escaping.
  const domain = new RegExp(`^${CONFIG.DOMAIN.replaceAll('.', '\\.')}(:\\d+)?$`, 'i')
  return getRequestOrigin(requestHeaders, { isLocalDevHost, allowedHosts: [domain], fallbackHost: CONFIG.DOMAIN })
}
