/** The api.<domain> origin, computed from wherever the browser currently is - same pattern as
 * authOrigin(), for the same reason: client components can't call the server-only
 * getRequestOrigin(). */
export function apiOrigin(): string {
  return window.location.origin.replace('://', '://api.')
}
