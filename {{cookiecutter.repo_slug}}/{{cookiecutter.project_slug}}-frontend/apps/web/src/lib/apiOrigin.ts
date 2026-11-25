import { siblingOrigin } from './hosts'

/** The api.<domain> origin from the browser's location, like authOrigin(). */
export function apiOrigin(): string {
  return siblingOrigin(window.location.origin, 'api')
}
