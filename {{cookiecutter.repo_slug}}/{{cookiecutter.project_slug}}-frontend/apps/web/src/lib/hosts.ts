import { CONFIG } from '@/config/public'

export type Sibling = 'api' | 'auth' | 'admin'

/** `origin`'s neighbour on the same scheme and port: api., auth. or admin. beside the bare domain, or the bare
 *  domain itself for null. The admin is served from this app too, so its origin counts as the bare one. */
export function siblingOrigin(origin: string, sibling: Sibling | null): string {
  const url = new URL(origin)
  const bare = url.hostname.replace(/^admin\./, '')
  url.hostname = sibling ? `${sibling}.${bare}` : bare
  return url.origin
}

/** Whether a Host header names admin.<domain>, port or not. */
export function isAdminHost(host: string | null): boolean {
  return host?.split(':')[0].toLowerCase() === `admin.${CONFIG.DOMAIN}`.toLowerCase()
}
