/** The auth.<domain> origin, computed from wherever the browser currently is - client components
 * call this directly instead of going through getRequestOrigin() (a server-only helper). */
export function authOrigin(): string {
  return window.location.origin.replace('://', '://auth.')
}
