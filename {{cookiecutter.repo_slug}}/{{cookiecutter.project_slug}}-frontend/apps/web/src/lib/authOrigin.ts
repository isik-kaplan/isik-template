/** The auth.<domain> origin from the browser's location; getRequestOrigin() is server-only. */
export function authOrigin(): string {
  return window.location.origin.replace('://', '://auth.')
}
