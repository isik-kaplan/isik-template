import { CONFIG } from '@/config/public'

import { isLocalDevHost } from './isLocalDevHost'
import { getRequestOrigin } from '@isikk/core/next/request'

/** This deployment's origin as a request reached it, on the bare domain or admin.; any other host falls back to
 *  the bare domain, so a request cannot point server-side fetches elsewhere. */
export function requestOrigin(requestHeaders: Headers): string {
  // Of a hostname's characters, only '.' needs escaping.
  const domain = new RegExp(`^(admin\\.)?${CONFIG.DOMAIN.replaceAll('.', '\\.')}(:\\d+)?$`, 'i')
  return getRequestOrigin(requestHeaders, { isLocalDevHost, allowedHosts: [domain], fallbackHost: CONFIG.DOMAIN })
}
