/** The api.<domain> origin from the browser's location, like authOrigin(). */
export function apiOrigin(): string {
  return window.location.origin.replace('://', '://api.')
}
