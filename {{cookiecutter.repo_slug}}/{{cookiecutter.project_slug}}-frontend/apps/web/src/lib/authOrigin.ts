import { siblingOrigin } from './hosts'

/** The auth.<domain> origin from the browser's location; getRequestOrigin() is server-only. */
export function authOrigin(): string {
  return siblingOrigin(window.location.origin, 'auth')
}
